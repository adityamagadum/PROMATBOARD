import { memo, useMemo, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDroppable } from '@dnd-kit/core';
import {
  ChevronRight,
  Clock,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  Inbox,
  MoreHorizontal,
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
} from 'lucide-react';
import type { Folder, View } from '../types';
import { useVault } from '../lib/store';
import { childrenOf, descendantIds } from '../lib/tree';
import { useUI } from '../lib/ui';
import { cx, FOLDER_COLORS } from '../lib/utils';
import { IconButton, MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from './ui';
import { toast } from './Toaster';

const sameView = (a: View, b: View) =>
  a.kind === b.kind && (a.kind !== 'folder' || (b.kind === 'folder' && a.id === b.id));

export function Logo({ size = 22 }: { size?: number }) {
  return <img src="/icons/icon-48.png" width={size} height={size} alt="" className="shrink-0 rounded-[6px]" />;
}

export function Sidebar() {
  const prompts = useVault((s) => s.prompts);
  const folders = useVault((s) => s.folders);
  const view = useUI((s) => s.view);

  const counts = useMemo(() => {
    const direct: Record<string, number> = {};
    let favorites = 0;
    let unsorted = 0;
    let recent = 0;
    for (const p of Object.values(prompts)) {
      if (p.folderId) direct[p.folderId] = (direct[p.folderId] ?? 0) + 1;
      else unsorted++;
      if (p.favorite) favorites++;
      if (p.lastUsedAt) recent++;
    }
    // Folder badges count everything inside, including subfolders.
    const total: Record<string, number> = {};
    for (const id of Object.keys(folders)) {
      total[id] = [id, ...descendantIds(folders, id)].reduce((n, f) => n + (direct[f] ?? 0), 0);
    }
    return { total, favorites, unsorted, recent, all: Object.keys(prompts).length };
  }, [prompts, folders]);

  const roots = childrenOf(folders, null);
  const go = (v: View) => useUI.getState().setView(v);

  return (
    <nav aria-label="Library" className="flex h-full w-full flex-col bg-s1">
      <div className="flex h-12 shrink-0 items-center gap-2 px-3.5">
        <Logo />
        <span className="text-[13.5px] font-semibold tracking-[-0.01em]">PromptVault</span>
      </div>

      {/* layoutScroll: the selection indicator animates correctly even when this list is scrolled. */}
      <motion.div layoutScroll className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-px">
          <NavRow icon={<Home size={15} />} label="Home" count={counts.all} active={sameView(view, { kind: 'home' })} onClick={() => go({ kind: 'home' })} />
          <NavRow
            icon={<Star size={15} />}
            label="Favorites"
            count={counts.favorites}
            active={sameView(view, { kind: 'favorites' })}
            onClick={() => go({ kind: 'favorites' })}
          />
          <NavRow icon={<Clock size={15} />} label="Recently used" count={counts.recent} active={sameView(view, { kind: 'recent' })} onClick={() => go({ kind: 'recent' })} />
          {(counts.unsorted > 0 || view.kind === 'unsorted') && (
            <DropRow id="drop:unsorted">
              <NavRow
                icon={<Inbox size={15} />}
                label="Unsorted"
                count={counts.unsorted}
                active={sameView(view, { kind: 'unsorted' })}
                onClick={() => go({ kind: 'unsorted' })}
              />
            </DropRow>
          )}
        </div>

        <div className="mt-4 mb-1 flex items-center justify-between pr-1 pl-2">
          <span className="section-label">Folders</span>
          <IconButton size="sm" label="New folder" onClick={() => useUI.getState().set({ folderDialog: { parentId: null } })}>
            <Plus size={14} />
          </IconButton>
        </div>

        {roots.length === 0 ? (
          <button
            type="button"
            onClick={() => useUI.getState().set({ folderDialog: { parentId: null } })}
            className="mx-1 flex w-[calc(100%-8px)] items-center gap-2 rounded-lg border border-dashed border-line-strong px-2.5 py-2 text-[12px] text-subtle transition-colors hover:border-accent hover:text-fg"
          >
            <FolderPlus size={14} /> Create your first folder
          </button>
        ) : (
          <ul role="tree" aria-label="Folders" className="space-y-px">
            {roots.map((f) => (
              <TreeNode key={f.id} folder={f} depth={0} counts={counts.total} />
            ))}
          </ul>
        )}
      </motion.div>

      <div className="shrink-0 border-t border-line p-2">
        <NavRow icon={<Settings size={15} />} label="Settings & data" onClick={() => useUI.getState().set({ settingsOpen: true })} />
      </div>
    </nav>
  );
}

function NavRow({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'relative flex h-8 w-full items-center gap-2.5 rounded-lg px-2 text-left text-[12.5px] transition-colors duration-100',
        active ? 'bg-s4 font-medium text-fg' : 'text-muted hover:bg-s3 hover:text-fg',
      )}
    >
      {active && <SelectionBar color="var(--accent)" />}
      <span className={cx('flex w-4 justify-center', active && 'text-accent-strong')}>{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {count != null && count > 0 && <span className="text-[11px] tabular-nums text-subtle">{count}</span>}
    </button>
  );
}

