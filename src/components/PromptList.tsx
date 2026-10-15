import { forwardRef, memo, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Clock, FolderOpen, Inbox, MousePointerClick, Plus, SearchX, Star, Braces, TextSelect } from 'lucide-react';
import type { Folder, Prompt, View } from '../types';
import { useVault } from '../lib/store';
import { searchPrompts } from '../lib/search';
import { childrenOf, descendantIds } from '../lib/tree';
import { listRef, useUI, type Entry } from '../lib/ui';
import { FOLDER_COLORS, modKey } from '../lib/utils';
import { DraggablePromptCard, PromptTile, SortablePromptCard } from './PromptCard';
import { hidePeek } from './Peek';
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

const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const LAYOUT_SPRING = { type: 'spring', stiffness: 520, damping: 40 } as const;

const byOrder = (a: Prompt, b: Prompt) => a.order - b.order || a.createdAt - b.createdAt;
const toEntries = (section: string, prompts: Prompt[]): Entry[] =>
  prompts.map((p) => ({ key: `${section}:${p.id}`, prompt: p, section }));

/** Identity of what the list shows; a change is a "page" change (fade + its own scroll position). */
export const viewKeyOf = (view: View, query: string) =>
  query.trim() ? 'search' : view.kind === 'folder' ? `folder:${view.id}` : view.kind;

/** Scroll offset and rendered page count per view, so going back lands exactly where you left. */
const memory = new Map<string, { top: number; limit: number }>();

/**
 * What the list (and ViewTitle) show. The view switches immediately: rendering a page of
 * cards is cheap, and deferring it only added latency. Search text is deferred so typing
 * stays responsive while results render. Title and list share this hook so they change together.
 */
export function useShownView() {
  const view = useUI((s) => s.view);
  const query = useDeferredValue(useUI((s) => s.query));
  return { view, query };
}

