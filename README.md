# PromptVault

A fast, good-looking prompt library for Chrome (Manifest V3). Give every prompt a **name**, file it in
**folders**, and copy it with **one click**, for ChatGPT, Claude, Gemini, Midjourney or anything else.

- Titles first, full text on hover (peek) or expand. It is not a clipboard history.
- Nested folders with emoji and accent colours, plus Favorites and Recently used.
- `{{variables}}` turn a prompt into a fill-in form (`{{tone|friendly}}` sets a default).
- Fuzzy search across titles, tags, folders and content. Keyboard-first: `↑ ↓ ↵ Esc`.
- Right-click selected text on any page → **Save selection to PromptVault**.
- Drag to reorder, or drag onto a folder to move.
- JSON export and a merge-safe import.
- Optional **Insert into page** for ChatGPT, Claude and Gemini.
- Popup, Chrome **side panel**, or a full tab. Dark by default, with a light mode.

The design brief this was built to is in [docs/DESIGN.md](docs/DESIGN.md).

---

## Install (Windows), the quick way

A pre-built extension is in the `dist` folder.

1. Open Chrome and go to `chrome://extensions`.
2. Turn on **Developer mode** (toggle, top right).
3. Click **Load unpacked** and select the `dist` folder, e.g. `E:\ALL projects\promatboard\dist`.
4. Pin it: click the puzzle-piece icon in the toolbar → pin **PromptVault**.
5. Press **Ctrl+Shift+Y** to open it.

> If Ctrl+Shift+Y does nothing, another extension already owns that shortcut. Open
> `chrome://extensions/shortcuts` and assign one to PromptVault.

## Build from source (Windows)

Requirements: **Node.js 20.19+** (22 or 24 LTS recommended) from https://nodejs.org. Use the Windows installer and keep
"Add to PATH" checked.

Open **PowerShell** or **Windows Terminal** in the project folder:

```powershell
cd "E:\ALL projects\promatboard"
npm install
npm run build
```

`npm run build` type-checks and writes a fresh `dist` folder. Then, in `chrome://extensions`, click the
**↻ reload** icon on the PromptVault card (or *Load unpacked* the first time).

Other scripts:

| Command | What it does |
|---|---|
| `npm run dev` | Runs the UI at http://localhost:5173/popup.html (also `sidepanel.html`, `app.html`, `quicksave.html`) with a localStorage stand-in for `chrome.storage`. Good for fast UI work; Chrome-only features (insert, side panel, context menu) are disabled there. |
| `npm run typecheck` | TypeScript only. |
| `npm run icons` | Regenerates `public/icons/*.png` from the SVG in `scripts/make-icons.mjs`. |

## How to use

| Action | How |
|---|---|
| Open | Toolbar icon or **Ctrl+Shift+Y** |
| Open in side panel | `⋯` menu → *Open in side panel*, **Alt+Shift+Y**, or right-click the toolbar icon |
| Copy | Click a card, or `↑/↓` then **Enter** |
| Insert into the chat box | Hover a card → ↵ icon, or **Ctrl+Enter** |
| Peek / expand full text | Hover for about half a second / chevron or **→** |
| Edit | Hover → `⋯` → Edit, or **Ctrl+E** |
| New prompt | `+` button or **Ctrl+N** |
| Search | Just type (or `/`). `#tag` searches tags only |
| Variables | Write `{{name}}` or `{{name|default}}` in a prompt |
| Move to a folder | Drag onto a folder in the sidebar (in the narrow popup, drag to the **left edge** and the folder drawer slides in), or `⋯` → Move to |
| Reorder | Open a folder, then drag cards |
| Save text from a page | Select text → right-click → **Save selection to PromptVault** |
| Export / import | `⋯` → *Settings, import & export* |

### Import rules (merge, not overwrite)

- A prompt with the same id is kept from whichever copy was **edited last**. Usage counts and favourites are combined.
- A prompt with the same **title and content** as an existing one is skipped as a duplicate.
- Folders match by id, then by name under the same parent. Missing ones are created.
- A plain JSON array of `{ "title": "...", "content": "..." }` objects works too.
- Every import shows a summary toast with **Undo**.

## Permissions, and why each one is needed

| Permission | Why |
|---|---|
| `storage` | Saves your prompts and folders locally (`chrome.storage.local`). |
| `unlimitedStorage` | Lifts the 10 MB local quota so large libraries and long prompts always fit. (`chrome.storage.sync` is deliberately not used: its 8 KB-per-item limit is too small.) |
| `contextMenus` | Adds **Save selection to PromptVault** to the right-click menu. |
| `sidePanel` | Lets PromptVault stay open in Chrome's side panel next to a chat. |
| `scripting` | Runs a tiny one-off script in the current tab only when you click **Insert** (to type the prompt) or **Save selection** (to read the selected text with its line breaks). No content script runs on pages in the background. |
| `activeTab` | Grants that one-off access to the tab you're on only when you invoke PromptVault (popup, shortcut, or right-click). No browsing history access. |
| Host access: `chatgpt.com`, `chat.openai.com`, `claude.ai`, `gemini.google.com` | Lets **Insert** work from the *side panel*, which doesn't receive `activeTab`. Chrome shows this as "Read and change your data on these sites". Nothing is read except the chat box you insert into. |

No network requests, no analytics. Fonts are bundled. Your data never leaves the device.

## Project structure

```
public/manifest.json         MV3 manifest (copied into dist as-is)
public/icons/                Extension icons (generated)
popup.html, sidepanel.html,  One HTML page per surface; all share the same React app
app.html, quicksave.html
src/
  types.ts                   Folder, Prompt, Settings, ExportFile models
  background/index.ts        Service worker: context menu, side-panel shortcut, quick-save window
  entries/                   React mount points
  lib/
    storage.ts               chrome.storage.local wrapper (+ localStorage shim for dev)
    store.ts                 Zustand store: CRUD, undo snapshots, cross-view sync via storage.onChanged
    search.ts                Dependency-free fuzzy ranking with highlight ranges
    template.ts              {{variable}} parsing and filling
    insert.ts                "Insert into page" (textarea, ProseMirror, Quill)
    importExport.ts          Export + merge-safe import
    tree.ts, seed.ts, ...    Folder tree helpers, first-run examples
  components/                App shell, Sidebar, PromptList/Card, Editor, dialogs, Toaster, Peek
  styles/index.css           Design tokens (dark/light), Tailwind v4 theme, motion
docs/DESIGN.md               Design brief
```

Storage layout: one key per record (`p:<id>`, `f:<id>`, `settings`, `vars:<id>`), so editing one prompt never
rewrites the whole library.

## Troubleshooting

- **"Insert" says it couldn't find a text box.** Click into the chat box once, then try again. The prompt is copied
  automatically as a fallback, so you can paste with Ctrl+V. Site redesigns can break insertion; Copy always works.
- **Insert does nothing from the side panel on another site.** By design, the side panel can only insert on
  ChatGPT, Claude and Gemini. Use the popup (Ctrl+Shift+Y) on other sites.
- **The right-click item is missing.** It only shows when text is selected. If you just installed, reload the page.
- **Changes didn't show up after rebuilding.** Click ↻ on the extension card in `chrome://extensions`, then reopen
  the popup.
