import { create } from 'zustand';
import { DEFAULT_SETTINGS, type Folder, type Prompt, type Settings } from '../types';
import { keys, storage } from './storage';
import { examples } from './seed';
import { descendantIds, nextOrder, type FolderMap } from './tree';
import { normalizeTags, uid } from './utils';

export type Undo = () => Promise<void>;

type PromptInput = Pick<Prompt, 'title' | 'content'> & Partial<Omit<Prompt, 'title' | 'content'>>;
type FolderInput = Pick<Folder, 'name'> & Partial<Omit<Folder, 'name'>>;

interface VaultState {
  ready: boolean;
  folders: FolderMap;
  prompts: Record<string, Prompt>;
  settings: Settings;

  init(): Promise<void>;
  /** Applies a batch of key writes/removals locally and to storage; returns an undo. */
  commit(set: Record<string, unknown>, remove?: string[]): Promise<Undo>;

  savePrompt(input: PromptInput): Promise<Prompt>;
  deletePrompt(id: string): Promise<Undo>;
  toggleFavorite(id: string): Promise<void>;
  markUsed(id: string): Promise<void>;
  movePrompt(id: string, folderId: string | null): Promise<void>;
  reorderPrompts(orderedIds: string[]): Promise<void>;

  saveFolder(input: FolderInput): Promise<Folder>;
  deleteFolder(id: string): Promise<Undo>;
  setFolderCollapsed(id: string, collapsed: boolean): Promise<void>;

  updateSettings(patch: Partial<Settings>): Promise<void>;
}

/** Applies raw storage changes (key -> value | undefined) to the in-memory maps. */
function applyChanges(
  state: Pick<VaultState, 'folders' | 'prompts' | 'settings'>,
  changes: Record<string, unknown>,
) {
  let folders = state.folders;
  let prompts = state.prompts;
  let settings = state.settings;
  for (const [k, v] of Object.entries(changes)) {
    if (k.startsWith('p:')) {
      const id = k.slice(2);
      if (prompts === state.prompts) prompts = { ...prompts };
      if (v === undefined) delete prompts[id];
      else prompts[id] = v as Prompt;
    } else if (k.startsWith('f:')) {
      const id = k.slice(2);
      if (folders === state.folders) folders = { ...folders };
      if (v === undefined) delete folders[id];
      else folders[id] = v as Folder;
    } else if (k === keys.settings) {
      settings = { ...DEFAULT_SETTINGS, ...(v as Partial<Settings> | undefined) };
    }
  }
  return { folders, prompts, settings };
}

let unsubscribe: (() => void) | null = null;

/** Drops keys explicitly set to undefined so they don't clobber defaults when spread. */
const defined = <T extends object>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;

