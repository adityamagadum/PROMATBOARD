import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Clock, FolderOpen, Inbox, MousePointerClick, Plus, SearchX, Star, Braces, TextSelect } from 'lucide-react';
import type { Prompt } from '../types';
import { useVault } from '../lib/store';
import { searchPrompts } from '../lib/search';
import { childrenOf, descendantIds } from '../lib/tree';
import { listRef, useUI, type Entry } from '../lib/ui';
import { FOLDER_COLORS, modKey } from '../lib/utils';
import { DraggablePromptCard, PromptTile, SortablePromptCard } from './PromptCard';
import { Button } from './ui';

interface Section {
  id: string;
  label?: string;
  layout: 'cards' | 'tiles';
  entries: Entry[];
  /** Cards in this section can be reordered by dragging. */
  sortable?: boolean;
  /** Items left out of a capped section (Pinned on Home). */
  more?: number;
}

const PINNED_ON_HOME = 6;

/** Above this many rows, per-item enter/exit animations are skipped to stay instant. */
const ANIMATE_LIMIT = 80;
/** Rows rendered per page; more are mounted as you scroll or arrow down. */
const PAGE = 24;

const byOrder = (a: Prompt, b: Prompt) => a.order - b.order || a.createdAt - b.createdAt;
const toEntries = (section: string, prompts: Prompt[]): Entry[] =>
  prompts.map((p) => ({ key: `${section}:${p.id}`, prompt: p, section }));

