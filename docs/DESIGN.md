# PromptVault — Design Brief

> Goal: a prompt library that feels like a native, premium tool (Raycast / Linear / Arc),
> not a clipboard history. **Names first, text second.** One click (or ↵) to copy.

## 1. What we borrowed and why

| Source | Pattern | How it shows up in PromptVault |
|---|---|---|
| **Raycast** | Command-palette first: search is always focused, ↑/↓ to move, ↵ to act, an action hint bar at the bottom | Search auto-focuses on open; a footer shows `↵ Copy · Ctrl+↵ Insert · Ctrl+E Edit` for the active row |
| **Linear** | Off-black canvas, a tonal ladder of greys instead of heavy shadows, 1px hairline borders, one restrained accent | Dark-first palette below; elevation comes from surface steps plus hairlines, not big shadows |
| **Arc** | Sidebar as the spine of the app, colourful spaces / folders, sidebar that slides over on narrow widths | Folder tree with emoji and accent colours; docked at ≥ 640px, slide-over drawer below that (popup and side panel) |
| **Notion** | Emoji as a lightweight icon system, nested pages | Every folder can take an emoji; subfolders nest without limit |
| **Apple HIG** | Clarity, deference, depth; motion that confirms rather than decorates; respect Reduce Motion | Short, purposeful motion; `prefers-reduced-motion` turns it off |
| **Existing prompt managers** (e.g. PromptDock) | Folders, tags, `{{variable}}` templates, local-only storage, global shortcut | All included; we put more weight on visual hierarchy and speed |

## 2. Layout

```
┌──────────────────────────────────────────┐
│ ☰  🔍 Search prompts…        ⌘K  ◐  ⚙   │  header: search is the hero
├──────────────────────────────────────────┤
│ PINNED                                   │  2-column compact tiles
│ ┌─────────────┐ ┌─────────────┐          │
│ │ 🎨 Portrait │ │ ✉️ Follow-up │          │
│ └─────────────┘ └─────────────┘          │
│ RECENTLY USED                            │
│ ┌──────────────────────────────────────┐ │
│ │ Code review – senior eng      ★  ⋯  │ │  title (medium weight)
│ │ You are a senior engineer reviewin… │ │  one-line preview (muted)
│ │ ● Coding  #review  {} 2 vars  · 4×  │ │  folder chip, tags, meta
│ └──────────────────────────────────────┘ │
│ ALL PROMPTS …                            │
├──────────────────────────────────────────┤
│ ↵ Copy   Ctrl+↵ Insert   Ctrl+E Edit     │  action hint bar
└──────────────────────────────────────────┘
```

- **Cards**: title first, a one-line preview, then a meta row. The full text appears on **hover** (a floating
  peek after ~600ms) or on **expand** (chevron / `→` key), never as a wall of text.
- **Sidebar**: Home, Favorites, Recent, then a collapsible folder tree with counts. Folders are drop targets.
  While a card is being dragged in narrow mode, the drawer slides open by itself so you can drop it into a folder.
- **Surfaces**: popup (400×600), Chrome side panel (fluid), full tab (docked sidebar).

## 3. Colour

Dark is the default. Tokens are CSS variables, so both themes share every component.

| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#0A0A0C` | `#F6F6F8` | Canvas |
| `--surface-1` | `#101013` | `#EFEFF2` | Sidebar, header |
| `--surface-2` | `#15151A` | `#FFFFFF` | Cards, inputs |
| `--surface-3` | `#1C1C22` | `#F9F9FB` | Hover / raised |
| `--surface-4` | `#25252C` | `#EAEAEE` | Pressed, chips |
| `--border` | `rgba(255,255,255,.07)` | `rgba(15,15,30,.08)` | Hairlines |
| `--fg` | `#EDEDF0` | `#17171C` | Primary text |
| `--fg-muted` | `#A0A0AB` | `#5A5A66` | Previews |
| `--fg-subtle` | `#6B6B77` | `#8D8D99` | Meta, hints |
| `--accent` | `#8B7CFF` | `#6A55F5` | One accent: focus, active, primary |
| `--success` | `#3DD68C` | `#14A867` | Copied ✓ |
| `--danger` | `#FF5C6C` | `#E5384A` | Delete |

Folder accents (dots, tints): slate, red, orange, amber, green, teal, blue, violet, pink. These are only used at small
sizes or as 12–16% tints, so the UI stays calm.

## 4. Typography

- **Inter Variable** (bundled locally, no network) for UI. `cv11`, `ss01`, `ss03` features on.
  - Card title 13.5px / 550, tracking −0.006em
  - Preview 12.5px / 400, muted
  - Section labels 10.5px / 600 uppercase, tracking +0.06em, subtle
- **JetBrains Mono Variable** for the monospace editor option, `{{variables}}` and key caps.
- Base size 13px for density inside a 400px popup.

## 5. Motion principles

1. **Fast**: 120ms for hover/press, 160–200ms for enter/exit, 220ms max for dialogs and drawers. Nothing exceeds 250ms.
2. **One curve**: `cubic-bezier(.22, 1, .36, 1)` (ease-out-expo-ish) for UI; a tight spring
   (`stiffness 520, damping 38`) for layout moves (reorder, list changes).
3. **Motion confirms an action**: hover lift (−1px plus a brighter border), copy (green ring pulse, a check icon
   drawn in, toast slides up 8px), folder expand (height and opacity), list filter (fade and slide).
4. **Cheap at scale**: hover effects are CSS transitions (GPU transforms only). Per-item enter/exit animation turns off
   once a list has more than 80 items, and cards use `content-visibility: auto` so 500+ prompts stay instant.
5. **Respect Reduce Motion**: `MotionConfig reducedMotion="user"`, and a CSS media query collapses all durations.

## 6. Interaction and accessibility

- Search auto-focused. `↑/↓` move, `↵` copy, `Ctrl+↵` insert into page, `Ctrl+E` edit, `→` expand,
  `Ctrl+N` new prompt, `/` focus search, `Esc` clear → close.
- Every icon button has an `aria-label` and a tooltip. Visible 2px accent focus rings (`:focus-visible` only).
- The list is a `listbox` with `aria-activedescendant`, so screen readers follow the keyboard cursor.
- Dialogs trap focus (Radix), restore focus on close, and close on `Esc`.
- Destructive actions use **Undo** toasts instead of confirmation dialogs where possible.
