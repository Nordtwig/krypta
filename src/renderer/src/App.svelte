<script>
  import { onMount } from 'svelte'
  import Titlebar from './lib/Titlebar.svelte'
  import Pane from './lib/Pane.svelte'
  import SettingsPane from './lib/SettingsPane.svelte'

  let focusedPane = $state(0)
  let panes = $state([{ dir: window.krypta.homeDir, refreshKey: 0, flashKey: 0 }])
  let settings = $state({ useKryptaTrash: true, customCommands: [] })
  let mouseHasMoved = true

  onMount(async () => {
    settings = await window.krypta.loadSettings()
  })

  function handleSettingsChange(newSettings) {
    settings = newSettings
    window.krypta.saveSettings(newSettings)
  }

  function openSettings() {
    const existing = panes.findIndex(p => p.type === 'settings')
    if (existing >= 0) { focusedPane = existing; return }
    const newPane = { type: 'settings' }
    panes = [...panes.slice(0, focusedPane + 1), newPane, ...panes.slice(focusedPane + 1)]
    focusedPane = focusedPane + 1
  }
  let clipboard = $state(null)   // { dir, names: Set<string>, type: 'cut'|'copy' }
  let moveMode = $state(null)    // { dir, names: Set<string> }
  let history = $state([])       // [{ type, ...params }]
  let redoStack = $state([])
  let toast = $state(null)
  let toastTimer = null

  function entryLabel(entry) {
    const count = (arr) => arr.length === 1 ? `"${arr[0]}"` : `${arr.length} items`
    switch (entry.type) {
      case 'rename': return `renamed "${entry.oldName}" → "${entry.newName}"`
      case 'move':   return `moved ${count(entry.names)}`
      case 'create': return `created ${entry.isDirectory ? 'folder' : 'file'} "${entry.name}"`
      case 'trash':  return `deleted ${count(entry.names)}`
      case 'copy':   return `copied ${count(entry.names)}`
    }
  }

  function showToast(message) {
    clearTimeout(toastTimer)
    toast = { message, id: Date.now() }
    toastTimer = setTimeout(() => { toast = null }, 2500)
  }

  function addPane(afterIndex) {
    const srcPane = panes[afterIndex]
    const srcDir = srcPane?.type === 'settings' ? window.krypta.homeDir : (srcPane?.dir ?? window.krypta.homeDir)
    const newPane = { dir: srcDir, refreshKey: 0, flashKey: 0 }
    panes = [...panes.slice(0, afterIndex + 1), newPane, ...panes.slice(afterIndex + 1)]
    focusedPane = afterIndex + 1
  }

  function removePane(index) {
    if (panes.length <= 1) {
      window.krypta.window.close()
      return
    }
    panes = panes.filter((_, i) => i !== index)
    focusedPane = Math.min(focusedPane, panes.length - 1)
  }

  function handleCut(dir, names) { clipboard = { dir, names, type: 'cut' } }
  function handleCopy(dir, names) { clipboard = { dir, names, type: 'copy' } }

  function handleToggleMoveMode(dir, names) {
    moveMode = moveMode ? null : { dir, names }
  }

  async function handleMoveDirection(direction) {
    if (!moveMode) return
    const targetIndex = direction === 'right' ? focusedPane + 1 : focusedPane - 1
    const targetPane = panes[targetIndex]
    if (!targetPane || targetPane.type === 'settings') return
    const { dir: sourceDir, names } = moveMode
    try {
      await Promise.all([...names].map(name =>
        window.krypta.move(
          window.krypta.joinPath(sourceDir, name),
          window.krypta.joinPath(targetPane.dir, name)
        )
      ))
      const movedNames = [...names]
      pushHistory({ type: 'move', srcDir: sourceDir, destDir: targetPane.dir, names: movedNames })
      updateMovedPaths(sourceDir, targetPane.dir, movedNames)
      moveMode = { dir: targetPane.dir, names }
      panes[focusedPane].refreshKey++
      panes[targetIndex].refreshKey++
      focusedPane = targetIndex
    } catch {
      moveMode = null
    }
  }

  function handleChanged(dir) {
    panes.forEach((_, i) => {
      if (!panes[i].type && panes[i].dir === dir) panes[i].refreshKey++
    })
  }

  function handleMoved(sourceDir, destDir, names) {
    if (clipboard?.type === 'cut' && clipboard?.dir === sourceDir) clipboard = null
    updateMovedPaths(sourceDir, destDir, names)
    panes.forEach((_, i) => {
      if (!panes[i].type && (panes[i].dir === sourceDir || panes[i].dir === destDir)) panes[i].refreshKey++
    })
  }

  // Rewrites currentDir for any pane sitting inside a moved item
  function updateMovedPaths(srcDir, destDir, names) {
    panes.forEach((_, i) => {
      if (panes[i].type) return
      for (const name of names) {
        const oldBase = window.krypta.joinPath(srcDir, name)
        if (panes[i].dir === oldBase || panes[i].dir.startsWith(oldBase + '/')) {
          const newBase = window.krypta.joinPath(destDir, name)
          panes[i].dir = newBase + panes[i].dir.slice(oldBase.length)
          panes[i].refreshKey++
          panes[i].flashKey++
          break
        }
      }
    })
  }

  function pushHistory(entry) {
    history = [...history, entry]
    redoStack = []
  }

  function refreshDirs(...dirs) {
    const unique = new Set(dirs.filter(Boolean))
    panes.forEach((_, i) => {
      if (!panes[i].type && unique.has(panes[i].dir)) panes[i].refreshKey++
    })
  }

  async function undo() {
    if (history.length === 0) { showToast('Nothing to undo'); return }
    const entry = history[history.length - 1]
    history = history.slice(0, -1)
    try {
      await applyUndo(entry)
      redoStack = [...redoStack, entry]
      showToast(`Undid ${entryLabel(entry)}`)
    } catch {
      showToast('Undo failed — file may have moved')
    }
  }

  async function redo() {
    if (redoStack.length === 0) { showToast('Nothing to redo'); return }
    const entry = redoStack[redoStack.length - 1]
    redoStack = redoStack.slice(0, -1)
    try {
      await applyRedo(entry)
      history = [...history, entry]
      showToast(`Redid ${entryLabel(entry)}`)
    } catch {
      showToast('Redo failed — file may have moved')
    }
  }

  async function applyUndo(entry) {
    switch (entry.type) {
      case 'rename':
        await window.krypta.move(
          window.krypta.joinPath(entry.dir, entry.newName),
          window.krypta.joinPath(entry.dir, entry.oldName)
        )
        refreshDirs(entry.dir)
        break
      case 'move':
        await Promise.all(entry.names.map(name =>
          window.krypta.move(
            window.krypta.joinPath(entry.destDir, name),
            window.krypta.joinPath(entry.srcDir, name)
          )
        ))
        updateMovedPaths(entry.destDir, entry.srcDir, entry.names)
        refreshDirs(entry.srcDir, entry.destDir)
        break
      case 'create':
        await window.krypta.delete(
          window.krypta.joinPath(entry.dir, entry.name),
          entry.isDirectory
        )
        refreshDirs(entry.dir)
        break
      case 'trash':
        await Promise.all(entry.keys.map(key => window.krypta.kryptaRestore(key)))
        refreshDirs(entry.dir)
        break
      case 'copy':
        await Promise.all(entry.names.map(name =>
          window.krypta.delete(
            window.krypta.joinPath(entry.destDir, name),
            true
          )
        ))
        refreshDirs(entry.destDir)
        break
    }
  }

  async function applyRedo(entry) {
    switch (entry.type) {
      case 'rename':
        await window.krypta.move(
          window.krypta.joinPath(entry.dir, entry.oldName),
          window.krypta.joinPath(entry.dir, entry.newName)
        )
        refreshDirs(entry.dir)
        break
      case 'move':
        await Promise.all(entry.names.map(name =>
          window.krypta.move(
            window.krypta.joinPath(entry.srcDir, name),
            window.krypta.joinPath(entry.destDir, name)
          )
        ))
        updateMovedPaths(entry.srcDir, entry.destDir, entry.names)
        refreshDirs(entry.srcDir, entry.destDir)
        break
      case 'create':
        if (entry.isDirectory) {
          await window.krypta.createDir(window.krypta.joinPath(entry.dir, entry.name))
        } else {
          await window.krypta.createFile(window.krypta.joinPath(entry.dir, entry.name))
        }
        refreshDirs(entry.dir)
        break
      case 'trash':
        // Can't redo a trash — the items were restored, now trash them again
        entry.keys = await Promise.all(
          entry.names.map(name =>
            window.krypta.kryptaTrash(window.krypta.joinPath(entry.dir, name))
          )
        )
        refreshDirs(entry.dir)
        break
      case 'copy':
        await Promise.all(entry.names.map(name =>
          window.krypta.copy(
            window.krypta.joinPath(entry.srcDir, name),
            window.krypta.joinPath(entry.destDir, name)
          )
        ))
        refreshDirs(entry.destDir)
        break
    }
  }

  $effect(() => {
    function onMouseMove() { mouseHasMoved = true }
    document.addEventListener('mousemove', onMouseMove)
    return () => document.removeEventListener('mousemove', onMouseMove)
  })

  $effect(() => {
    function handleKey(e) {
      mouseHasMoved = false
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        addPane(focusedPane)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        removePane(focusedPane)
      } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        openSettings()
      } else if (e.shiftKey && e.key === 'ArrowLeft' && focusedPane > 0) {
        e.preventDefault()
        ;[panes[focusedPane - 1], panes[focusedPane]] = [panes[focusedPane], panes[focusedPane - 1]]
        focusedPane--
      } else if (e.shiftKey && e.key === 'ArrowRight' && focusedPane < panes.length - 1) {
        e.preventDefault()
        ;[panes[focusedPane], panes[focusedPane + 1]] = [panes[focusedPane + 1], panes[focusedPane]]
        focusedPane++
      } else if (e.key === 'Tab') {
        e.preventDefault()
        focusedPane = e.shiftKey
          ? (focusedPane - 1 + panes.length) % panes.length
          : (focusedPane + 1) % panes.length
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div class="app">
  <Titlebar />
  <main>

    {#each panes as pane, i (i)}
      {#if pane.type === 'settings'}
        <SettingsPane
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved) focusedPane = i }}
          onAddPane={() => addPane(i)}
          {settings}
          onSettingsChange={handleSettingsChange}
        />
      {:else}
        <Pane
          bind:currentDir={panes[i].dir}
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved) focusedPane = i }}
          onAddPane={() => addPane(i)}
          refreshKey={panes[i].refreshKey}
          flashKey={panes[i].flashKey}
          {clipboard}
          onCut={handleCut}
          onCopy={handleCopy}
          onMoved={handleMoved}
          onChanged={handleChanged}
          {moveMode}
          onToggleMoveMode={handleToggleMoveMode}
          onMoveDirection={handleMoveDirection}
          onHistory={pushHistory}
          {settings}
        />
      {/if}
    {/each}
  </main>

  {#if toast}
    {#key toast.id}
      <div class="toast">{toast.message}</div>
    {/key}
  {/if}
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  main {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .toast {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 11px;
    padding: 5px 12px;
    border-radius: 4px;
    pointer-events: none;
    white-space: nowrap;
    animation: toast-in 0.12s ease, toast-out 0.2s ease 2.1s forwards;
  }

  @keyframes toast-in {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  @keyframes toast-out {
    from { opacity: 1; }
    to   { opacity: 0; }
  }
</style>
