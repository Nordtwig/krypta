<script>
  import { Folder, File } from 'lucide-svelte'
  import SmartBar from './SmartBar.svelte'

  let {
    currentDir = $bindable(window.krypta.homeDir),
    focused = false,
    onFocus,
    onAddPane
  } = $props()

  let files = $state([])
  let selectedIndex = $state(0)
  let showSmartBar = $state(false)
  let smartBarQuery = $state('')
  let dirSizes = $state({})
  let expandedDates = $state(new Set())
  let pendingSelectName = $state(null)
  let fileListEl = $state(null)
  let dateColumnWidth = $derived(expandedDates.size > 0 ? 180 : 110)

  let smartBarFilter = $derived(() => {
    if (!showSmartBar) return ''
    const i = smartBarQuery.lastIndexOf('/')
    return i >= 0 ? smartBarQuery.slice(i + 1) : smartBarQuery
  })

  let displayFiles = $derived.by(() => {
    const filter = smartBarFilter()
    return (showSmartBar && filter)
      ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
      : files
  })

  $effect(() => {
    if (!showSmartBar) return
    smartBarFilter()
    selectedIndex = 0
  })

  $effect(() => {
    const row = fileListEl?.children[selectedIndex]
    if (row) row.scrollIntoView({ block: 'nearest' })
  })

  let breadcrumbs = $derived(getBreadcrumbs(currentDir))

  function getBreadcrumbs(dir) {
    const parts = dir.split('/').filter(Boolean)
    return [
      { name: '/', path: '/' },
      ...parts.map((part, i) => ({
        name: part,
        path: '/' + parts.slice(0, i + 1).join('/')
      }))
    ]
  }

  $effect(() => {
    loadFiles(currentDir)
  })

  async function loadFiles(dir) {
    try {
      files = await window.krypta.readDir(dir)
      if (pendingSelectName) {
        const idx = files.findIndex(f => f.name === pendingSelectName)
        selectedIndex = idx >= 0 ? idx : 0
        pendingSelectName = null
      } else {
        selectedIndex = 0
      }
      dirSizes = {}
      expandedDates = new Set()
    } catch {
      files = []
    }
  }

  async function loadDirSize(entry) {
    const name = entry.name
    dirSizes = { ...dirSizes, [name]: 'loading' }
    const bytes = await window.krypta.getRecursiveSize(window.krypta.joinPath(currentDir, name))
    dirSizes = { ...dirSizes, [name]: bytes }
  }

  function getDirSize(entry) {
    const computed = dirSizes[entry.name]
    if (computed === 'loading') return '…'
    if (typeof computed === 'number') return formatSize(computed, false)
    if (entry.itemCount !== null) {
      return `${entry.itemCount} ${entry.itemCount === 1 ? 'item' : 'items'}`
    }
    return '—'
  }

  function navigate(entry) {
    if (entry.isDirectory) {
      currentDir = window.krypta.joinPath(currentDir, entry.name)
    } else {
      window.krypta.openFile(window.krypta.joinPath(currentDir, entry.name))
    }
  }

  function navigateUp() {
    if (!window.krypta.isRoot(currentDir)) {
      const parts = currentDir.split('/').filter(Boolean)
      pendingSelectName = parts[parts.length - 1] ?? null
      currentDir = window.krypta.parentDir(currentDir)
    }
  }

  $effect(() => {
    function handleKey(e) {
      if (!focused) return

      if (showSmartBar) {
        if (e.key === 'Escape') closeSmartBar()
        return
      }

      switch (e.key) {
        case '/':
          e.preventDefault()
          openSmartBar()
          break
        case 'ArrowDown':
          e.preventDefault()
          selectedIndex = Math.min(selectedIndex + 1, displayFiles.length - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          selectedIndex = Math.max(selectedIndex - 1, 0)
          break
        case 'ArrowRight':
          e.preventDefault()
          if (displayFiles[selectedIndex]) navigate(displayFiles[selectedIndex])
          break
        case 'ArrowLeft':
          e.preventDefault()
          navigateUp()
          break
        case 'Enter':
          if (displayFiles[selectedIndex]) navigate(displayFiles[selectedIndex])
          break
        case 'Backspace':
          e.preventDefault()
          navigateUp()
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  function openSmartBar() {
    smartBarQuery = currentDir.endsWith('/') ? currentDir : currentDir + '/'
    showSmartBar = true
  }

  function closeSmartBar() {
    showSmartBar = false
    smartBarQuery = ''
  }

  async function handleSmartBarInput(query) {
    smartBarQuery = query
    const lastSlash = query.lastIndexOf('/')
    const dirPart = query.slice(0, lastSlash + 1)
    const filterPart = query.slice(lastSlash + 1)

    // If the directory portion changed, navigate there and reload
    if (dirPart && dirPart !== currentDir && dirPart !== currentDir + '/') {
      try {
        const loaded = await window.krypta.readDir(dirPart)
        files = loaded
        currentDir = dirPart
        selectedIndex = 0
      } catch {
        // invalid path, just filter
      }
    }

  }

  function commitSmartBar() {
    if (!smartBarFilter()) {
      closeSmartBar()
      return
    }
    const target = displayFiles[Math.min(selectedIndex, displayFiles.length - 1)] ?? displayFiles[0]
    if (!target) return
    closeSmartBar()
    navigate(target)
  }

  function handleSmartBarArrow(dir) {
    selectedIndex = Math.max(0, Math.min(selectedIndex + dir, displayFiles.length - 1))
  }

  function formatSize(bytes, isDir) {
    if (isDir || bytes == null) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
    return (bytes / 1024 ** 3).toFixed(2) + ' GB'
  }

  function formatDate(mtime, expanded = false) {
    if (!mtime) return '—'
    const d = new Date(mtime)
    if (expanded) {
      return d.toLocaleString(undefined, {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      })
    }
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  function toggleDate(name) {
    const next = new Set(expandedDates)
    next.has(name) ? next.delete(name) : next.add(name)
    expandedDates = next
  }
</script>

<div class="pane" class:focused onmouseenter={onFocus} style="--date-col-width: {dateColumnWidth}px">
  <div class="pathbar">
    {#if showSmartBar}
      <SmartBar
        bind:query={smartBarQuery}
        onInput={handleSmartBarInput}
        onSubmit={commitSmartBar}
        onClose={closeSmartBar}
        onArrow={handleSmartBarArrow}
      />
    {:else}
      <div class="breadcrumbs">
        {#each breadcrumbs as crumb, i}
          {#if i > 0}<span class="sep">›</span>{/if}
          <button class="crumb" onclick={() => currentDir = crumb.path}>{crumb.name}</button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="file-header">
    <span class="col-icon"></span>
    <span class="col-name">Name</span>
    <span class="col-size">Size</span>
    <span class="col-date">Modified</span>
  </div>

  <div class="file-list" bind:this={fileListEl}>
    {#each displayFiles as entry, i}
      <div
        class="file-row"
        class:selected={i === selectedIndex}
        onclick={() => selectedIndex = i}
        ondblclick={() => navigate(entry)}
      >
        <span class="col-icon">
          {#if entry.isDirectory}
            <Folder size={14} color="var(--pink)" strokeWidth={1.5} />
          {:else}
            <File size={14} color="var(--text-dim)" strokeWidth={1.5} />
          {/if}
        </span>
        <span class="col-name">{entry.name}</span>
        {#if entry.isDirectory}
          <span
            class="col-size dir-size"
            title="Click to calculate total size"
            onclick={(e) => { e.stopPropagation(); loadDirSize(entry) }}
          >{getDirSize(entry)}</span>
        {:else}
          <span class="col-size">{formatSize(entry.size, false)}</span>
        {/if}
        <span
          class="col-date"
          class:expanded={expandedDates.has(entry.name)}
          onclick={(e) => { e.stopPropagation(); toggleDate(entry.name) }}
        >{formatDate(entry.mtime, expandedDates.has(entry.name))}</span>
      </div>
    {/each}
  </div>

  <button class="add-pane-btn" onclick={onAddPane} title="Open new pane">+</button>
</div>

<style>
  .pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    position: relative;
    border-right: 1px solid var(--border);
  }

  .pane:last-child {
    border-right: none;
  }

  .pathbar {
    height: 32px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 2px;
    overflow: hidden;
  }

  .crumb {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 11px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    white-space: nowrap;
    transition: color 0.1s;
  }

  .crumb:hover { color: var(--text); }
  .crumb:last-child { color: var(--text); }

  .sep {
    color: var(--text-dim);
    font-size: 10px;
    opacity: 0.4;
  }

  .file-header {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .file-header span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
    opacity: 0.6;
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .file-row {
    display: flex;
    align-items: center;
    padding: 0 12px;
    height: 28px;
    cursor: pointer;
    border-left: 2px solid transparent;
    transition: background 0.1s;
  }

  .file-row:hover { background: rgba(212, 96, 110, 0.07); }

  .file-row.selected {
    background: rgba(80, 200, 120, 0.06);
    border-left-color: var(--emerald);
  }

  .col-icon {
    width: 22px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .col-name {
    flex: 1;
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 16px;
  }

  .col-size {
    width: 90px;
    font-size: 11px;
    color: var(--text-dim);
    text-align: right;
    flex-shrink: 0;
    padding-right: 16px;
  }

  .dir-size {
    cursor: pointer;
  }

  .dir-size:hover {
    color: var(--text);
  }

  .col-date {
    width: var(--date-col-width, 110px);
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
    cursor: pointer;
    white-space: nowrap;
    transition: color 0.1s, width 0.15s ease;
  }

  .col-date:hover { color: var(--text); }

  .add-pane-btn {
    position: absolute;
    bottom: 12px;
    right: 12px;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: var(--bg-raised);
    color: var(--text-dim);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, background 0.15s;
  }

  .pane:hover .add-pane-btn { opacity: 1; }
  .add-pane-btn:hover { background: var(--bg-hover); color: var(--text); }
</style>
