import { hasChrome } from './storage';

export type InsertResult = { ok: true } | { ok: false; reason: string };

/**
 * Types `text` into the chat box of the active tab.
 *
 * Runs `injected` inside the page with chrome.scripting. Works on ChatGPT, Claude and Gemini
 * (host permissions) and on any page while the popup was opened from it (activeTab).
 * Callers should fall back to copying when this fails.
 */
export async function insertIntoActiveTab(text: string): Promise<InsertResult> {
  if (!hasChrome || !chrome.scripting) return { ok: false, reason: 'Not running as an extension' };
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return { ok: false, reason: 'No active tab' };
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injected,
      args: [text],
    });
    return (res?.result as InsertResult) ?? { ok: false, reason: 'No result' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      reason: /cannot access|permission|chrome:\/\//i.test(msg) ? "Can't type into this page" : msg,
    };
  }
}

/**
 * Executed in the page. Must be self-contained (no closures or imports).
 *
 * Strategy for rich editors (ProseMirror on ChatGPT/Claude, Quill on Gemini):
 * 1. focus + caret at the end, then `execCommand('insertText')` - fires the native
 *    beforeinput/input events these editors listen to, so their state stays in sync;
 * 2. if nothing changed, dispatch a synthetic paste with a DataTransfer (editors parse it);
 * Plain <textarea>/<input> use the native value setter + an `input` event (React-safe).
 */
function injected(text: string): InsertResult {
  const SELECTORS = [
    '#prompt-textarea', // ChatGPT (ProseMirror div)
    'div.ProseMirror[contenteditable="true"]', // Claude
    'rich-textarea .ql-editor[contenteditable="true"]', // Gemini (Quill)
    '.ql-editor[contenteditable="true"]',
    'textarea[data-id="root"]',
  ];

  const visible = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const isEditable = (el: Element | null): el is HTMLElement =>
    !!el &&
    (el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLInputElement && /^(text|search|url|email|)$/.test(el.type)) ||
      (el as HTMLElement).isContentEditable);

  let target: HTMLElement | null = null;
  const active = document.activeElement;
  if (isEditable(active) && visible(active)) target = active;
  if (!target) {
    for (const sel of SELECTORS) {
      const el = document.querySelector(sel);
      if (el && isEditable(el) && visible(el)) {
        target = el as HTMLElement;
        break;
      }
    }
  }
  if (!target) {
    // Last resort: the largest visible editable element on the page.
    const candidates = [
      ...document.querySelectorAll<HTMLElement>('textarea, [contenteditable="true"]'),
    ].filter((el) => isEditable(el) && visible(el));
    candidates.sort(
      (a, b) =>
        b.getBoundingClientRect().width * b.getBoundingClientRect().height -
        a.getBoundingClientRect().width * a.getBoundingClientRect().height,
    );
    target = candidates[0] ?? null;
  }
  if (!target) return { ok: false, reason: 'No text box found on this page' };

  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const el = target;
    el.focus();
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const next = el.value.slice(0, start) + text + el.value.slice(end);
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.setSelectionRange(start + text.length, start + text.length);
    return { ok: true };
  }

  // contenteditable
  const el = target;
  el.focus();
  const sel = window.getSelection();
  if (sel && (!sel.rangeCount || !el.contains(sel.anchorNode))) {
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
  const before = el.innerText;

  try {
    document.execCommand('insertText', false, text);
  } catch {
    /* fall through to paste */
  }
  if (el.innerText !== before) return { ok: true };

  const dt = new DataTransfer();
  dt.setData('text/plain', text);
  el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  if (el.innerText !== before) return { ok: true };

  return { ok: false, reason: "This editor didn't accept the text" };
}
