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

## Architecture

- `src/main/index.js` — Electron main process, BrowserWindow config, IPC handlers
- `src/preload/index.js` — Node.js → renderer bridge via `contextBridge` (exposed as `window.krypta`)
- `src/renderer/src/App.svelte` — pane array state, Ctrl+T handler
- `src/renderer/src/lib/Pane.svelte` — all file browsing logic, smart bar, keyboard nav
- `src/renderer/src/lib/SmartBar.svelte` — unified search/navigate input
- `src/renderer/src/lib/Titlebar.svelte` — drag region, window controls, logo
- `src/renderer/src/lib/KryptaLogo.svelte` — custom mausoleum SVG icon
- `src/renderer/src/app.css` — global CSS variables

## Security model

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`. All Node/fs access goes through the preload's `contextBridge`. Never enable `nodeIntegration` in the renderer.

## Svelte 5

Uses the runes API throughout — `$state`, `$derived`, `$derived.by`, `$effect`, `$props`, `$bindable`. Do not mix with Svelte 4 patterns (`$:`, `export let`, stores).

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
readDir(path)           → { name, isDirectory, size, mtime, itemCount }[]
getRecursiveSize(path)  → number (bytes)
isRoot(path), parentDir(path), joinPath(...parts)
move(src, dest), createFile(path), createDir(path), delete(path, recursive)
openFile(path)
window.{ close, minimize, maximize }
```

`readDir` returns folders first, alphabetical, hidden files excluded. `mtime` is a Unix timestamp (ms).

## Known issues / planned work

- Column alignment breaks when date is expanded (each row is independent flex — needs CSS Grid refactor, do alongside column resizing)
- SmartBar Enter snaps to first unfiltered item instead of last highlighted filtered item
- Arrow key navigation: Left = go up, Right = enter folder/open file (not yet implemented)
- Custom window controls (replace macOS traffic lights)
- Custom scrollbar (`::-webkit-scrollbar`)
- UI polish pass — hover colors, selection states
- Column resizing via drag handles
- Drag and drop between panes
- File operations (create, rename, delete)
- Sort by column (click headers)
- Migrate this repo into `git@github.com:Nordtwig/krypta.git`
