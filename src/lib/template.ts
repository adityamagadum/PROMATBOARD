/**
 * Template variables: `{{name}}` or `{{name|default value}}`.
 * The same name used twice is filled once.
 */
export interface TemplateVar {
  name: string;
  defaultValue: string;
}

const VAR_SOURCE = /\{\{\s*([^{}|]+?)\s*(?:\|([^{}]*))?\}\}/.source;
// Fresh regex per call: a shared /g regex carries lastIndex between calls (and matchAll copies it).
const varRe = () => new RegExp(VAR_SOURCE, 'g');

export function extractVars(content: string): TemplateVar[] {
  const seen = new Map<string, TemplateVar>();
  for (const m of content.matchAll(varRe())) {
    const name = m[1].trim();
    if (!seen.has(name)) seen.set(name, { name, defaultValue: (m[2] ?? '').trim() });
  }
  return [...seen.values()];
}

export const hasVars = (content: string) => varRe().test(content);

export function fillTemplate(content: string, values: Record<string, string>): string {
  return content.replace(varRe(), (_, rawName: string, def?: string) => {
    const name = rawName.trim();
    const v = values[name];
    return v != null && v !== '' ? v : (def ?? '').trim();
  });
}

/** Splits content into literal and variable segments, for highlighted previews. */
export function segments(content: string): { text: string; varName?: string }[] {
  const out: { text: string; varName?: string }[] = [];
  let last = 0;
  for (const m of content.matchAll(varRe())) {
    if (m.index! > last) out.push({ text: content.slice(last, m.index) });
    out.push({ text: m[0], varName: m[1].trim() });
    last = m.index! + m[0].length;
  }
  if (last < content.length) out.push({ text: content.slice(last) });
  return out;
}

/** Turns `tone_of_voice` / `toneOfVoice` into "Tone of voice" for form labels. */
export function humanize(name: string): string {
  const s = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
