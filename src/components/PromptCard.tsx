import { memo, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { useDraggable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import { CSS, type Transform } from '@dnd-kit/utilities';
import {
  Braces,
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  CornerDownLeft,
  FolderInput,
  Inbox,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from 'lucide-react';
import type { Folder, Prompt } from '../types';
import { canInsert, deletePromptWithUndo, duplicatePrompt, runPrompt } from '../lib/actions';
import { useVault } from '../lib/store';
import { extractVars, segments } from '../lib/template';
import { flattenTree } from '../lib/tree';
import { useUI } from '../lib/ui';
import { cx, FOLDER_COLORS, modKey, previewLine, relativeTime } from '../lib/utils';
import {
  afterMenuClose,
  IconButton,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from './ui';
import { hidePeek, schedulePeek } from './Peek';

/** Title with fuzzy-match characters highlighted. */
export function Highlighted({ text, marks }: { text: string; marks?: number[] }) {
  if (!marks?.length) return <>{text}</>;
  const set = new Set(marks);
  const out: ReactNode[] = [];
  let buf = '';
  let hl = false;
  const flush = (i: number) => {
    if (!buf) return;
    out.push(
      hl ? (
        <mark key={i} className="rounded-[3px] bg-accent-soft text-accent-strong">
          {buf}
        </mark>
      ) : (
        buf
      ),
    );
    buf = '';
  };
  for (let i = 0; i < text.length; i++) {
    const h = set.has(i);
    if (h !== hl) {
      flush(i);
      hl = h;
    }
    buf += text[i];
  }
  flush(text.length);
  return <>{out}</>;
}

/** Content with {{variables}} rendered as chips. */
export function RichContent({ text }: { text: string }) {
  return (
    <>
      {segments(text).map((s, i) =>
        s.varName ? (
          <span key={i} className="var-chip">
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

export function FolderChip({ folder }: { folder?: Folder }) {
  if (!folder)
    return (
      <span className="inline-flex min-w-0 items-center gap-1 text-subtle">
        <Inbox size={11} /> Unsorted
      </span>
    );
  return (
    <span className="inline-flex min-w-0 items-center gap-1 text-muted">
      {folder.emoji ? (
        <span className="text-[11px] leading-none">{folder.emoji}</span>
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: FOLDER_COLORS[folder.color] }} />
      )}
      <span className="truncate">{folder.name}</span>
    </span>
  );
}

interface DndBits {
  setNodeRef: (n: HTMLElement | null) => void;
  attributes: object;
  listeners: object | undefined;
  transform: Transform | null;
  transition?: string;
  isDragging: boolean;
}

interface CardProps {
  entryKey: string;
  prompt: Prompt;
  folder?: Folder;
  showFolder: boolean;
  active: boolean;
  titleMatches?: number[];
}

/**
 * Cards in reorderable views (a folder, Unsorted) are sortable; elsewhere they are only
 * draggable (into a folder). Plain draggables don't register droppables, which keeps
 * mounting a page of search results cheap.
 */
export const SortablePromptCard = memo(function SortablePromptCard(props: CardProps) {
  const s = useSortable({ id: props.entryKey, data: { promptId: props.prompt.id } });
  return <PromptCard {...props} dnd={s} />;
});

export const DraggablePromptCard = memo(function DraggablePromptCard(props: CardProps) {
  const d = useDraggable({ id: props.entryKey, data: { promptId: props.prompt.id } });
  return <PromptCard {...props} dnd={{ ...d, transform: null }} />;
});

const PromptCard = memo(function PromptCard({
  entryKey,
  prompt,
  folder,
  showFolder,
  active,
  titleMatches,
  dnd,
}: CardProps & { dnd: DndBits }) {
  const expanded = useUI((s) => !!s.expanded[prompt.id]);
  const copied = useUI((s) => s.copiedId === prompt.id);
  const showInsert = useVault((s) => s.settings.showInsert) && canInsert();
  const ref = useRef<HTMLDivElement | null>(null);
  const [hot, setHot] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = dnd;

  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };

  const varCount = prompt.content.includes('{{') ? extractVars(prompt.content).length : 0;
  // Tags are keys below; de-duplicate so older or hand-edited data can't produce duplicate keys.
  const tags = useMemo(() => [...new Set(prompt.tags)], [prompt.tags]);
  const preview = previewLine(prompt.content).slice(0, 220);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={(n) => {
        setNodeRef(n);
        ref.current = n;
      }}
      style={style}
      {...attributes}
      {...listeners}
      role="option"
      tabIndex={-1}
      id={`entry-${entryKey}`}
      aria-selected={active}
      aria-label={prompt.title}
      data-active={active}
      data-copied={copied}
      onClick={() => {
        hidePeek();
        runPrompt(prompt);
      }}
      onMouseEnter={() => {
        setHot(true);
        if (!expanded && ref.current) schedulePeek(prompt, ref.current);
      }}
      onMouseLeave={() => {
        setHot(false);
        hidePeek();
      }}
      className={cx(
        'card group relative cursor-pointer rounded-xl px-3 py-2.5 outline-none',
        isDragging && 'opacity-30',
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {prompt.favorite && <Star size={11} className="shrink-0 fill-amber-400 text-amber-400" aria-label="Favorite" />}
        <h3 className="min-w-0 flex-1 truncate text-[13.5px] font-[550] tracking-[-0.006em] text-fg">
          <Highlighted text={prompt.title} marks={titleMatches} />
        </h3>
        <AnimatePresence>
          {copied && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="flex shrink-0 items-center gap-1 rounded-full bg-success-soft px-1.5 py-px text-[10.5px] font-semibold text-success"
            >
              <Check size={11} strokeWidth={3} /> Copied
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {!expanded && (
        <p className="mt-0.5 truncate text-[12.5px] text-muted">
          <RichContent text={preview} />
        </p>
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              onClick={stop}
              className={cx(
                'mt-1.5 max-h-56 cursor-text overflow-y-auto rounded-lg border border-line bg-s1 px-2.5 py-2 text-[12.5px] leading-relaxed whitespace-pre-wrap break-words text-fg select-text',
                prompt.monospace && 'font-mono text-[12px]',
              )}
            >
              <RichContent text={prompt.content} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-1.5 flex min-w-0 items-center gap-2 text-[11px] text-subtle">
        {showFolder && <FolderChip folder={folder} />}
        {tags.slice(0, 3).map((t) => (
          <span key={t} className="truncate">
            #{t}
          </span>
        ))}
        {tags.length > 3 && <span>+{tags.length - 3}</span>}
        <span className="flex-1" />
        {varCount > 0 && (
          <span className="flex shrink-0 items-center gap-0.5 text-accent-strong/80" title="Template variables">
            <Braces size={11} /> {varCount}
          </span>
        )}
        {prompt.usageCount > 0 && (
          <span className="shrink-0 tabular-nums" title={`Used ${prompt.usageCount} times, last ${relativeTime(prompt.lastUsedAt)}`}>
            {prompt.usageCount}× · {relativeTime(prompt.lastUsedAt)}
          </span>
        )}
      </div>

      {/* Hover actions float over the title so it keeps its full width at rest. They are only
          mounted while the card is hot: tooltips and menus for 500+ idle cards would cost ~seconds. */}
      {(hot || menuOpen || active || expanded) && (
        <div
          onClick={stop}
          onPointerDown={stop}
          className="absolute top-1.5 right-1.5 flex animate-[fade-in_120ms_ease-out] items-center gap-0.5 rounded-lg bg-s3 p-0.5 shadow-[0_0_0_1px_var(--border)]"
        >
          {showInsert && (
            <IconButton size="sm" label="Insert into page" shortcut={`${modKey}+↵`} onClick={() => runPrompt(prompt, 'insert')}>
              <CornerDownLeft size={13} />
            </IconButton>
          )}
          <IconButton size="sm" label="Copy" shortcut="↵" onClick={() => runPrompt(prompt)}>
            <Copy size={13} />
          </IconButton>
          <IconButton
            size="sm"
            label={prompt.favorite ? 'Unpin from favorites' : 'Pin to favorites'}
            onClick={() => void useVault.getState().toggleFavorite(prompt.id)}
          >
            <Star size={13} className={prompt.favorite ? 'fill-amber-400 text-amber-400' : ''} />
          </IconButton>
          <IconButton
            size="sm"
            label={expanded ? 'Collapse' : 'Show full prompt'}
            shortcut="→"
            aria-expanded={expanded}
            onClick={() => {
              hidePeek();
              useUI.getState().toggleExpanded(prompt.id);
            }}
          >
            <ChevronDown size={14} className={cx('transition-transform duration-200', expanded && 'rotate-180')} />
          </IconButton>
          <CardMenu
            prompt={prompt}
            // The toolbar holds the menu's anchor button, so it stays mounted until the menu's
            // close animation has finished; unmounting earlier flings the menu to the corner.
            onOpenChange={(o) => (o ? setMenuOpen(true) : afterMenuClose(() => setMenuOpen(false)))}
          />
        </div>
      )}
    </div>
  );
});

export function CardMenu({ prompt, onOpenChange }: { prompt: Prompt; onOpenChange?: (open: boolean) => void }) {
  const folders = useVault((s) => s.folders);
  const { movePrompt, toggleFavorite } = useVault.getState();
  const edit = () => useUI.getState().set({ editor: { promptId: prompt.id } });
  return (
    <MenuRoot modal={false} onOpenChange={onOpenChange}>
      <MenuTrigger asChild>
        <IconButton size="sm" label="More actions">
          <MoreHorizontal size={14} />
        </IconButton>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Copy size={14} />} shortcut="↵" onSelect={() => runPrompt(prompt)}>
          Copy
        </MenuItem>
        {canInsert() && (
          <MenuItem icon={<CornerDownLeft size={14} />} shortcut={`${modKey}↵`} onSelect={() => runPrompt(prompt, 'insert')}>
            Insert into page
          </MenuItem>
        )}
        <MenuItem icon={<Pencil size={14} />} shortcut={`${modKey}E`} onSelect={edit}>
          Edit
        </MenuItem>
        <MenuItem icon={<CopyPlus size={14} />} onSelect={() => void duplicatePrompt(prompt)}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<Star size={14} />} onSelect={() => afterMenuClose(() => void toggleFavorite(prompt.id))}>
          {prompt.favorite ? 'Unpin from favorites' : 'Pin to favorites'}
        </MenuItem>
        <MenuSub>
          <MenuSubTrigger icon={<FolderInput size={14} />}>Move to</MenuSubTrigger>
          <MenuSubContent>
            <MenuItem icon={<Inbox size={13} />} onSelect={() => afterMenuClose(() => void movePrompt(prompt.id, null))}>
              Unsorted
            </MenuItem>
            {flattenTree(folders).map(({ folder, depth }) => (
              <MenuItem
                key={folder.id}
                icon={
                  folder.emoji ? (
                    <span className="text-[12px]">{folder.emoji}</span>
                  ) : (
                    <span className="h-2 w-2 rounded-full" style={{ background: FOLDER_COLORS[folder.color] }} />
                  )
                }
                onSelect={() => afterMenuClose(() => void movePrompt(prompt.id, folder.id))}
              >
                <span style={{ paddingLeft: depth * 10 }}>
                  {folder.name}
                  {folder.id === prompt.folderId && <span className="ml-1 text-subtle">✓</span>}
                </span>
              </MenuItem>
            ))}
          </MenuSubContent>
        </MenuSub>
        <MenuSeparator />
        {/* Delete / move / unpin can remove this card (the menu's anchor): run them after the menu closes. */}
        <MenuItem icon={<Trash2 size={14} />} danger onSelect={() => afterMenuClose(() => void deletePromptWithUndo(prompt))}>
          Delete
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
}

/** Compact tile used in the Pinned grid on Home. */
export const PromptTile = memo(function PromptTile({
  entryKey,
  prompt,
  folder,
  active,
}: {
  entryKey: string;
  prompt: Prompt;
  folder?: Folder;
  active: boolean;
}) {
  const copied = useUI((s) => s.copiedId === prompt.id);
  const ref = useRef<HTMLDivElement>(null);
  const hasVar = prompt.content.includes('{{');
  return (
    <div
      ref={ref}
      role="option"
      tabIndex={-1}
      id={`entry-${entryKey}`}
      aria-selected={active}
      data-active={active}
      data-copied={copied}
      onClick={() => {
        hidePeek();
        runPrompt(prompt);
      }}
      onMouseEnter={() => ref.current && schedulePeek(prompt, ref.current)}
      onMouseLeave={hidePeek}
      className="card group relative flex h-[58px] cursor-pointer flex-col justify-between rounded-xl px-2.5 py-2"
    >
      <div className="flex items-center gap-1.5 text-[11px] text-subtle">
        {folder?.emoji ? (
          <span className="text-[12px] leading-none">{folder.emoji}</span>
        ) : (
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: folder ? FOLDER_COLORS[folder.color] : 'var(--fg-subtle)' }} />
        )}
        <span className="truncate">{folder?.name ?? 'Unsorted'}</span>
        <span className="flex-1" />
        {copied ? (
          <Check size={12} strokeWidth={3} className="text-success" />
        ) : (
          hasVar && <Braces size={11} className="text-accent-strong/80" />
        )}
      </div>
      <div className="truncate text-[12.5px] font-[550] tracking-[-0.006em] text-fg">{prompt.title}</div>
    </div>
  );
});
