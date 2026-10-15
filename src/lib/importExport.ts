import type { ExportFile, Folder, Prompt } from '../types';
import { keys } from './storage';
import { nextOrder, type FolderMap } from './tree';
import { COLOR_NAMES, normalizeTags, uid } from './utils';

export function buildExport(folders: FolderMap, prompts: Record<string, Prompt>): ExportFile {
  return {
    app: 'PromptVault',
    version: 1,
    exportedAt: new Date().toISOString(),
    folders: Object.values(folders),
    prompts: Object.values(prompts),
  };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface MergeReport {
  added: number;
  updated: number;
  skipped: number;
  folders: number;
  set: Record<string, unknown>;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && isFinite(v) ? v : fallback);

/**
 * Merges imported data into the existing library without destroying anything:
 * - folders match by id, then by name under the same parent; unmatched folders are created;
 * - prompts with a known id keep whichever copy was edited last (usage stats are combined);
 * - prompts whose title + content already exist are skipped as duplicates;
 * - everything else is added.
 * Also accepts a bare array of `{ title, content }` objects.
 */
export function mergeImport(
  raw: unknown,
  folders: FolderMap,
  prompts: Record<string, Prompt>,
): MergeReport {
  const data = Array.isArray(raw) ? { folders: [], prompts: raw } : (raw as Partial<ExportFile>);
  if (!data || typeof data !== 'object' || !Array.isArray(data.prompts)) {
    throw new Error('Not a PromptVault export (expected a "prompts" array).');
  }
  const now = Date.now();
  const set: Record<string, unknown> = {};
  const nextFolders: FolderMap = { ...folders };
  const idMap = new Map<string, string>(); // imported folder id -> local id
  let folderCount = 0;

  // Folders: parents first so children can resolve their new parent id.
  const inFolders = (Array.isArray(data.folders) ? data.folders : []) as Partial<Folder>[];
  const pending = [...inFolders];
  let guard = pending.length * pending.length + 1;
  while (pending.length && guard-- > 0) {
    const f = pending.shift()!;
    if (!f.id || !f.name) continue;
    if (f.parentId && !idMap.has(f.parentId) && pending.some((p) => p.id === f.parentId)) {
      pending.push(f);
      continue;
    }
    const parentId = f.parentId ? (idMap.get(f.parentId) ?? null) : null;
    const byId = nextFolders[f.id];
    const byName = Object.values(nextFolders).find(
      (x) => x.parentId === parentId && x.name.toLowerCase() === str(f.name).toLowerCase(),
    );
    const match = byId ?? byName;
    if (match) {
      idMap.set(f.id, match.id);
      continue;
    }
    const folder: Folder = {
      id: uid(),
      name: str(f.name, 'Imported'),
      emoji: f.emoji ? str(f.emoji) : undefined,
      color: COLOR_NAMES.includes(f.color as Folder['color']) ? (f.color as Folder['color']) : 'slate',
      parentId,
      order: nextOrder(Object.values(nextFolders).filter((x) => x.parentId === parentId)),
      createdAt: num(f.createdAt, now),
      updatedAt: now,
    };
    nextFolders[folder.id] = folder;
    idMap.set(f.id, folder.id);
    set[keys.folder(folder.id)] = folder;
    folderCount++;
  }

  const fingerprint = (p: { title: string; content: string }) =>
    `${p.title.trim().toLowerCase()}\u0000${p.content.trim()}`;
  const existingPrints = new Set(Object.values(prompts).map(fingerprint));
  const orderBy = new Map<string | null, number>();
  const takeOrder = (folderId: string | null) => {
    if (!orderBy.has(folderId)) {
      orderBy.set(folderId, nextOrder(Object.values(prompts).filter((p) => p.folderId === folderId)));
    }
    const o = orderBy.get(folderId)!;
    orderBy.set(folderId, o + 1);
    return o;
  };

  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const item of data.prompts as Partial<Prompt>[]) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const content = str(item.content);
    const title = str(item.title).trim() || content.slice(0, 50).trim();
    if (!content.trim() && !title) {
      skipped++;
      continue;
    }
    const folderId = item.folderId ? (idMap.get(item.folderId) ?? (nextFolders[item.folderId] ? item.folderId : null)) : null;
    const local = item.id ? prompts[item.id] : undefined;

    if (local) {
      const incomingNewer = num(item.updatedAt) > local.updatedAt;
      const merged: Prompt = {
        ...local,
        ...(incomingNewer
          ? {
              title,
              content,
              tags: normalizeTags(Array.isArray(item.tags) ? item.tags.map(String) : []),
              folderId,
              monospace: !!item.monospace,
              updatedAt: num(item.updatedAt, now),
            }
          : {}),
        favorite: local.favorite || !!item.favorite,
        usageCount: Math.max(local.usageCount, num(item.usageCount)),
        lastUsedAt: Math.max(local.lastUsedAt ?? 0, num(item.lastUsedAt)) || null,
      };
      if (JSON.stringify(merged) === JSON.stringify(local)) skipped++;
      else {
        set[keys.prompt(local.id)] = merged;
        updated++;
      }
      continue;
    }

    const print = fingerprint({ title, content });
    if (existingPrints.has(print)) {
      skipped++;
      continue;
    }
    existingPrints.add(print);
    const prompt: Prompt = {
      id: item.id && typeof item.id === 'string' ? item.id : uid(),
      title,
      content,
      folderId,
      tags: normalizeTags(Array.isArray(item.tags) ? item.tags.map(String) : []),
      favorite: !!item.favorite,
      usageCount: num(item.usageCount),
      lastUsedAt: item.lastUsedAt ? num(item.lastUsedAt) : null,
      createdAt: num(item.createdAt, now),
      updatedAt: num(item.updatedAt, now),
      order: takeOrder(folderId),
      monospace: !!item.monospace,
      sourceUrl: item.sourceUrl ? str(item.sourceUrl) : undefined,
    };
    set[keys.prompt(prompt.id)] = prompt;
    added++;
  }

  return { added, updated, skipped, folders: folderCount, set };
}
