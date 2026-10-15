/// <reference types="chrome" />
/**
 * Service worker: context menu, keyboard command for the side panel, quick-save window.
 * Kept dependency-free so it loads instantly.
 */

const MENU_SAVE = 'pv-save-selection';
const MENU_PANEL = 'pv-open-panel';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_SAVE,
      title: 'Save selection to PromptVault',
      contexts: ['selection'],
    });
    chrome.contextMenus.create({
      id: MENU_PANEL,
      title: 'Open PromptVault side panel',
      contexts: ['action'],
    });
  });
});

/** Reads the selection with line breaks intact (info.selectionText collapses them). */
async function readSelection(tabId: number, frameId: number | undefined, fallback: string) {
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId, frameIds: frameId != null ? [frameId] : undefined },
      func: () => window.getSelection()?.toString() ?? '',
    });
    const text = typeof res?.result === 'string' ? res.result : '';
    return text.trim() ? text : fallback;
  } catch {
    return fallback; // e.g. pages we can't script, like the Chrome Web Store
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_PANEL && tab?.windowId != null) {
    // Called synchronously to keep the user gesture.
    void chrome.sidePanel.open({ windowId: tab.windowId });
    return;
  }
  if (info.menuItemId !== MENU_SAVE) return;

  void (async () => {
    const fallback = info.selectionText ?? '';
    const text = tab?.id != null ? await readSelection(tab.id, info.frameId, fallback) : fallback;
    await chrome.storage.session.set({
      pendingSave: { text, url: tab?.url ?? info.pageUrl, pageTitle: tab?.title },
    });

    const width = 460;
    const height = 640;
    let left: number | undefined;
    let top: number | undefined;
    try {
      const win = tab?.windowId != null ? await chrome.windows.get(tab.windowId) : undefined;
      if (win?.left != null && win.width != null && win.top != null) {
        left = Math.max(0, win.left + win.width - width - 24);
        top = win.top + 72;
      }
    } catch {
      /* default placement */
    }
    await chrome.windows.create({
      url: chrome.runtime.getURL('quicksave.html'),
      type: 'popup',
      width,
      height,
      left,
      top,
      focused: true,
    });
  })();
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel' && tab?.windowId != null) {
    void chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