export function PromptList() {
  const prompts = useVault((s) => s.prompts);
  const folders = useVault((s) => s.folders);
  const onboardingDismissed = useVault((s) => s.settings.onboardingDismissed);
  const view = useUI((s) => s.view);
  const query = useDeferredValue(useUI((s) => s.query));
  const activeKey = useUI((s) => s.activeKey);
  // Layout animations are paused during a drag: dnd-kit already animates the reorder.
  const dragging = useUI((s) => !!s.draggingId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => Object.values(prompts), [prompts]);

  const sections: Section[] = useMemo(() => {
    if (query.trim()) {
      const hits = searchPrompts(all, folders, query);
      return [
        {
          id: 'results',
          label: `${hits.length} result${hits.length === 1 ? '' : 's'}`,
          layout: 'cards',
          entries: hits.map((h) => ({ key: `r:${h.prompt.id}`, prompt: h.prompt, section: 'results', titleMatches: h.titleMatches })),
        },
      ];
    }
    switch (view.kind) {
      case 'home': {
        const favs = all.filter((p) => p.favorite).sort(byOrder);
        const recent = all
          .filter((p) => p.lastUsedAt)
          .sort((a, b) => b.lastUsedAt! - a.lastUsedAt!)
          .slice(0, 4);
        const everything = [...all].sort((a, b) => b.updatedAt - a.updatedAt);
        const out: Section[] = [];
        if (favs.length)
          out.push({
            id: 'pinned',
            label: 'Pinned',
            layout: 'tiles',
            entries: toEntries('pinned', favs.slice(0, PINNED_ON_HOME)),
            more: Math.max(0, favs.length - PINNED_ON_HOME),
          });
        if (recent.length) out.push({ id: 'recent', label: 'Recently used', layout: 'cards', entries: toEntries('recent', recent) });
        out.push({ id: 'all', label: 'All prompts', layout: 'cards', entries: toEntries('all', everything) });
        return out;
      }
      case 'favorites':
        return [{ id: 'favorites', layout: 'cards', entries: toEntries('favorites', all.filter((p) => p.favorite).sort(byOrder)) }];
      case 'recent':
        return [
          {
            id: 'recent',
            layout: 'cards',
            entries: toEntries(
              'recent',
              all.filter((p) => p.lastUsedAt).sort((a, b) => b.lastUsedAt! - a.lastUsedAt!).slice(0, 50),
            ),
          },
        ];
      case 'unsorted':
        return [
          { id: 'unsorted', layout: 'cards', sortable: true, entries: toEntries('unsorted', all.filter((p) => !p.folderId).sort(byOrder)) },
        ];
      case 'folder': {
        const own = all.filter((p) => p.folderId === view.id).sort(byOrder);
        const out: Section[] = [{ id: 'folder', layout: 'cards', sortable: true, entries: toEntries('folder', own) }];
        // Prompts from subfolders follow, grouped, so a parent folder is a useful overview.
        for (const child of childrenOf(folders, view.id)) {
          const ids = new Set([child.id, ...descendantIds(folders, child.id)]);
          const inside = all.filter((p) => p.folderId && ids.has(p.folderId)).sort(byOrder);
          if (inside.length) {
            out.push({
              id: `sub-${child.id}`,
              label: `${child.emoji ? child.emoji + ' ' : ''}${child.name}`,
              layout: 'cards',
              entries: toEntries(`sub-${child.id}`, inside),
            });
          }
        }
        return out;
      }
    }
  }, [all, folders, view, query]);

  const entries = useMemo(() => sections.flatMap((s) => s.entries), [sections]);
  const total = entries.length;

  // Progressive rendering: mount PAGE rows at a time so 500+ prompts open instantly.
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => setLimit(PAGE), [view, query]);
  const visibleSections = useMemo(() => {
    let budget = limit;
    return sections.map((s) => {
      const shown = s.entries.slice(0, Math.max(0, budget));
      budget -= shown.length;
      // Stable ids array: a new one each render would re-render every sortable card.
      return { ...s, entries: shown, ids: shown.map((e) => e.key) };
    });
  }, [sections, limit]);
  const truncated = limit < total;

  // Load the next page when the user nears the bottom (also re-checked after each page,
  // in case the content is still shorter than the viewport).
  const maybeLoadMore = () => {
    const el = scrollRef.current;
    if (truncated && el && el.scrollTop + el.clientHeight > el.scrollHeight - 600) setLimit((l) => l + PAGE);
  };
  useEffect(maybeLoadMore, [truncated, limit]);

  // Arrowing past the rendered window mounts the next page.
  useEffect(() => {
    const i = entries.findIndex((e) => e.key === activeKey);
    if (i >= limit - 2) setLimit(i + PAGE);
  }, [activeKey, entries, limit]);

  useLayoutEffect(() => {
    listRef.entries = entries;
  }, [entries]);

  // While searching, the best match is always the active row (Raycast-style).
  useEffect(() => {
    const ui = useUI.getState();
    if (query.trim()) ui.setActive(entries[0]?.key ?? null);
    else if (ui.activeKey && !entries.some((e) => e.key === ui.activeKey)) ui.setActive(null);
  }, [query, entries]);

  // Keep the keyboard cursor in view.
  useEffect(() => {
    if (!activeKey) return;
    document.getElementById(`entry-${activeKey}`)?.scrollIntoView({ block: 'nearest' });
  }, [activeKey, limit]);

  const showFolderFor = (sectionId: string) => !(sectionId === 'folder' || sectionId.startsWith('sub-'));
  const animate = total <= ANIMATE_LIMIT;
  const showOnboarding = view.kind === 'home' && !query && !onboardingDismissed;

  return (
    <div
      ref={scrollRef}
      id="pv-list"
      role="listbox"
      aria-label="Prompts"
      aria-activedescendant={activeKey ? `entry-${activeKey}` : undefined}
      onScroll={maybeLoadMore}
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pt-1 pb-4"
    >
      {showOnboarding && <Onboarding />}

      {total === 0 && !showOnboarding && <EmptyState query={query} />}

      {visibleSections.map((section) =>
        section.entries.length === 0 ? null : (
          <section key={section.id} className="mb-3" aria-label={section.label}>
            {section.label && (
              <h2 className="section-label sticky top-0 z-[1] -mx-3 mb-1 bg-bg/90 px-4 pt-2 pb-1.5 backdrop-blur-sm">
                {section.label}
              </h2>
            )}
            {section.layout === 'tiles' ? (
              <div className="grid grid-cols-2 gap-1.5">
                {section.entries.map((e) => (
                  <PromptTile
                    key={e.key}
                    entryKey={e.key}
                    prompt={e.prompt}
                    folder={e.prompt.folderId ? folders[e.prompt.folderId] : undefined}
                    active={activeKey === e.key}
                  />
                ))}
                {!!section.more && (
                  <button
                    type="button"
                    onClick={() => useUI.getState().setView({ kind: 'favorites' })}
                    className="col-span-2 rounded-lg py-1 text-[11.5px] font-medium text-subtle transition-colors hover:bg-s3 hover:text-fg"
                  >
                    View all {section.entries.length + section.more} favorites →
                  </button>
                )}
              </div>
            ) : (
              <CardStack
                ids={section.ids}
                sortable={!!section.sortable}
              >
                <AnimatePresence initial={false} mode="popLayout">
                  {section.entries.map((e) => {
                    const Card = section.sortable ? SortablePromptCard : DraggablePromptCard;
                    const card = (
                      <Card
                        entryKey={e.key}
                        prompt={e.prompt}
                        folder={e.prompt.folderId ? folders[e.prompt.folderId] : undefined}
                        showFolder={showFolderFor(section.id)}
                        active={activeKey === e.key}
                        titleMatches={e.titleMatches}
                      />
                    );
                    return animate ? (
                      <motion.div
                        key={e.key}
                        layout={dragging ? false : 'position'}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1], layout: { type: 'spring', stiffness: 520, damping: 40 } }}
                      >
                        {card}
                      </motion.div>
                    ) : (
                      <div key={e.key}>{card}</div>
                    );
                  })}
                </AnimatePresence>
              </CardStack>
            )}
          </section>
        ),
      )}
      {truncated && (
        <div className="flex h-10 items-center justify-center text-[11px] text-subtle">
          Loading more…
        </div>
      )}
    </div>
  );
}

