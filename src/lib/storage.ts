/**
 * Thin async key/value layer over chrome.storage.local.
 *
 * Data layout (one key per record keeps writes small even with 500+ long prompts):
 *   p:<id>     -> Prompt
 *   f:<id>     -> Folder
 *   settings   -> Settings
 *   vars:<id>  -> last values used for a template prompt
 *
 * Outside the extension (plain `npm run dev` in a browser tab) a localStorage shim is used
 * so the UI can be developed and previewed without loading the extension.
 */

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;
type Listener = (changes: Changes) => void;

export const hasChrome = typeof chrome !== 'undefined' && !!chrome.storage?.local;

interface Area {
  getAll(): Promise<Record<string, unknown>>;
  get<T>(key: string): Promise<T | undefined>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
  onChanged(fn: Listener): () => void;
}

const chromeArea: Area = {
  getAll: () => chrome.storage.local.get(null),
  async get<T>(key: string) {
    const r = await chrome.storage.local.get(key);
    return r[key] as T | undefined;
  },
  set: (items) => chrome.storage.local.set(items),
  remove: (keys) => (keys.length ? chrome.storage.local.remove(keys) : Promise.resolve()),
  onChanged(fn) {
    const handler = (changes: Changes, area: string) => {
      if (area === 'local') fn(changes);
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  },
};

const PREFIX = 'promptvault:';
const shimListeners = new Set<Listener>();
const shimArea: Area = {
  async getAll() {
    const out: Record<string, unknown> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX)) out[k.slice(PREFIX.length)] = JSON.parse(localStorage.getItem(k)!);
    }
    return out;
  },
  async get<T>(key: string) {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? undefined : (JSON.parse(v) as T);
  },
  async set(items) {
    const changes: Changes = {};
    for (const [k, v] of Object.entries(items)) {
      localStorage.setItem(PREFIX + k, JSON.stringify(v));
      changes[k] = { newValue: v };
    }
    shimListeners.forEach((l) => l(changes));
  },
  async remove(keys) {
    const changes: Changes = {};
    for (const k of keys) {
      localStorage.removeItem(PREFIX + k);
      changes[k] = {};
    }
    shimListeners.forEach((l) => l(changes));
  },
  onChanged(fn) {
    shimListeners.add(fn);
    const onStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(PREFIX)) {
        fn({ [e.key.slice(PREFIX.length)]: { newValue: e.newValue ? JSON.parse(e.newValue) : undefined } });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      shimListeners.delete(fn);
      window.removeEventListener('storage', onStorage);
    };
  },
};

export const storage: Area = hasChrome ? chromeArea : shimArea;

export const keys = {
  prompt: (id: string) => `p:${id}`,
  folder: (id: string) => `f:${id}`,
  vars: (id: string) => `vars:${id}`,
  settings: 'settings',
};
