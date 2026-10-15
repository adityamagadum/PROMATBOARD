import { create } from 'zustand';
import type { Prompt, Surface, View } from '../types';

export interface Entry {
  /** Unique per rendered row (a prompt can appear in several sections on Home). */
  key: string;
  prompt: Prompt;
  section: string;
  titleMatches?: number[];
}

interface EditorState {
  promptId?: string;
  draft?: Partial<Prompt>;
}

interface UIState {
  view: View;
  query: string;
  activeKey: string | null;
  expanded: Record<string, boolean>;
  copiedId: string | null;
  drawerOpen: boolean;
  draggingId: string | null;
  editor: EditorState | null;
  folderDialog: { folderId?: string; parentId?: string | null } | null;
  varDialog: { promptId: string; mode: 'copy' | 'insert' } | null;
  settingsOpen: boolean;

  setView(v: View): void;
  setQuery(q: string): void;
  setActive(k: string | null): void;
  toggleExpanded(id: string): void;
  flashCopied(id: string): void;
  set(patch: Partial<UIState>): void;
}

export const useUI = create<UIState>()((set) => ({
  view: { kind: 'home' },
  query: '',
  activeKey: null,
  expanded: {},
  copiedId: null,
  drawerOpen: false,
  draggingId: null,
  editor: null,
  folderDialog: null,
  varDialog: null,
  settingsOpen: false,

  setView: (view) => set({ view, query: '', activeKey: null, drawerOpen: false }),
  setQuery: (query) => set({ query }),
  setActive: (activeKey) => set({ activeKey }),
  toggleExpanded: (id) => set((s) => ({ expanded: { ...s.expanded, [id]: !s.expanded[id] } })),
  flashCopied(id) {
    set({ copiedId: null });
    requestAnimationFrame(() => set({ copiedId: id }));
    window.setTimeout(() => set((s) => (s.copiedId === id ? { copiedId: null } : {})), 1200);
  },
  set: (patch) => set(patch),
}));

/** Rows currently rendered, in visual order; read by the keyboard handler. */
export const listRef: { entries: Entry[] } = { entries: [] };

export const surface: Surface =
  (document.documentElement.dataset.surface as Surface | undefined) ?? 'app';

export const anyDialogOpen = () => {
  const s = useUI.getState();
  return !!(s.editor || s.folderDialog || s.varDialog || s.settingsOpen);
};