function CardStack({ ids, sortable, children }: { ids: string[]; sortable: boolean; children: React.ReactNode }) {
  const stack = <div className="flex flex-col gap-1.5">{children}</div>;
  return sortable ? (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {stack}
    </SortableContext>
  ) : (
    stack
  );
}

function Onboarding() {
  const dismiss = () => void useVault.getState().updateSettings({ onboardingDismissed: true });
  const tips = [
    { icon: <MousePointerClick size={14} />, text: 'Click any card to copy it. Hover to peek at the full text.' },
    { icon: <Braces size={14} />, text: <>Write <span className="var-chip">{'{{variables}}'}</span> to get a fill-in form before copying.</> },
    { icon: <TextSelect size={14} />, text: 'Select text on any page → right-click → Save to PromptVault.' },
  ];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-2 mb-3 overflow-hidden rounded-2xl border border-line-strong bg-s2 p-3.5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-60 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--accent) 0%, transparent 70%)' }}
      />
      <h2 className="relative text-[14px] font-semibold tracking-[-0.01em]">Welcome to PromptVault 👋</h2>
      <p className="relative mt-0.5 text-[12.5px] text-muted">Your prompts, named and one click away. We added a few examples to get you started.</p>
      <ul className="relative mt-3 space-y-2">
        {tips.map((t, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[12.5px] text-fg">
            <span className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent-strong">{t.icon}</span>
            <span>{t.text}</span>
          </li>
        ))}
      </ul>
      <div className="relative mt-3 flex items-center gap-2 text-[11px] text-subtle">
        <span className="kbd">↑</span>
        <span className="kbd">↓</span> move <span className="kbd">↵</span> copy <span className="kbd">{modKey}+N</span> new
      </div>
      <div className="relative mt-3 flex gap-2">
        <Button variant="primary" size="sm" onClick={() => useUI.getState().set({ editor: {} })}>
          <Plus size={14} /> New prompt
        </Button>
        <Button variant="ghost" size="sm" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </motion.div>
  );
}

function EmptyState({ query }: { query: string }) {
  const view = useUI((s) => s.view);
  const folder = useVault((s) => (view.kind === 'folder' ? s.folders[view.id] : undefined));
  const newPrompt = (title?: string) =>
    useUI.getState().set({
      editor: { draft: { title, folderId: view.kind === 'folder' ? view.id : null } },
    });

  let icon = <Inbox size={20} />;
  let title = 'Nothing here yet';
  let body = 'Create your first prompt to get started.';
  let action = (
    <Button variant="primary" size="sm" onClick={() => newPrompt()}>
      <Plus size={14} /> New prompt
    </Button>
  );

  if (query.trim()) {
    icon = <SearchX size={20} />;
    title = `No prompts match “${query.trim()}”`;
    body = 'Try fewer words, or search a tag with #tag.';
    action = (
      <Button variant="secondary" size="sm" onClick={() => newPrompt(query.trim())}>
        <Plus size={14} /> Create “{query.trim().slice(0, 24)}”
      </Button>
    );
  } else if (view.kind === 'favorites') {
    icon = <Star size={20} />;
    title = 'No favorites yet';
    body = 'Pin the prompts you use most. They also appear at the top of Home.';
    action = <></>;
  } else if (view.kind === 'recent') {
    icon = <Clock size={20} />;
    title = 'Nothing used yet';
    body = 'Prompts you copy or insert show up here with usage counts.';
    action = <></>;
  } else if (view.kind === 'folder') {
    icon = <FolderOpen size={20} style={{ color: folder ? FOLDER_COLORS[folder.color] : undefined }} />;
    title = `${folder?.emoji ? folder.emoji + ' ' : ''}${folder?.name ?? 'Folder'} is empty`;
    body = 'Add a prompt here, or drag prompts onto this folder in the sidebar.';
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="flex flex-col items-center px-6 pt-14 pb-8 text-center"
    >
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-s2 text-muted shadow-card">
        {icon}
      </div>
      <h3 className="max-w-full truncate text-[13.5px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-[260px] text-[12.5px] text-muted">{body}</p>
      <div className="mt-4">{action}</div>
    </motion.div>
  );
}