export function PromptList() {
  const prompts = useVault((s) => s.prompts);
  const folders = useVault((s) => s.folders);
  const onboardingDismissed = useVault((s) => s.settings.onboardingDismissed);
  const { view, query } = useShownView();
  const activeKey = useUI((s) => s.activeKey);
  // Layout animations are paused during a drag: dnd-kit already animates the reorder.
  const dragging = useUI((s) => !!s.draggingId);
  const scrollRef = useRef<HTMLDivElement>(null);
  const viewKey = viewKeyOf(view, query);

  const all = useMemo(() => Object.values(prompts), [prompts]);

  const sections: Section[] = useMemo(() => {
    if (query.trim()) {
      const hits = searchPrompts(all, folders, query);
      return [
        {
          id: 'results',
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
            id: 'recent-view',
            layout: 'cards',
            entries: toEntries(
              'recent-view',
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
  // The page count belongs to the view and is picked during render, so a view never
  // inherits another view's count for a frame.
  const [paging, setPaging] = useState({ key: viewKey, limit: PAGE });
  const limit = paging.key === viewKey ? paging.limit : (memory.get(viewKey)?.limit ?? PAGE);
  const setLimit = (next: number) => setPaging({ key: viewKey, limit: next });

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
    if (truncated && el && el.scrollTop + el.clientHeight > el.scrollHeight - 600) setLimit(limit + PAGE);
  };
  useEffect(maybeLoadMore, [truncated, limit, viewKey]);

  // Arrowing past the rendered window mounts the next page.
  useEffect(() => {
    const i = entries.findIndex((e) => e.key === activeKey);
    if (i >= limit - 2) setLimit(i + PAGE);
  }, [activeKey, entries, limit]);

  // Each view keeps its own scroll position; every new search starts at the top.
  const searchKey = viewKey === 'search' ? query : '';
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = viewKey === 'search' ? 0 : (memory.get(viewKey)?.top ?? 0);
    hidePeek();
  }, [viewKey, searchKey]);

  const onScroll = () => {
    // The peek is positioned from where its card was; once the list moves it would float loose.
    hidePeek();
    const el = scrollRef.current;
    if (el && viewKey !== 'search') memory.set(viewKey, { top: el.scrollTop, limit });
    maybeLoadMore();
  };

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

  // The very first paint shows content immediately; later view changes fade in.
  const firstRender = useRef(true);
  useEffect(() => {
    firstRender.current = false;
  }, []);

  // Item enter/exit/reorder animations only for edits inside a stable view. Search filters
  // instantly (animating every keystroke reads as flicker), and long lists skip them.
  const animateItems = !query.trim() && total <= ANIMATE_LIMIT && !dragging;
  const showOnboarding = view.kind === 'home' && !query && !onboardingDismissed;

  return (
    <motion.div
      ref={scrollRef}
      // Lets layout animations account for this element's scroll offset.
      layoutScroll
      id="pv-list"
      role="listbox"
      aria-label="Prompts"
      aria-activedescendant={activeKey ? `entry-${activeKey}` : undefined}
      onScroll={onScroll}
      className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-4"
    >
      <motion.div
        key={viewKey}
        initial={firstRender.current ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        <AnimatePresence initial={false}>{showOnboarding && <Onboarding key="onboarding" />}</AnimatePresence>

        {total === 0 && !showOnboarding && <EmptyState view={view} query={query} />}

        {/* Sections (e.g. Pinned, Recently used) fade in/out as they appear, and the ones below
            glide to their new place instead of jumping. */}
        <AnimatePresence initial={false}>
          {visibleSections
            .filter((section) => section.entries.length > 0)
            .map((section) => (
              <motion.section
                key={section.id}
                layout={animateItems ? 'position' : false}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.12 } }}
                transition={{ duration: 0.18, ease: EASE_OUT, layout: LAYOUT_SPRING }}
                className="mb-3"
                aria-label={section.label}
              >
                {section.label && (
                  <h2 className="section-label sticky top-0 z-[2] -mx-3 mb-1 bg-bg px-4 pt-2 pb-1.5">{section.label}</h2>
                )}
                {section.layout === 'tiles' ? (
                  <div className="grid grid-cols-2 gap-1.5">
                    <AnimatePresence initial={false}>
                      {section.entries.map((e) => (
                        <motion.div
                          key={e.key}
                          layout={animateItems ? 'position' : false}
                          initial={{ opacity: 0, scale: 0.96 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.12 } }}
                          transition={{ duration: 0.18, ease: EASE_OUT, layout: LAYOUT_SPRING }}
                        >
                          <PromptTile
                            entryKey={e.key}
                            prompt={e.prompt}
                            folder={e.prompt.folderId ? folders[e.prompt.folderId] : undefined}
                            active={activeKey === e.key}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
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
                  <CardStack ids={section.ids} sortable={!!section.sortable}>
                    <AnimatePresence initial={false} mode="popLayout">
                      {section.entries.map((e) => (
                        <Row
                          key={e.key}
                          entry={e}
                          sortable={!!section.sortable}
                          folder={e.prompt.folderId ? folders[e.prompt.folderId] : undefined}
                          showFolder={!(section.id === 'folder' || section.id.startsWith('sub-'))}
                          active={activeKey === e.key}
                          animate={animateItems}
                        />
                      ))}
                    </AnimatePresence>
                  </CardStack>
                )}
              </motion.section>
            ))}
        </AnimatePresence>
        {truncated && <div className="flex h-10 items-center justify-center text-[11px] text-subtle">Loading more…</div>}
      </motion.div>
    </motion.div>
  );
}

interface RowProps {
  entry: Entry;
  sortable: boolean;
  folder?: Folder;
  showFolder: boolean;
  active: boolean;
  animate: boolean;
}

/**
 * One list row. Memoized so moving the keyboard cursor re-renders two rows instead of the
 * whole list (an animated row measures its layout every time it renders).
 * forwardRef: AnimatePresence's popLayout needs the row's DOM node.
 */
const Row = memo(
  forwardRef<HTMLDivElement, RowProps>(function Row({ entry, sortable, folder, showFolder, active, animate }, ref) {
    const Card = sortable ? SortablePromptCard : DraggablePromptCard;
    const card = (
      <Card
        entryKey={entry.key}
        prompt={entry.prompt}
        folder={folder}
        showFolder={showFolder}
        active={active}
        titleMatches={entry.titleMatches}
      />
    );
    if (!animate) return <div ref={ref}>{card}</div>;
    return (
      <motion.div
        ref={ref}
        layout="position"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
        transition={{ duration: 0.18, ease: EASE_OUT, layout: LAYOUT_SPRING }}
      >
        {card}
      </motion.div>
    );
  }),
);

function CardStack({ ids, sortable, children }: { ids: string[]; sortable: boolean; children: React.ReactNode }) {
  // `relative`: popLayout positions exiting rows absolutely against this element.
  const stack = <div className="relative flex flex-col gap-1.5">{children}</div>;
  return sortable ? (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      {stack}
    </SortableContext>
  ) : (
    stack
  );
}

/** The welcome card animates in once per session, not every time Home is shown. */
let onboardingShown = false;

function Onboarding() {
  const [animateIn] = useState(() => !onboardingShown);
  onboardingShown = true;
  const dismiss = () => void useVault.getState().updateSettings({ onboardingDismissed: true });
  const tips = [
    { icon: <MousePointerClick size={14} />, text: 'Click any card to copy it. Hover to peek at the full text.' },
    { icon: <Braces size={14} />, text: <>Write <span className="var-chip">{'{{variables}}'}</span> to get a fill-in form before copying.</> },
    { icon: <TextSelect size={14} />, text: 'Select text on any page → right-click → Save to PromptVault.' },
  ];
  return (
    <motion.div
      initial={animateIn ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      // Dismissing collapses the card so the list slides up instead of jumping.
      exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, borderWidth: 0 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className="relative mt-2 mb-3 overflow-hidden rounded-2xl border border-line-strong bg-s2 p-3.5"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 -right-10 h-40 w-40 rounded-full opacity-60"
        style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--accent) 45%, transparent) 0%, transparent 70%)' }}
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

function EmptyState({ view, query }: { view: View; query: string }) {
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
    <div className="flex flex-col items-center px-6 pt-14 pb-8 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl border border-line bg-s2 text-muted shadow-card">
        {icon}
      </div>
      <h3 className="max-w-full truncate text-[13.5px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-[260px] text-[12.5px] text-muted">{body}</p>
      <div className="mt-4">{action}</div>
    </div>
  );
}
