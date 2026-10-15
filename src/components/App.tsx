import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  closestCenter,
  defaultDropAnimationSideEffects,
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDndContext,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';
import {
  ChevronRight,
  ExternalLink,
  FolderPlus,
  GripVertical,
  Menu,
  Moon,
  MoreHorizontal,
  PanelRight,
  Pencil,
  Plus,
  Search,
  Settings,
  Sun,
  X,
} from 'lucide-react';
import { runPrompt } from '../lib/actions';
import { hasChrome } from '../lib/storage';
import { useVault } from '../lib/store';
import { descendantIds, folderPath } from '../lib/tree';
import { searchPrompts } from '../lib/search';
import { anyDialogOpen, listRef, surface, useUI } from '../lib/ui';
import { cx, FOLDER_COLORS, modKey } from '../lib/utils';
import { FolderChip } from './PromptCard';
import { FolderDialog } from './FolderDialog';
import { Peek, hidePeek } from './Peek';
import { PromptEditor } from './PromptEditor';
import { PromptList, useShownView, viewKeyOf } from './PromptList';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { toast, Toaster } from './Toaster';
import { IconButton, MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui';
import { VariableDialog } from './VariableDialog';

function useMedia(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => matchMedia(query).matches,
  );
}

/** Applies the theme preference to <html data-theme>. */
function useTheme() {
  const pref = useVault((s) => s.settings.theme);
  const prefersLight = useMedia('(prefers-color-scheme: light)');
  const theme = pref === 'system' ? (prefersLight ? 'light' : 'dark') : pref;
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('pv-theme', theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return theme;
}

let popupWindowId: number | undefined;

export function App() {
  const ready = useVault((s) => s.ready);
  const theme = useTheme();
  const docked = useMedia('(min-width: 640px)');
  const drawerOpen = useUI((s) => s.drawerOpen);

  useEffect(() => {
    if (hasChrome && chrome.windows) chrome.windows.getCurrent().then((w) => (popupWindowId = w.id)).catch(() => {});
  }, []);

  useKeyboard();

  if (!ready) return null;

  return (
    <MotionConfig reducedMotion="user">
      <Tooltip.Provider delayDuration={450} skipDelayDuration={150}>
        <DnD docked={docked}>
          <div className="flex h-full overflow-hidden bg-bg">
            {docked && (
              <aside className="w-[232px] shrink-0 border-r border-line">
                <Sidebar />
              </aside>
            )}
            <main className="relative flex min-w-0 flex-1 flex-col">
              <Header docked={docked} theme={theme} />
              <ViewTitle />
              <PromptList />
              <Footer />
            </main>
          </div>

          {!docked && <Drawer open={drawerOpen} />}
        </DnD>

        <PromptEditor />
        <VariableDialog />
        <FolderDialog />
        <SettingsDialog />
        <Peek />
        <Toaster />
      </Tooltip.Provider>
    </MotionConfig>
  );
}

/* ---------------- Narrow layouts: sidebar as a slide-over drawer ---------------- */
function Drawer({ open }: { open: boolean }) {
  const { measureDroppableContainers, droppableContainers, active } = useDndContext();
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => useUI.getState().set({ drawerOpen: false })}
            className="fixed inset-0 z-30 bg-[var(--scrim)]"
          />
          <motion.aside
            key="drawer"
            initial={{ x: '-100%' }}
            animate={{ x: 0 }}
            exit={{ x: '-100%' }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            // When the drawer slid in during a drag, its folder rows were measured mid-slide;
            // re-measure once it has settled so drops land on the right folder.
            onAnimationComplete={() => {
              if (active) measureDroppableContainers([...droppableContainers.keys()].filter((id) => String(id).startsWith('drop:')));
            }}
            className="fixed inset-y-0 left-0 z-30 w-[264px] max-w-[82vw] border-r border-line-strong shadow-pop"
          >
            <Sidebar />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Header ---------------- */
function Header({ docked, theme }: { docked: boolean; theme: string }) {
  const query = useUI((s) => s.query);
  const inputRef = useRef<HTMLInputElement>(null);
  const update = useVault((s) => s.updateSettings);

  const openSidePanel = () => {
    if (!hasChrome || !chrome.sidePanel || popupWindowId == null) return;
    // Must run synchronously inside the click (user gesture) — hence the cached window id.
    chrome.sidePanel
      .open({ windowId: popupWindowId })
      .then(() => window.close())
      .catch(() => toast("Couldn't open the side panel", { kind: 'error' }));
  };
  const openFullView = () => {
    if (hasChrome) void chrome.tabs.create({ url: chrome.runtime.getURL('app.html') });
    else window.open('/app.html', '_blank');
    if (surface === 'popup') window.close();
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-s1 px-2.5">
      {!docked && (
        <IconButton label="Folders" onClick={() => useUI.getState().set({ drawerOpen: true })}>
          <Menu size={17} />
        </IconButton>
      )}
      <div className="group relative flex h-8.5 min-w-0 flex-1 items-center">
        <Search size={15} className="pointer-events-none absolute left-2.5 text-subtle transition-colors group-focus-within:text-accent" />
        <input
          id="pv-search"
          ref={inputRef}
          autoFocus
          value={query}
          onChange={(e) => useUI.getState().setQuery(e.target.value)}
          placeholder="Search prompts…"
          aria-label="Search prompts"
          aria-controls="pv-list"
          autoComplete="off"
          spellCheck={false}
          className="h-full w-full rounded-[10px] border border-line bg-s2 pr-8 pl-8 text-[13px] text-fg placeholder:text-subtle transition-[border-color,box-shadow,background-color] duration-150 hover:border-line-strong focus:border-accent focus:bg-s2 focus:shadow-[0_0_0_3px_var(--accent-soft)] focus-visible:outline-none"
        />
        <div className="absolute right-1.5 flex items-center">
          {query ? (
            <IconButton
              size="sm"
              label="Clear search"
              shortcut="Esc"
              onClick={() => {
                useUI.getState().setQuery('');
                inputRef.current?.focus();
              }}
            >
              <X size={13} />
            </IconButton>
          ) : (
            <span className="kbd pointer-events-none mr-1 opacity-70">/</span>
          )}
        </div>
      </div>

      <IconButton
        label="New prompt"
        shortcut={`${modKey}+N`}
        onClick={() => useUI.getState().set({ editor: {} })}
        tone="accent"
      >
        <Plus size={17} />
      </IconButton>
      <IconButton
        label={theme === 'dark' ? 'Light mode' : 'Dark mode'}
        onClick={() => void update({ theme: theme === 'dark' ? 'light' : 'dark' })}
      >
        <motion.span key={theme} initial={{ rotate: -60, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} transition={{ duration: 0.2 }} className="flex">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </motion.span>
      </IconButton>
      <MenuRoot modal={false}>
        <MenuTrigger asChild>
          <IconButton label="More">
            <MoreHorizontal size={17} />
          </IconButton>
        </MenuTrigger>
        <MenuContent>
          {surface === 'popup' && hasChrome && (
            <MenuItem icon={<PanelRight size={14} />} onSelect={openSidePanel} shortcut="Alt⇧Y">
              Open in side panel
            </MenuItem>
          )}
          {surface !== 'app' && (
            <MenuItem icon={<ExternalLink size={14} />} onSelect={openFullView}>
              Open full view
            </MenuItem>
          )}
          <MenuItem icon={<FolderPlus size={14} />} onSelect={() => useUI.getState().set({ folderDialog: { parentId: null } })}>
            New folder
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={<Settings size={14} />} onSelect={() => useUI.getState().set({ settingsOpen: true })}>
            Settings, import & export
          </MenuItem>
        </MenuContent>
      </MenuRoot>
    </header>
  );
}

/* ---------------- View title / breadcrumb ---------------- */
/**
 * Always present (one fixed height for every view) so switching views never shifts the
 * list. It reads the same deferred view as the list, so title and content change together.
 */
function ViewTitle() {
  const { view, query } = useShownView();
  const folders = useVault((s) => s.folders);
  const prompts = useVault((s) => s.prompts);

  const count = useMemo(() => {
    const all = Object.values(prompts);
    if (query.trim()) return searchPrompts(all, folders, query).length;
    switch (view.kind) {
      case 'home':
        return all.length;
      case 'favorites':
        return all.filter((p) => p.favorite).length;
      case 'recent':
        return Math.min(50, all.filter((p) => p.lastUsedAt).length);
      case 'unsorted':
        return all.filter((p) => !p.folderId).length;
      case 'folder': {
        const ids = new Set([view.id, ...descendantIds(folders, view.id)]);
        return all.filter((p) => p.folderId && ids.has(p.folderId)).length;
      }
    }
  }, [prompts, folders, view, query]);

  const titles = { home: 'Home', favorites: '⭐ Favorites', recent: '🕒 Recently used', unsorted: '📥 Unsorted' } as const;
  const path = !query.trim() && view.kind === 'folder' ? folderPath(folders, view.id) : [];
  const folder = path[path.length - 1];

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 px-4 text-[13px]">
      <motion.div
        key={viewKeyOf(view, query)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        className="flex min-w-0 flex-1 items-center gap-1"
      >
        {query.trim() ? (
          <span className="px-1 font-semibold">Results</span>
        ) : view.kind === 'folder' ? (
          path.map((f, i) => (
            <span key={f.id} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="shrink-0 text-subtle" />}
              <button
                type="button"
                onClick={() => useUI.getState().setView({ kind: 'folder', id: f.id })}
                className={cx('flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-s3', i === path.length - 1 ? 'font-semibold text-fg' : 'text-muted')}
              >
                {f.emoji ? <span>{f.emoji}</span> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: FOLDER_COLORS[f.color] }} />}
                <span className="truncate">{f.name}</span>
              </button>
            </span>
          ))
        ) : (
          <span className="px-1 font-semibold">{titles[view.kind]}</span>
        )}
      </motion.div>
      <span className="shrink-0 text-[11px] tabular-nums text-subtle">{count}</span>
      {folder && (
        <IconButton size="sm" label="Edit folder" onClick={() => useUI.getState().set({ folderDialog: { folderId: folder.id } })}>
          <Pencil size={13} />
        </IconButton>
      )}
    </div>
  );
}

