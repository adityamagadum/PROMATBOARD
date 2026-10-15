import type { Prompt } from '../types';
import { toast } from '../components/Toaster';
import { copyText } from './clipboard';
import { insertIntoActiveTab } from './insert';
import { hasChrome } from './storage';
import { useVault } from './store';
import { hasVars } from './template';
import { surface, useUI } from './ui';

export const canInsert = () => hasChrome && surface !== 'app' && surface !== 'quicksave';

const closePopupSoon = (ms = 450) => {
  if (surface === 'popup') window.setTimeout(() => window.close(), ms);
};

/** Entry point for clicking a card / pressing Enter. Opens the variable form when needed. */
export function runPrompt(prompt: Prompt, mode: 'copy' | 'insert' = 'copy') {
  if (hasVars(prompt.content)) {
    useUI.getState().set({ varDialog: { promptId: prompt.id, mode } });
    return;
  }
  void deliver(prompt, prompt.content, mode);
}

/** Copies or inserts final text and records usage. */
export async function deliver(prompt: Prompt, text: string, mode: 'copy' | 'insert') {
  const { markUsed, settings } = useVault.getState();
  const ui = useUI.getState();

  if (mode === 'insert' && canInsert()) {
    const res = await insertIntoActiveTab(text);
    if (res.ok) {
      ui.flashCopied(prompt.id);
      toast('Inserted into page');
      void markUsed(prompt.id);
      closePopupSoon(350);
      return;
    }
    const copied = await copyText(text);
    toast(copied ? `${res.reason}. Copied instead.` : res.reason, { kind: copied ? 'info' : 'error', duration: 3200 });
    if (copied) void markUsed(prompt.id);
    return;
  }

  const ok = await copyText(text);
  if (!ok) {
    toast("Couldn't access the clipboard", { kind: 'error' });
    return;
  }
  ui.flashCopied(prompt.id);
  toast('Copied');
  void markUsed(prompt.id);
  if (settings.closeOnCopy) closePopupSoon();
}

export async function deletePromptWithUndo(prompt: Prompt) {
  if (!useVault.getState().prompts[prompt.id]) return; // already gone
  const undo = await useVault.getState().deletePrompt(prompt.id);
  toast(`Deleted “${prompt.title}”`, { kind: 'info', action: { label: 'Undo', run: () => void undo() } });
}

export async function duplicatePrompt(prompt: Prompt) {
  const { id: _id, ...rest } = prompt;
  void _id;
  const copy = await useVault.getState().savePrompt({
    ...rest,
    title: `${prompt.title} (copy)`,
    usageCount: 0,
    lastUsedAt: null,
    favorite: false,
    createdAt: Date.now(),
    order: prompt.order + 0.5, // right below the original
  });
  toast('Duplicated', { kind: 'info' });
  return copy;
}