export const useVault = create<VaultState>()((set, get) => {
  /** Current stored value for a key, for undo snapshots. */
  const current = (k: string): unknown => {
    const s = get();
    if (k.startsWith('p:')) return s.prompts[k.slice(2)];
    if (k.startsWith('f:')) return s.folders[k.slice(2)];
    if (k === keys.settings) return s.settings;
    return undefined;
  };

  const commit: VaultState['commit'] = async (toSet, toRemove = []) => {
    const prev: Record<string, unknown> = {};
    for (const k of [...Object.keys(toSet), ...toRemove]) prev[k] = current(k);

    const local: Record<string, unknown> = { ...toSet };
    for (const k of toRemove) local[k] = undefined;
    set((s) => applyChanges(s, local));

    await Promise.all([storage.set(toSet), storage.remove(toRemove)]);

    return async () => {
      const restore: Record<string, unknown> = {};
      const drop: string[] = [];
      for (const [k, v] of Object.entries(prev)) {
        if (v === undefined) drop.push(k);
        else restore[k] = v;
      }
      await commit(restore, drop);
    };
  };

  const putPrompt = (p: Prompt) => commit({ [keys.prompt(p.id)]: p });

  return {
    ready: false,
    folders: {},
    prompts: {},
    settings: DEFAULT_SETTINGS,

    async init() {
      if (get().ready) return;
      const all = await storage.getAll();
      const state = applyChanges({ folders: {}, prompts: {}, settings: DEFAULT_SETTINGS }, all);
      set({ ...state, settings: { ...DEFAULT_SETTINGS, ...(all.settings as object) }, ready: true });

      // First launch: create the Examples folder once.
      if (!get().settings.seeded) {
        const seedSet: Record<string, unknown> = {};
        if (!Object.keys(get().prompts).length) {
          const ex = examples();
          ex.folders.forEach((f) => (seedSet[keys.folder(f.id)] = f));
          ex.prompts.forEach((p) => (seedSet[keys.prompt(p.id)] = p));
        }
        seedSet[keys.settings] = { ...get().settings, seeded: true };
        await commit(seedSet);
      }

      // Keep every open view (popup, side panel, tab) in sync.
      unsubscribe?.();
      unsubscribe = storage.onChanged((changes) => {
        const s = get();
        const patch: Record<string, unknown> = {};
        for (const [k, c] of Object.entries(changes)) {
          if (!(k.startsWith('p:') || k.startsWith('f:') || k === keys.settings)) continue;
          // Skip echoes of our own writes so cards don't re-render needlessly.
          if (JSON.stringify(current(k)) === JSON.stringify(c.newValue)) continue;
          patch[k] = c.newValue;
        }
        if (Object.keys(patch).length) set(applyChanges(s, patch));
      });
    },

    commit,

    async savePrompt(input) {
      const now = Date.now();
      const existing = input.id ? get().prompts[input.id] : undefined;
      const folderId = input.folderId === undefined ? (existing?.folderId ?? null) : input.folderId;
      const siblings = Object.values(get().prompts).filter((p) => p.folderId === folderId);
      const prompt: Prompt = {
        id: uid(),
        folderId,
        favorite: false,
        usageCount: 0,
        lastUsedAt: null,
        createdAt: now,
        order: nextOrder(siblings),
        ...existing,
        ...defined(input),
        // Moving to another folder puts the prompt at the end of that folder.
        ...(existing && existing.folderId !== folderId ? { order: nextOrder(siblings) } : {}),
        title: input.title.trim() || 'Untitled prompt',
        tags: normalizeTags(input.tags ?? existing?.tags ?? []),
        updatedAt: now,
      } as Prompt;
      await putPrompt(prompt);
      return prompt;
    },

    deletePrompt: (id) => commit({}, [keys.prompt(id), keys.vars(id)]),

    async toggleFavorite(id) {
      const p = get().prompts[id];
      if (p) await putPrompt({ ...p, favorite: !p.favorite });
    },

    async markUsed(id) {
      const p = get().prompts[id];
      if (p) await putPrompt({ ...p, usageCount: p.usageCount + 1, lastUsedAt: Date.now() });
    },

    async movePrompt(id, folderId) {
      const p = get().prompts[id];
      if (!p || p.folderId === folderId) return;
      const siblings = Object.values(get().prompts).filter((x) => x.folderId === folderId);
      await putPrompt({ ...p, folderId, order: nextOrder(siblings), updatedAt: Date.now() });
    },

    async reorderPrompts(orderedIds) {
      const prompts = get().prompts;
      const batch: Record<string, unknown> = {};
      orderedIds.forEach((id, i) => {
        const p = prompts[id];
        if (p && p.order !== i) batch[keys.prompt(id)] = { ...p, order: i };
      });
      if (Object.keys(batch).length) await commit(batch);
    },

    async saveFolder(input) {
      const now = Date.now();
      const existing = input.id ? get().folders[input.id] : undefined;
      const parentId = input.parentId === undefined ? (existing?.parentId ?? null) : input.parentId;
      const siblings = Object.values(get().folders).filter((f) => f.parentId === parentId);
      const folder: Folder = {
        id: uid(),
        color: 'violet',
        createdAt: now,
        order: nextOrder(siblings),
        ...existing,
        ...defined(input),
        parentId,
        name: input.name.trim() || 'Untitled folder',
        updatedAt: now,
      } as Folder;
      await commit({ [keys.folder(folder.id)]: folder });
      return folder;
    },

    async deleteFolder(id) {
      const { folders, prompts } = get();
      const folder = folders[id];
      if (!folder) return async () => {};
      const doomed = new Set([id, ...descendantIds(folders, id)]);
      // Prompts are never lost with a folder: they move up to the parent (or Unsorted).
      const target = folder.parentId;
      const siblings = Object.values(prompts).filter((p) => p.folderId === target);
      let order = nextOrder(siblings);
      const batch: Record<string, unknown> = {};
      for (const p of Object.values(prompts)) {
        if (p.folderId && doomed.has(p.folderId)) {
          batch[keys.prompt(p.id)] = { ...p, folderId: target, order: order++ };
        }
      }
      return commit(batch, [...doomed].map(keys.folder));
    },

    async setFolderCollapsed(id, collapsed) {
      const f = get().folders[id];
      if (f && !!f.collapsed !== collapsed) await commit({ [keys.folder(id)]: { ...f, collapsed } });
    },

    async updateSettings(patch) {
      await commit({ [keys.settings]: { ...get().settings, ...patch } });
    },
  };
});