/* ---------------- Footer: action hints like Raycast ---------------- */
function Footer() {
  const activeKey = useUI((s) => s.activeKey);
  const hint = (k: string, label: string) => (
    <span className="flex items-center gap-1">
      <span className="kbd">{k}</span>
      {label}
    </span>
  );
  return (
    <footer className="flex h-9 shrink-0 items-center gap-3 border-t border-line bg-s1 px-3 text-[11px] text-subtle">
      {activeKey ? (
        <>
          {hint('↵', 'Copy')}
          {surface !== 'app' && hasChrome && hint(`${modKey}↵`, 'Insert')}
          {hint(`${modKey}E`, 'Edit')}
          {hint('→', 'Expand')}
        </>
      ) : (
        <>
          {hint('↑↓', 'Navigate')}
          {hint('↵', 'Copy')}
          {hint(`${modKey}+N`, 'New')}
        </>
      )}
    </footer>
  );
}

/* ---------------- Drag & drop ---------------- */
const isDrop = (id: unknown) => String(id).startsWith('drop:');
const SORTABLE_SECTIONS = new Set(['folder', 'unsorted']);

function DnD({ docked, children }: { docked: boolean; children: React.ReactNode }) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const draggingId = useUI((s) => s.draggingId);
  const drawerOpen = useUI((s) => s.drawerOpen);
  const dragged = useVault((s) => (draggingId ? s.prompts[draggingId] : undefined));
  const folders = useVault((s) => s.folders);
  const [overFolder, setOverFolder] = useState(false);
  const openedByDrag = useRef(false);

  const collision: CollisionDetection = (args) => {
    const drops = args.droppableContainers.filter((c) => isDrop(c.id));
    const hit = pointerWithin({ ...args, droppableContainers: drops });
    if (hit.length) return hit;
    // While the drawer covers the list, only folders are valid targets.
    if (!docked && useUI.getState().drawerOpen) return [];
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isDrop(c.id)) });
  };

  const finish = () => {
    if (openedByDrag.current) useUI.getState().set({ drawerOpen: false });
    openedByDrag.current = false;
    // overFolder is intentionally kept until the next drag starts: it decides whether the
    // ghost animates back (reorder) or simply vanishes (dropped into a folder).
    // Clear after the drop has rendered so list layout animations don't fight it.
    window.setTimeout(() => useUI.getState().set({ draggingId: null }), 30);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const promptId = active.data.current?.promptId as string | undefined;
    if (promptId && over) {
      if (isDrop(over.id)) {
        const target = String(over.id).slice(5);
        const folderId = target === 'unsorted' ? null : target;
        const p = useVault.getState().prompts[promptId];
        if (p && p.folderId !== folderId) {
          void useVault.getState().movePrompt(promptId, folderId);
          const f = folderId ? folders[folderId] : undefined;
          toast(`Moved to ${f ? `${f.emoji ?? ''} ${f.name}`.trim() : 'Unsorted'}`);
        }
      } else if (over.id !== active.id) {
        const [secA] = String(active.id).split(':');
        const [secB] = String(over.id).split(':');
        if (secA === secB && SORTABLE_SECTIONS.has(secA)) {
          const keys = listRef.entries.filter((e) => e.section === secA).map((e) => e.key);
          const from = keys.indexOf(String(active.id));
          const to = keys.indexOf(String(over.id));
          if (from >= 0 && to >= 0) {
            const ids = arrayMove(keys, from, to).map((k) => k.slice(secA.length + 1));
            void useVault.getState().reorderPrompts(ids);
          }
        }
      }
    }
    finish();
  };

  const dropAnimation: DropAnimation | null = overFolder
    ? null
    : { duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.3' } } }) };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collision}
      onDragStart={({ active }) => {
        hidePeek();
        setOverFolder(false);
        useUI.getState().set({ draggingId: (active.data.current?.promptId as string) ?? null });
      }}
      onDragMove={({ activatorEvent, delta }) => {
        // Narrow layouts: dragging to the left edge slides the folder drawer in.
        if (docked || useUI.getState().drawerOpen) return;
        const x = (activatorEvent as PointerEvent).clientX + delta.x;
        if (x < 40) {
          openedByDrag.current = true;
          useUI.getState().set({ drawerOpen: true });
        }
      }}
      onDragOver={({ over }) => setOverFolder(!!over && isDrop(over.id))}
      onDragEnd={onDragEnd}
      onDragCancel={finish}
    >
      {children}

      {/* Edge affordance shown while dragging in narrow layouts. */}
      <AnimatePresence>
        {draggingId && !docked && !drawerOpen && (
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none fixed inset-y-0 left-0 z-20 flex w-10 items-center justify-center bg-gradient-to-r from-[var(--accent-soft)] to-transparent"
          >
            <span className="rotate-180 text-[10.5px] font-semibold tracking-[0.08em] text-accent-strong uppercase [writing-mode:vertical-rl]">
              Drop in folder
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <DragOverlay dropAnimation={dropAnimation} zIndex={40}>
        {dragged ? (
          <div className="flex cursor-grabbing items-center gap-2 rounded-xl border border-accent/60 bg-s3 px-3 py-2.5 shadow-pop [transform:rotate(1.2deg)]">
            <GripVertical size={14} className="shrink-0 text-subtle" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-[550]">{dragged.title}</div>
              <div className="mt-0.5 text-[11px]">
                <FolderChip folder={dragged.folderId ? folders[dragged.folderId] : undefined} />
              </div>
            </div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

/* ---------------- Global keyboard ---------------- */
function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyDialogOpen() || e.defaultPrevented) return;
      const target = e.target instanceof HTMLElement ? e.target : document.body;
      if (target.closest('[role="menu"]')) return;
      const search = document.getElementById('pv-search') as HTMLInputElement | null;
      const inSearch = target === search;
      const typing = !inSearch && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
      if (typing) return;

      const ui = useUI.getState();
      const entries = listRef.entries;
      const idx = entries.findIndex((x) => x.key === ui.activeKey);
      const active = idx >= 0 ? entries[idx] : undefined;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!entries.length) return;
        e.preventDefault();
        hidePeek();
        const next =
          e.key === 'ArrowDown' ? (idx < 0 ? 0 : Math.min(idx + 1, entries.length - 1)) : idx <= 0 ? 0 : idx - 1;
        ui.setActive(entries[next].key);
        return;
      }
      if (e.key === 'Enter' && active && !e.repeat) {
        e.preventDefault();
        runPrompt(active.prompt, mod ? 'insert' : 'copy');
        return;
      }
      if (mod && e.key.toLowerCase() === 'e' && active) {
        e.preventDefault();
        ui.set({ editor: { promptId: active.prompt.id } });
        return;
      }
      if (mod && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        ui.set({ editor: { draft: { folderId: ui.view.kind === 'folder' ? ui.view.id : null } } });
        return;
      }
      if ((mod && e.key.toLowerCase() === 'k') || (e.key === '/' && !inSearch)) {
        e.preventDefault();
        search?.focus();
        search?.select();
        return;
      }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && active) {
        // In the search box, arrows move the caret unless it's already at the end.
        if (inSearch && (search!.selectionStart ?? 0) < search!.value.length) return;
        const isOpen = !!ui.expanded[active.prompt.id];
        if ((e.key === 'ArrowRight') !== isOpen) {
          e.preventDefault();
          hidePeek();
          ui.toggleExpanded(active.prompt.id);
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (ui.drawerOpen) ui.set({ drawerOpen: false });
        else if (ui.query) ui.setQuery('');
        else if (ui.activeKey) ui.setActive(null);
        else if (surface === 'popup') window.close();
        else search?.blur();
        return;
      }
      // Type anywhere to search.
      if (!inSearch && !mod && !e.altKey && e.key.length === 1 && search) {
        search.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
