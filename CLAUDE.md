# Krypta v2

Minimalist, keyboard-first file explorer built with Electron + Svelte 5.

## Running

```bash
npm run dev    # dev server + electron (hot reload on renderer changes, restart needed for preload/main)
npm run build  # production build
```

**Note:** Electron binary install is broken in Claude Code's environment due to `ELECTRON_RUN_AS_NODE=1`. Fix:
```bash
unzip ~/.cache/electron/<hash>/electron-v*.zip -d node_modules/electron/dist/
printf 'electron' > node_modules/electron/path.txt
chmod +x node_modules/electron/dist/electron
```

**GUI verification:** User tests the app directly and shares screenshots. Do not invoke the `/run` skill or set up playwright/headless drivers.

## Architecture

- `src/main/index.js` — Electron main process, BrowserWindow config, IPC handlers
- `src/preload/index.js` — Node.js → renderer bridge via `contextBridge` (exposed as `window.krypta`)
- `src/renderer/src/App.svelte` — pane array state, global keyboard handlers, drag state, undo/redo
- `src/renderer/src/lib/Pane.svelte` — all file browsing logic, smart bar, keyboard nav, DnD
- `src/renderer/src/lib/SettingsPane.svelte` — settings panel (trash, custom commands, shortcuts, general)
- `src/renderer/src/lib/SmartBar.svelte` — unified search/navigate input (`/` to open)
- `src/renderer/src/lib/ContextMenu.svelte` — right-click context menu
- `src/renderer/src/lib/Titlebar.svelte` — drag region, window controls, logo
- `src/renderer/src/lib/KryptaLogo.svelte` — custom gravestone SVG icon
- `src/renderer/src/app.css` — global CSS variables + reset + custom scrollbar

## Security model

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. All Node/fs access goes through the preload's `contextBridge`. Never enable `nodeIntegration` in the renderer.

## Svelte 5

Uses the runes API throughout — `$state`, `$derived`, `$derived.by`, `$effect`, `$props`, `$bindable`. Do not mix with Svelte 4 patterns (`$:`, `export let`, stores).

**`$effect` closure gotcha:** Svelte only tracks reactive reads that happen synchronously in the effect body. Reads inside callbacks/event handlers inside an effect are NOT tracked. Always read reactive state at the top of the effect body if you need the effect to re-run when it changes.

## Color palette

```css
--bg:        #091925   /* deep teal */
--bg-raised: #0f2535
--bg-hover:  #142e42
--text:      #eee4ca   /* warm cream */
--text-dim:  #c8bfaa   /* lighter cream */
--pink:      #d4606e   /* folder icons, hover accents */
--emerald:   #50C878   /* selected/active state */
--border:    rgba(255,255,255,0.06)
```

Pink = interactive/hover. Emerald = selected/active. Never use both on the same element simultaneously.

## window.krypta API

```js
homeDir, sep, platform
readDir(path, { showHidden })  → { name, isDirectory, size, mtime, itemCount }[]
getRecursiveSize(path)         → number (bytes)
statPath(path)                 → { size, mtime }
isRoot(path), parentDir(path), joinPath(...parts)
move(src, dest), copy(src, dest), createFile(path), createDir(path), delete(path, recursive)
openFile(path), openTerminal(path), runCommand(cmd)
kryptaTrash(path) → key, kryptaRestore(key)
loadSettings() → settings,  saveSettings(settings)  // saveSettings is sync
loadSession()  → session|null, saveSession(data)      // saveSession is sync
window.{ close, minimize, maximize, getBounds, setBounds }
```

## Pane layout constants (App.svelte)

```js
const COMFORTABLE = 300   // per-pane comfortable width for auto-expand/shrink
const DEFAULT_WIDTH = 450 // minimum window width floor when collapsing/closing
const STRIP_WIDTH = 32    // collapsed pane strip width in px
// used in startPaneResize only:
const COLLAPSE_PX = 100   // drag threshold (px) below which a pane snaps collapsed
const EXPAND_PX = 110     // target px width after drag-expand snap
const STICKY_PX = 40      // dead zone before strip starts moving on drag-toward
const JUMP_PX = EXPAND_PX - STRIP_WIDTH  // one-shot bonus on first strip move
```

## Strip collapse / expand (App.svelte)

