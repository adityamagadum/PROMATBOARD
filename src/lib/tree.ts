import type { Folder } from '../types';

export type FolderMap = Record<string, Folder>;

export function childrenOf(folders: FolderMap, parentId: string | null): Folder[] {
  return Object.values(folders)
    .filter((f) => f.parentId === parentId)
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
}

/** All descendant ids of a folder (not including itself). */
export function descendantIds(folders: FolderMap, id: string): string[] {
  const out: string[] = [];
  const stack = [id];
  const all = Object.values(folders);
  while (stack.length) {
    const cur = stack.pop()!;
    for (const f of all) {
      if (f.parentId === cur) {
        out.push(f.id);
        stack.push(f.id);
      }
    }
  }
  return out;
}

/** Root-first ancestry, including the folder itself. */
export function folderPath(folders: FolderMap, id: string | null): Folder[] {
  const out: Folder[] = [];
  let cur = id ? folders[id] : undefined;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? folders[cur.parentId] : undefined;
  }
  return out;
}

/** Depth-first flattened tree, used by folder pickers. */
export function flattenTree(
  folders: FolderMap,
  parentId: string | null = null,
  depth = 0,
): { folder: Folder; depth: number }[] {
  return childrenOf(folders, parentId).flatMap((f) => [
    { folder: f, depth },
    ...flattenTree(folders, f.id, depth + 1),
  ]);
}

export const nextOrder = (items: { order: number }[]) =>
  items.reduce((m, i) => Math.max(m, i.order), -1) + 1;
