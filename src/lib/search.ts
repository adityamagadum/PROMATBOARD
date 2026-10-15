import type { Folder, Prompt } from '../types';

/**
 * Small, dependency-free fuzzy ranker tuned for prompt titles.
 *
 * Every whitespace-separated token must match somewhere (AND). Scores, best first:
 *   title word-prefix > title substring > tag > title subsequence > folder > content.
 * `#tag` tokens only match tags. Typical cost for 500 prompts is well under 1ms per keystroke.
 */
export interface SearchHit {
  prompt: Prompt;
  score: number;
  /** Character indexes in the title to highlight. */
  titleMatches: number[];
}

function subsequence(hay: string, needle: string): number[] | null {
  const idx: number[] = [];
  let j = 0;
  for (let i = 0; i < hay.length && j < needle.length; i++) {
    if (hay[i] === needle[j]) {
      idx.push(i);
      j++;
    }
  }
  return j === needle.length ? idx : null;
}

function scoreToken(
  token: string,
  title: string,
  tags: string[],
  folderName: string,
  content: string,
  marks: Set<number>,
): number {
  if (token.startsWith('#')) {
    const t = token.slice(1);
    if (!t) return 1;
    if (tags.includes(t)) return 80;
    return tags.some((x) => x.startsWith(t)) ? 55 : 0;
  }

  let best = 0;
  const at = title.indexOf(token);
  if (at !== -1) {
    const wordStart = at === 0 || /[\s\-–—_/:(]/.test(title[at - 1]);
    best = wordStart ? (at === 0 ? 110 : 100) : 70;
    for (let i = 0; i < token.length; i++) marks.add(at + i);
  }
  if (best < 80) {
    if (tags.includes(token)) best = Math.max(best, 80);
    else if (tags.some((t) => t.startsWith(token))) best = Math.max(best, 60);
    else if (tags.some((t) => t.includes(token))) best = Math.max(best, 40);
  }
  if (best === 0 && token.length > 1) {
    const seq = subsequence(title, token);
    if (seq) {
      // Reward tight matches: fewer gaps = higher score.
      const spread = seq[seq.length - 1] - seq[0] + 1;
      best = 20 + Math.round(25 * (token.length / spread));
      seq.forEach((i) => marks.add(i));
    }
  }
  if (best < 25 && folderName.includes(token)) best = 25;
  if (best < 20 && content.includes(token)) best = 20;
  return best;
}

export function searchPrompts(
  prompts: Prompt[],
  folders: Record<string, Folder>,
  query: string,
): SearchHit[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const hits: SearchHit[] = [];
  for (const p of prompts) {
    const title = p.title.toLowerCase();
    const content = p.content.toLowerCase();
    const folderName = p.folderId ? (folders[p.folderId]?.name.toLowerCase() ?? '') : '';
    const marks = new Set<number>();
    let total = 0;
    let ok = true;
    for (const t of tokens) {
      const s = scoreToken(t, title, p.tags, folderName, content, marks);
      if (!s) {
        ok = false;
        break;
      }
      total += s;
    }
    if (!ok) continue;
    total += (p.favorite ? 6 : 0) + Math.min(10, Math.log2(1 + p.usageCount) * 2);
    hits.push({ prompt: p, score: total, titleMatches: [...marks].sort((a, b) => a - b) });
  }
  return hits.sort(
    (a, b) => b.score - a.score || (b.prompt.lastUsedAt ?? 0) - (a.prompt.lastUsedAt ?? 0),
  );
}
