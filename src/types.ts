export type FolderColor =
  | 'slate'
  | 'red'
  | 'orange'
  | 'amber'
  | 'green'
  | 'teal'
  | 'blue'
  | 'violet'
  | 'pink';

export interface Folder {
  id: string;
  name: string;
  /** Optional emoji shown instead of the folder glyph. */
  emoji?: string;
  color: FolderColor;
  /** null = top level. */
  parentId: string | null;
  /** Sort position among siblings (ascending). */
  order: number;
  collapsed?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Prompt {
  id: string;
  title: string;
  content: string;
  /** null = "Unsorted". */
  folderId: string | null;
  tags: string[];
  favorite: boolean;
  usageCount: number;
  lastUsedAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** Sort position inside its folder (ascending). */
  order: number;
  /** Render content in a monospace font. */
  monospace?: boolean;
  /** Page the prompt was saved from (context menu quick-save). */
  sourceUrl?: string;
}

export type ThemePref = 'dark' | 'light' | 'system';

export interface Settings {
  theme: ThemePref;
  /** Show the "Insert into page" action on cards. */
  showInsert: boolean;
  /** Close the popup after copying. */
  closeOnCopy: boolean;
  onboardingDismissed: boolean;
  /** Example content has been created once; never re-seed after the user deletes it. */
  seeded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'dark',
  showInsert: true,
  closeOnCopy: false,
  onboardingDismissed: false,
  seeded: false,
};

/** Format written by Export and accepted by Import. */
export interface ExportFile {
  app: 'PromptVault';
  version: 1;
  exportedAt: string;
  folders: Folder[];
  prompts: Prompt[];
}

/** Sidebar selection. */
export type View =
  | { kind: 'home' }
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'unsorted' }
  | { kind: 'folder'; id: string };

export type Surface = 'popup' | 'sidepanel' | 'app' | 'quicksave';
