import type { FolderColor } from '../types';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');

export const FOLDER_COLORS: Record<FolderColor, string> = {
  slate: '#8B93A7',
  red: '#F2555A',
  orange: '#F5873A',
  amber: '#E8B53B',
  green: '#3CC47C',
  teal: '#2BBFB3',
  blue: '#4C8DFF',
  violet: '#8B7CFF',
  pink: '#EE5FA8',
};

export const COLOR_NAMES = Object.keys(FOLDER_COLORS) as FolderColor[];

export function relativeTime(ts: number | null, now = Date.now()): string {
  if (!ts) return 'never';
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** One-line preview: collapse whitespace so the card shows real words, not blank lines. */
export const previewLine = (s: string) => s.replace(/\s+/g, ' ').trim();

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);
export const modKey = isMac ? '⌘' : 'Ctrl';

export function normalizeTags(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const t = raw.trim().replace(/^#/, '').toLowerCase().replace(/\s+/g, '-');
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/** Generates a readable title from the first words of a selection. */
export function titleFromText(text: string): string {
  const first = previewLine(text).split(/(?<=[.!?:])\s/)[0] ?? '';
  const words = first.split(' ').slice(0, 7).join(' ');
  return words.length > 60 ? words.slice(0, 57) + '…' : words || 'Untitled prompt';
}
