import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Braces, Code2, Star, Trash2, X } from 'lucide-react';
import type { Prompt } from '../types';
import { deletePromptWithUndo } from '../lib/actions';
import { useVault } from '../lib/store';
import { extractVars } from '../lib/template';
import { flattenTree } from '../lib/tree';
import { useUI } from '../lib/ui';
import { cx, modKey, normalizeTags } from '../lib/utils';
import { Button, Field, IconButton, inputClass, Sheet } from './ui';
import { toast } from './Toaster';

export function PromptEditor() {
  const editor = useUI((s) => s.editor);
  const close = () => useUI.getState().set({ editor: null });
  return (
    <Sheet
      open={!!editor}
      onOpenChange={(o) => !o && close()}
      title={editor?.promptId ? 'Edit prompt' : 'New prompt'}
      wide
      initialFocus={editor?.promptId ? '#pv-content' : '#pv-title'}
    >
      {editor && <EditorForm key={editor.promptId ?? 'new'} promptId={editor.promptId} draft={editor.draft} onDone={close} />}
    </Sheet>
  );
}

function EditorForm({ promptId, draft, onDone }: { promptId?: string; draft?: Partial<Prompt>; onDone: () => void }) {
  const existing = useVault((s) => (promptId ? s.prompts[promptId] : undefined));
  const folders = useVault((s) => s.folders);
  const allPrompts = useVault((s) => s.prompts);
  const view = useUI((s) => s.view);

  const initialFolder =
    existing?.folderId ?? draft?.folderId ?? (view.kind === 'folder' ? view.id : null);
  const [title, setTitle] = useState(existing?.title ?? draft?.title ?? '');
  const [content, setContent] = useState(existing?.content ?? draft?.content ?? '');
  const [folderId, setFolderId] = useState<string | null>(initialFolder);
  const [tags, setTags] = useState<string[]>(existing?.tags ?? draft?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [mono, setMono] = useState(existing?.monospace ?? draft?.monospace ?? false);
  const [favorite, setFavorite] = useState(existing?.favorite ?? false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const vars = useMemo(() => extractVars(content), [content]);
  const knownTags = useMemo(() => {
    const s = new Set<string>();
    Object.values(allPrompts).forEach((p) => p.tags.forEach((t) => s.add(t)));
    return [...s].sort();
  }, [allPrompts]);

  // Auto-grow the content box up to a comfortable height.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight + 2, Math.max(180, window.innerHeight * 0.45)) + 'px';
  }, [content]);

  const commitTag = (raw: string) => {
    const next = normalizeTags([...tags, ...raw.split(',')]);
    setTags(next);
    setTagInput('');
  };

  const canSave = title.trim().length > 0 || content.trim().length > 0;

  const save = async () => {
    if (!canSave) return;
    const finalTags = tagInput.trim() ? normalizeTags([...tags, ...tagInput.split(',')]) : tags;
    await useVault.getState().savePrompt({
      ...draft,
      id: existing?.id,
      title: title.trim() || content.trim().split('\n')[0].slice(0, 60),
      content,
      folderId,
      tags: finalTags,
      monospace: mono,
      favorite,
    });
    toast(existing ? 'Saved' : 'Prompt created');
    onDone();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'Enter')) {
      e.preventDefault();
      void save();
    }
  };

  const insertVar = () => {
    const el = contentRef.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const selected = content.slice(a, b).trim();
    const name = selected && /^[\w\s-]{1,40}$/.test(selected) ? selected.replace(/\s+/g, '_') : 'variable';
    const token = `{{${name}}}`;
    setContent(content.slice(0, a) + token + content.slice(b));
    requestAnimationFrame(() => {
      el.focus();
      // Select the name so it can be typed over immediately.
      el.setSelectionRange(a + 2, a + 2 + name.length);
    });
  };

  return (
    <form
      onKeyDown={onKeyDown}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className="space-y-3 pt-1"
    >
      <div className="flex items-center gap-2">
        <input
          id="pv-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Name it, e.g. “Image gen – cinematic portrait”"
          aria-label="Title"
          maxLength={140}
          className={cx(inputClass, 'h-10 text-[14.5px] font-medium')}
        />
        <IconButton
          label={favorite ? 'Unpin from favorites' : 'Pin to favorites'}
          active={favorite}
          onClick={() => setFavorite(!favorite)}
          className="h-10 w-10"
        >
          <Star size={16} className={favorite ? 'fill-amber-400 text-amber-400' : ''} />
        </IconButton>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11.5px] font-medium text-muted">Prompt</span>
          <div className="flex items-center gap-0.5">
            <IconButton size="sm" label="Insert {{variable}}" onClick={insertVar}>
              <Braces size={13} />
            </IconButton>
            <IconButton size="sm" label={mono ? 'Use proportional font' : 'Use monospace font'} active={mono} onClick={() => setMono(!mono)}>
              <Code2 size={13} />
            </IconButton>
          </div>
        </div>
        <textarea
          id="pv-content"
          ref={contentRef}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder={'Write your prompt…\n\nTip: use {{variable}} or {{variable|default}} for fill-in-the-blanks.'}
          aria-label="Prompt content"
          spellCheck={!mono}
          rows={7}
          className={cx(inputClass, 'resize-none leading-relaxed', mono && 'font-mono text-[12.5px]')}
        />
        <div className="mt-1.5 flex min-h-5 flex-wrap items-center gap-1.5 text-[11px] text-subtle">
          {vars.length > 0 ? (
            <>
              <span>Variables:</span>
              {vars.map((v) => (
                <span key={v.name} className="var-chip">
                  {v.name}
                  {v.defaultValue && <span className="opacity-60"> = {v.defaultValue}</span>}
                </span>
              ))}
            </>
          ) : (
            <span>No variables</span>
          )}
          <span className="ml-auto tabular-nums">
            {content.length.toLocaleString()} chars · {content.trim() ? content.trim().split(/\s+/).length : 0} words
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2">
        <Field label="Folder">
          <select
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value || null)}
            className={cx(inputClass, 'h-8.5 cursor-pointer appearance-none bg-[length:12px] pr-7')}
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238d8d99' stroke-width='2.5'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 9px center',
            }}
          >
            <option value="">📥 Unsorted</option>
            {flattenTree(folders).map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {'   '.repeat(depth)}
                {folder.emoji ?? '📁'} {folder.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Tags" hint="Enter or comma to add">
          <div
            className={cx(inputClass, 'flex min-h-8.5 flex-wrap items-center gap-1 px-1.5 py-1 focus-within:border-accent focus-within:shadow-[0_0_0_3px_var(--accent-soft)]')}
            onClick={(e) => (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus()}
          >
            {tags.map((t) => (
              <span key={t} className="flex items-center gap-0.5 rounded-md bg-s4 py-0.5 pr-0.5 pl-1.5 text-[11.5px] text-fg">
                #{t}
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  onClick={() => setTags(tags.filter((x) => x !== t))}
                  className="rounded p-0.5 text-subtle hover:bg-s3 hover:text-fg"
                >
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              value={tagInput}
              list="pv-tags"
              onChange={(e) => {
                const v = e.target.value;
                if (v.endsWith(',')) commitTag(v);
                else setTagInput(v);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagInput.trim()) {
                  e.preventDefault();
                  e.stopPropagation();
                  commitTag(tagInput);
                } else if (e.key === 'Backspace' && !tagInput && tags.length) {
                  setTags(tags.slice(0, -1));
                }
              }}
              placeholder={tags.length ? '' : 'writing, image…'}
              aria-label="Add tag"
              className="min-w-16 flex-1 bg-transparent px-1 text-[12.5px] outline-none placeholder:text-subtle"
            />
            <datalist id="pv-tags">
              {knownTags.filter((t) => !tags.includes(t)).map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </div>
        </Field>
      </div>

      <div className="-mx-4 mt-1 flex items-center gap-2 border-t border-line px-4 pt-3">
        {existing && (
          <Button
            variant="ghost"
            size="sm"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={() => {
              void deletePromptWithUndo(existing);
              onDone();
            }}
          >
            <Trash2 size={13} /> Delete
          </Button>
        )}
        <span className="flex-1" />
        <span className="hidden text-[11px] text-subtle min-[420px]:inline">
          <span className="kbd">{modKey}+S</span> to save
        </span>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!canSave}>
          {existing ? 'Save' : 'Create prompt'}
        </Button>
      </div>
    </form>
  );
}
