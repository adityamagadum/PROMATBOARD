import { useMemo, useState } from 'react';
import { Check, Folder as FolderIcon } from 'lucide-react';
import type { FolderColor } from '../types';
import { useVault } from '../lib/store';
import { descendantIds, flattenTree } from '../lib/tree';
import { useUI } from '../lib/ui';
import { COLOR_NAMES, cx, FOLDER_COLORS } from '../lib/utils';
import { Button, Field, inputClass, Sheet } from './ui';

const EMOJIS = [
  '✨', '🎨', '🖼️', '📸', '🎬', '✍️', '📝', '📚', '💡', '🧠', '🤖', '💻',
  '🐞', '🔍', '📈', '📊', '💼', '📣', '✉️', '💬', '🌍', '🎯', '🚀', '⚡',
  '🔥', '🌱', '🧪', '🎵', '🎮', '🛒', '❤️', '⭐', '🔒', '⚙️', '🧩', '📌',
];

export function FolderDialog() {
  const dlg = useUI((s) => s.folderDialog);
  const close = () => useUI.getState().set({ folderDialog: null });
  return (
    <Sheet open={!!dlg} onOpenChange={(o) => !o && close()} title={dlg?.folderId ? 'Edit folder' : 'New folder'} initialFocus="#pv-folder-name">
      {dlg && <FolderForm key={dlg.folderId ?? 'new'} folderId={dlg.folderId} parentId={dlg.parentId ?? null} onDone={close} />}
    </Sheet>
  );
}

function FolderForm({ folderId, parentId, onDone }: { folderId?: string; parentId: string | null; onDone: () => void }) {
  const folders = useVault((s) => s.folders);
  const existing = folderId ? folders[folderId] : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState<string | undefined>(existing?.emoji);
  const [color, setColor] = useState<FolderColor>(existing?.color ?? COLOR_NAMES[(Object.keys(folders).length + 6) % COLOR_NAMES.length]);
  const [parent, setParent] = useState<string | null>(existing ? existing.parentId : parentId);

  // A folder can't move inside itself or its own subfolders.
  const blocked = useMemo(() => (folderId ? new Set([folderId, ...descendantIds(folders, folderId)]) : new Set<string>()), [folders, folderId]);

  const save = async () => {
    const f = await useVault.getState().saveFolder({ id: folderId, name, emoji, color, parentId: parent });
    if (parent) void useVault.getState().setFolderCollapsed(parent, false);
    if (!folderId) useUI.getState().setView({ kind: 'folder', id: f.id });
    onDone();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) void save();
      }}
      className="space-y-3.5 pt-1"
    >
      <div className="flex items-center gap-2">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[18px]"
          style={{ background: `color-mix(in srgb, ${FOLDER_COLORS[color]} 18%, transparent)` }}
        >
          {emoji ?? <FolderIcon size={18} style={{ color: FOLDER_COLORS[color] }} fill={FOLDER_COLORS[color]} fillOpacity={0.25} />}
        </div>
        <input
          id="pv-folder-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Folder name"
          aria-label="Folder name"
          maxLength={60}
          className={cx(inputClass, 'h-10 text-[14px] font-medium')}
        />
      </div>

      <Field label="Color">
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Folder color">
          {COLOR_NAMES.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={color === c}
              aria-label={c}
              onClick={() => setColor(c)}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
              style={{ background: FOLDER_COLORS[c], boxShadow: color === c ? `0 0 0 2px var(--surface-2), 0 0 0 4px ${FOLDER_COLORS[c]}` : undefined }}
            >
              {color === c && <Check size={13} strokeWidth={3} className="text-white" />}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Icon" hint={emoji ? <button type="button" className="hover:text-fg" onClick={() => setEmoji(undefined)}>Remove</button> : 'Optional'}>
        <div className="grid grid-cols-12 gap-0.5 rounded-lg border border-line bg-s1 p-1.5">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              aria-label={`Use ${e}`}
              aria-pressed={emoji === e}
              onClick={() => setEmoji(emoji === e ? undefined : e)}
              className={cx(
                'flex aspect-square items-center justify-center rounded-md text-[15px] transition-[background-color,transform] duration-100 hover:scale-110 hover:bg-s4',
                emoji === e && 'bg-accent-soft ring-1 ring-accent',
              )}
            >
              {e}
            </button>
          ))}
        </div>
        <input
          value={emoji && !EMOJIS.includes(emoji) ? emoji : ''}
          onChange={(e) => setEmoji(e.target.value.trim() ? [...e.target.value.trim()].slice(0, 2).join('') : undefined)}
          placeholder="…or type/paste any emoji"
          aria-label="Custom emoji"
          className={cx(inputClass, 'mt-1.5 h-8')}
        />
      </Field>

      <Field label="Inside">
        <select value={parent ?? ''} onChange={(e) => setParent(e.target.value || null)} className={cx(inputClass, 'h-8.5 cursor-pointer')}>
          <option value="">Top level</option>
          {flattenTree(folders)
            .filter(({ folder }) => !blocked.has(folder.id))
            .map(({ folder, depth }) => (
              <option key={folder.id} value={folder.id}>
                {'   '.repeat(depth)}
                {folder.emoji ?? '📁'} {folder.name}
              </option>
            ))}
        </select>
      </Field>

      <div className="-mx-4 flex justify-end gap-2 border-t border-line px-4 pt-3">
        <Button variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={!name.trim()}>
          {existing ? 'Save' : 'Create folder'}
        </Button>
      </div>
    </form>
  );
}
