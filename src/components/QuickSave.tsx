import { useEffect, useMemo, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import { Check, Folder as FolderIcon, FolderPlus, Globe, Inbox } from 'lucide-react';
import { hasChrome } from '../lib/storage';
import { useVault } from '../lib/store';
import { extractVars } from '../lib/template';
import { flattenTree } from '../lib/tree';
import { cx, FOLDER_COLORS, modKey, normalizeTags, titleFromText } from '../lib/utils';
import { Logo } from './Sidebar';
import { Button, Field, inputClass } from './ui';

interface Pending {
  text: string;
  url?: string;
  pageTitle?: string;
}

const LAST_FOLDER_KEY = 'pv-last-quicksave-folder';

async function readPending(): Promise<Pending> {
  if (hasChrome && chrome.storage.session) {
    const { pendingSave } = await chrome.storage.session.get('pendingSave');
    if (pendingSave) {
      void chrome.storage.session.remove('pendingSave');
      return pendingSave as Pending;
    }
    return { text: '' };
  }
  // Dev preview outside the extension.
  return {
    text: 'Act as a world-class copywriter. Rewrite the following product description for {{audience}} in a {{tone|confident}} tone, under 80 words.',
    url: 'https://example.com/article',
  };
}

export function QuickSave() {
  const ready = useVault((s) => s.ready);
  const pref = useVault((s) => s.settings.theme);
  const folders = useVault((s) => s.folders);
  const [pending, setPending] = useState<Pending | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tags, setTags] = useState('');
  const [folderId, setFolderId] = useState<string | null>(() => localStorage.getItem(LAST_FOLDER_KEY) || null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void readPending().then((p) => {
      setPending(p);
      setContent(p.text);
      setTitle(p.text ? titleFromText(p.text) : '');
    });
  }, []);

  useEffect(() => {
    const theme = pref === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : pref;
    document.documentElement.dataset.theme = theme;
  }, [pref]);

  // Forget a remembered folder that no longer exists.
  useEffect(() => {
    if (ready && folderId && !folders[folderId]) setFolderId(null);
  }, [ready, folderId, folders]);

  const tree = useMemo(() => flattenTree(folders), [folders]);
  const vars = useMemo(() => extractVars(content), [content]);
  const host = pending?.url ? safeHost(pending.url) : '';

  const close = () => window.close();

  const save = async () => {
    if (!content.trim() || saved) return;
    let target = folderId;
    if (newFolder?.trim()) {
      const f = await useVault.getState().saveFolder({ name: newFolder.trim(), color: 'blue' });
      target = f.id;
    }
    await useVault.getState().savePrompt({
      title: title.trim() || titleFromText(content),
      content,
      folderId: target,
      tags: normalizeTags(tags.split(',')),
      sourceUrl: pending?.url,
    });
    try {
      if (target) localStorage.setItem(LAST_FOLDER_KEY, target);
      else localStorage.removeItem(LAST_FOLDER_KEY);
    } catch {
      /* ignore */
    }
    setSaved(true);
    window.setTimeout(close, 750);
  };

  if (!ready || !pending) return null;

  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && (e.key === 'Enter' || e.key === 's')) {
              e.preventDefault();
              void save();
            } else if (e.key === 'Escape') close();
          }}
          className="flex h-full flex-col bg-bg"
        >
          <header className="flex h-12 shrink-0 items-center gap-2.5 border-b border-line bg-s1 px-4">
            <Logo />
            <h1 className="text-[13.5px] font-semibold tracking-[-0.01em]">Save to PromptVault</h1>
            {host && (
              <span className="ml-auto flex max-w-[45%] items-center gap-1 truncate rounded-full bg-s3 px-2 py-0.5 text-[11px] text-subtle">
                <Globe size={11} /> {host}
              </span>
            )}
          </header>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
            <Field label="Name">
              <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} className={cx(inputClass, 'h-9 font-medium')} placeholder="Give it a memorable name" />
            </Field>
            <Field label="Prompt" hint={vars.length ? `${vars.length} variable${vars.length > 1 ? 's' : ''} detected` : `${content.length} chars`}>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className={cx(inputClass, 'resize-none leading-relaxed')}
                placeholder="Selected text appears here"
              />
            </Field>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-muted">
                Folder
                {newFolder === null && (
                  <button type="button" onClick={() => setNewFolder('')} className="flex items-center gap-1 font-normal text-subtle hover:text-fg">
                    <FolderPlus size={12} /> New folder
                  </button>
                )}
              </div>
              {newFolder !== null && (
                <input
                  autoFocus
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), setNewFolder(null))}
                  placeholder="New folder name (saved into it)"
                  className={cx(inputClass, 'mb-1.5 h-8')}
                />
              )}
              <div role="radiogroup" aria-label="Folder" className={cx('max-h-44 overflow-y-auto rounded-xl border border-line bg-s1 p-1', newFolder?.trim() && 'pointer-events-none opacity-40')}>
                <FolderOption selected={folderId === null} onSelect={() => setFolderId(null)} depth={0} label="Unsorted" icon={<Inbox size={14} className="text-subtle" />} />
                {tree.map(({ folder, depth }) => (
                  <FolderOption
                    key={folder.id}
                    selected={folderId === folder.id}
                    onSelect={() => setFolderId(folder.id)}
                    depth={depth}
                    label={folder.name}
                    icon={
                      folder.emoji ? (
                        <span className="text-[13px] leading-none">{folder.emoji}</span>
                      ) : (
                        <FolderIcon size={14} style={{ color: FOLDER_COLORS[folder.color] }} fill={FOLDER_COLORS[folder.color]} fillOpacity={0.22} />
                      )
                    }
                  />
                ))}
              </div>
            </div>

            <Field label="Tags" hint="Comma separated">
              <input value={tags} onChange={(e) => setTags(e.target.value)} className={cx(inputClass, 'h-8')} placeholder="writing, research" />
            </Field>
          </div>

          <footer className="flex h-13 shrink-0 items-center gap-2 border-t border-line bg-s1 px-4">
            <span className="text-[11px] text-subtle">
              <span className="kbd">{modKey}+↵</span> save
            </span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" size="sm" disabled={!content.trim()} className={cx(saved && '!bg-success')}>
              {saved ? (
                <motion.span initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex items-center gap-1">
                  <Check size={14} strokeWidth={3} /> Saved
                </motion.span>
              ) : (
                'Save prompt'
              )}
            </Button>
          </footer>
        </form>
      </Tooltip.Provider>
    </MotionConfig>
  );
}

function FolderOption({
  selected,
  onSelect,
  depth,
  label,
  icon,
}: {
  selected: boolean;
  onSelect: () => void;
  depth: number;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{ paddingLeft: 8 + depth * 14 }}
      className={cx(
        'flex h-7.5 w-full items-center gap-2 rounded-lg pr-2 text-left text-[12.5px] transition-colors duration-100',
        selected ? 'bg-accent-soft font-medium text-fg' : 'text-muted hover:bg-s3 hover:text-fg',
      )}
    >
      <span className="flex w-4 justify-center">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {selected && <Check size={13} strokeWidth={2.5} className="text-accent-strong" />}
    </button>
  );
}

function safeHost(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