/**
 * The accent bar marking the current view. One shared layoutId for nav rows and folders,
 * so the bar slides from Home to a folder and back instead of blinking out and in.
 */
function SelectionBar({ color }: { color: string }) {
  return (
    <motion.span
      layoutId="sidebar-selection"
      className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full"
      style={{ background: color }}
      transition={{ type: 'spring', stiffness: 600, damping: 42 }}
    />
  );
}

/** Wraps a row so prompts can be dropped onto it. */
function DropRow({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        'rounded-lg transition-[box-shadow,background-color] duration-100',
        active && 'ring-1 ring-line',
        isOver && 'bg-accent-soft ring-2 ring-accent',
      )}
    >
      {children}
    </div>
  );
}

const TreeNode = memo(function TreeNode({
  folder,
  depth,
  counts,
}: {
  folder: Folder;
  depth: number;
  counts: Record<string, number>;
}) {
  const folders = useVault((s) => s.folders);
  const selected = useUI((s) => s.view.kind === 'folder' && s.view.id === folder.id);
  const children = childrenOf(folders, folder.id);
  const open = !folder.collapsed;
  const { setNodeRef, isOver } = useDroppable({ id: `drop:${folder.id}` });
  const color = FOLDER_COLORS[folder.color];

  const toggle = () => void useVault.getState().setFolderCollapsed(folder.id, open);

  const remove = async () => {
    const undo = await useVault.getState().deleteFolder(folder.id);
    if (selected) useUI.getState().setView({ kind: 'home' });
    toast(`Deleted “${folder.name}”`, { kind: 'info', action: { label: 'Undo', run: () => void undo() } });
  };

  return (
    <li role="treeitem" aria-expanded={children.length ? open : undefined} aria-selected={selected}>
      <div
        ref={setNodeRef}
        style={{ paddingLeft: 4 + depth * 14 }}
        onClick={() => useUI.getState().setView({ kind: 'folder', id: folder.id })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            useUI.getState().setView({ kind: 'folder', id: folder.id });
          } else if (e.key === 'ArrowRight' && !open) toggle();
          else if (e.key === 'ArrowLeft' && open && children.length) toggle();
        }}
        tabIndex={0}
        className={cx(
          'group relative flex h-8 cursor-pointer items-center gap-1.5 rounded-lg pr-1 text-[12.5px] transition-[background-color,box-shadow] duration-100',
          selected ? 'bg-s4 font-medium text-fg' : 'text-muted hover:bg-s3 hover:text-fg',
          isOver && 'bg-accent-soft text-fg ring-2 ring-accent',
        )}
      >
        {selected && <SelectionBar color={color} />}
        <button
          type="button"
          tabIndex={-1}
          aria-label={open ? `Collapse ${folder.name}` : `Expand ${folder.name}`}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cx(
            'flex h-5 w-4 shrink-0 items-center justify-center rounded text-subtle hover:text-fg',
            !children.length && 'invisible',
          )}
        >
          <ChevronRight size={13} className={cx('transition-transform duration-200 ease-out', open && 'rotate-90')} />
        </button>
        {folder.emoji ? (
          <span className="flex w-4 shrink-0 justify-center text-[13px] leading-none">{folder.emoji}</span>
        ) : (
          <FolderIcon size={14} className="shrink-0" style={{ color }} fill={color} fillOpacity={0.22} />
        )}
        <span className="min-w-0 flex-1 truncate">{folder.name}</span>
        <span className="text-[11px] tabular-nums text-subtle group-hover:hidden group-focus-within:hidden">
          {counts[folder.id] || ''}
        </span>
        <div className="hidden items-center group-hover:flex group-focus-within:flex" onClick={(e) => e.stopPropagation()}>
          <MenuRoot modal={false}>
            <MenuTrigger asChild>
              <IconButton size="sm" label={`${folder.name} options`} className="h-6 w-6">
                <MoreHorizontal size={14} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem
                icon={<Plus size={14} />}
                onSelect={() => useUI.getState().set({ editor: { draft: { folderId: folder.id } } })}
              >
                New prompt here
              </MenuItem>
              <MenuItem icon={<FolderPlus size={14} />} onSelect={() => useUI.getState().set({ folderDialog: { parentId: folder.id } })}>
                New subfolder
              </MenuItem>
              <MenuItem icon={<Pencil size={14} />} onSelect={() => useUI.getState().set({ folderDialog: { folderId: folder.id } })}>
                Edit folder
              </MenuItem>
              <MenuSeparator />
              <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => void remove()}>
                Delete folder
              </MenuItem>
            </MenuContent>
          </MenuRoot>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {open && children.length > 0 && (
          <motion.ul
            role="group"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-px overflow-hidden pt-px"
          >
            {children.map((c) => (
              <TreeNode key={c.id} folder={c} depth={depth + 1} counts={counts} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </li>
  );
});