- `collapsePane(index)` — async; saves `collapsedFlex` + `collapsedWidth` on pane object; sets flex to STRIP_WIDTH ratio; shrinks window if `autoExpandPanes` enabled
- `expandPane(index)` — async; smart: if `b.width >= widthNeeded` redistributes flex proportionally within current bounds (corrects drag-skew too); otherwise grows window; sets 500ms grace period via `setGrace`
- `collapseAllExcept(index)` — collapses every pane except the given index; shrinks window
- `expandAll()` — expands all collapsed panes; grows or redistributes
- `gracePanes` — `$state(new Set<number>())`; pane indices currently in grace period
- `setGrace(index)` — adds index to `gracePanes`, removes after 500ms; passed as `grace` prop to Pane/SettingsPane; CSS: `.pane.grace .pane-actions, .pane.grace .pane-collapse-btn { pointer-events: none }`

## Pane reorder semantics

Sizes (flex values) are workspace layout — they stay fixed to their slot. Content (dirs/paths) is what reorders. `handlePaneDrop` and keyboard Shift+←/→ both swap pane content only, never flex values.

## What's built

- Multi-pane layout — Ctrl+T adds pane, Ctrl+W / `×` button closes, Tab cycles, Shift+←/→ reorders (content moves, sizes stay)
- Pane resize handles — incremental-delta drag between panes; floor at STRIP_WIDTH for collapsed panes
- Collapsed strip panes — `‹` (left of pathbar) collapses to 32px strip; `›` (top of strip) expands; drag-to-collapse/expand with sticky dead zone + snap feel; grip (GripVertical) in footer; grace period after expand; `collapseAllExcept`, `expandAll`
- Pane DnD reorder — grab handle in footer, full pane is drop target (pathbar shows visual); content (dirs) reorders, flex (sizes) stays fixed
- Pane close button — `+ | ×` duo in pathbar; 4-stage opacity: pane(0.15) → pathbar(0.35) → button-hover(1.0+color)
- Auto-expand on new pane — window expands by COMFORTABLE when cramped; `allEqual` heuristic preserves manual layouts; toggle in Settings → General
- Auto-shrink on close/collapse — window shrinks by the pane's actual pixel width (floored at DEFAULT_WIDTH)
- Session persistence — pane dirs, flex values, focused pane saved to `~/.config/krypta/session.json`; restored on launch; toggle in Settings → General
- File drag-and-drop — drag rows between panes or into subfolders; default=move, Ctrl=copy
  - Drop indicator line tracks cursor between rows
  - **Linux DnD cursor limitation:** stop-sign cursor persists on Linux regardless of drop target; this is a Chromium/X11 platform bug. Fix requires pointer-event DnD rewrite (planned with ghost images).
- Keyboard nav — Up/Down select, Left=go up, Right=enter/open, Enter=open, Backspace=go up
- Multi-select — Shift+arrows, Ctrl+click, Space toggles
- SmartBar (`/`) — filter + navigate; Tab autocompletes; goes live as you type
- Sort by column — click Name/Size/Modified headers, arrows indicate direction
- Column resize — drag handles between headers; auto-hide narrow columns (toggle in Settings)
- Date expand — click date cell toggles short↔full timestamp; column widens pane-wide
- Breadcrumb pathbar — clickable ancestor segments; hover-scroll edge zones on narrow panes
- Show hidden files — toggle in Settings → General; dot-files hidden by default
- Empty dir / permission error states — shown inline in file list with distinct messages
- Context menu — right-click; selection-aware; Open Terminal Here; custom commands
- Custom commands — configured in Settings (Ctrl+,); `{path}`, `{dir}`, `{name}` placeholders
- Undo/redo — Ctrl+Z/Y; covers rename, move, create, trash, copy; toast feedback
- Krypta soft-delete — items go to `~/.krypta-trash/`; flushed to OS trash on quit/startup
- Settings pane — Ctrl+, opens as real pane; same expand/shrink behavior as file panes; Trash / Custom Commands / Keyboard Shortcuts / General
- Keyboard move mode — `m` to enter, arrow keys to move items across panes
- Clipboard cut/copy/paste — Ctrl+X/C/V
- Spring-load folders — hover delay navigates into folder during drag; delay + toggle in Settings

## Known issues / planned work

- **DnD cursor on Linux / ghost images** — stop sign always shown; fix = pointer-event DnD rewrite (do both together)
- **Rebindable keys** — Keyboard Shortcuts section in Settings is read-only; needs binding store + conflict detection
- **Strip polish** — two pending rough edges: (1) `‹` in pathbar and `›` in strip top not visually centered identically; (2) two-to-one drag-collapse breakpoint causes cursor displacement; broader window resize math needs a pass
- **DnD cursor on Linux** — stop sign always shown; fix = pointer-event DnD rewrite (do with ghost images)
