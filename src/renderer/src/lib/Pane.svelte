<script>
  import { Folder, File } from 'lucide-svelte'
  import SmartBar from './SmartBar.svelte'
  import ContextMenu from './ContextMenu.svelte'

  let {
    currentDir = $bindable(window.krypta.homeDir),
    focused = false,
    onFocus,
    onAddPane,
    refreshKey = 0,
    flashKey = 0,
    clipboard = null,
    moveMode = null,
    onCut,
    onCopy,
    onMoved,
    onChanged,
    onToggleMoveMode,
    onMoveDirection,
    onHistory,
    settings = null
  } = $props()

  let files = $state([])
  let selectedIndex = $state(0)
  let sortCol = $state('name')
  let sortDir = $state('asc')
  let creatingType = $state(null)
  let creatingName = $state('')
  let creatingInputEl = $state(null)
  let renamingName = $state(null)
  let renamingValue = $state('')
  let renamingInputEl = $state(null)
  let selectedNames = $state(new Set())
  let anchorIndex = $state(0)
  let pendingDeleteNames = $state(new Set())
  let contextMenu = $state(null)
  let pathbarFlashing = $state(false)
  let flashTimer = null

  $effect(() => {
    if (flashKey === 0) return
    clearTimeout(flashTimer)
    pathbarFlashing = true
    flashTimer = setTimeout(() => { pathbarFlashing = false }, 800)
  })
  let showSmartBar = $state(false)
  let smartBarQuery = $state('')
  let smartBarOriginalDir = $state(null)
  let dirSizes = $state({})
  let expandedDates = $state(new Set())
  let pendingSelectName = $state(null)
  let fileListEl = $state(null)
  let sizeColWidth = $state(90)
  let dateColBaseWidth = $state(110)
  let dateColWidth = $derived.by(() => {
    if (expandedDates.size === 0) return dateColBaseWidth
    const maxChars = files.reduce((max, f) => Math.max(max, formatDate(f.mtime, true).length), 0)
    return Math.max(dateColBaseWidth, maxChars * 7 + 16)
  })
  let resizing = $state(false)
  let gridCols = $derived(`22px 1fr ${sizeColWidth}px ${dateColWidth}px`)

  let smartBarFilter = $derived(() => {
    if (!showSmartBar) return ''
    const i = smartBarQuery.lastIndexOf('/')
    return i >= 0 ? smartBarQuery.slice(i + 1) : smartBarQuery
  })

  let displayFiles = $derived.by(() => {
    const filter = smartBarFilter()
    const base = (showSmartBar && filter)
      ? files.filter(f => f.name.toLowerCase().includes(filter.toLowerCase()))
      : files
    return [...base].sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      let cmp = 0
      if (sortCol === 'name') {
        cmp = a.name.localeCompare(b.name)
      } else if (sortCol === 'size') {
        const sa = a.isDirectory ? (a.itemCount ?? 0) : (a.size ?? 0)
        const sb = b.isDirectory ? (b.itemCount ?? 0) : (b.size ?? 0)
        cmp = sa - sb
      } else if (sortCol === 'date') {
        cmp = (a.mtime ?? 0) - (b.mtime ?? 0)
      }
      return sortDir === 'asc' ? cmp : -cmp
    })
  })

  let ghostSuggestion = $derived.by(() => {
    if (!showSmartBar) return ''
    const filter = smartBarFilter()
    if (!filter) return ''
    const selected = displayFiles[selectedIndex]
    if (!selected || !selected.name.toLowerCase().startsWith(filter.toLowerCase())) return ''
    return selected.name.slice(filter.length) + (selected.isDirectory ? '/' : '')
  })

  $effect(() => {
    if (!showSmartBar) return
    smartBarFilter()
    selectedIndex = 0
  })

  $effect(() => {
    if (selectedIndex < 0) return
    const offset = creatingType !== null ? 1 : 0
    const row = fileListEl?.children[selectedIndex + offset]
    if (row) row.scrollIntoView({ block: 'nearest' })
  })

  $effect(() => {
    if (creatingType !== null && creatingInputEl) creatingInputEl.focus()
  })

  $effect(() => {
    if (renamingName !== null && renamingInputEl) {
      renamingInputEl.focus()
      renamingInputEl.select()
    }
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
    refreshKey
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
      selectedNames = new Set()
      pendingDeleteNames = new Set()
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
      if (creatingType !== null || renamingName !== null) return

      if (showSmartBar) {
        if (e.key === 'Escape') cancelSmartBar()
        return
      }

      switch (e.key) {
        case '/':
          e.preventDefault()
          openSmartBar()
          break
        case 'ArrowDown':
          e.preventDefault()
          pendingDeleteNames = new Set()
          if (e.shiftKey) {
            selectedIndex = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, displayFiles.length - 1)
            selectRange(anchorIndex, selectedIndex)
          } else {
            selectedNames = new Set()
            selectedIndex = selectedIndex < 0 ? 0 : Math.min(selectedIndex + 1, displayFiles.length - 1)
            anchorIndex = selectedIndex
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          pendingDeleteNames = new Set()
          if (e.shiftKey) {
            selectedIndex = selectedIndex < 0 ? displayFiles.length - 1 : Math.max(selectedIndex - 1, 0)
            selectRange(anchorIndex, selectedIndex)
          } else {
            selectedNames = new Set()
            selectedIndex = selectedIndex < 0 ? displayFiles.length - 1 : Math.max(selectedIndex - 1, 0)
            anchorIndex = selectedIndex
          }
          break
        case 'ArrowRight':
          if (e.shiftKey) break
          e.preventDefault()
          if (moveMode) {
            onMoveDirection?.('right')
          } else {
            pendingDeleteNames = new Set()
            selectedNames = new Set()
            if (displayFiles[selectedIndex]) navigate(displayFiles[selectedIndex])
          }
          break
        case 'ArrowLeft':
          if (e.shiftKey) break
          e.preventDefault()
          if (moveMode) {
            onMoveDirection?.('left')
          } else {
            pendingDeleteNames = new Set()
            selectedNames = new Set()
            navigateUp()
          }
          break
        case 'm': {
          e.preventDefault()
          const names = selectedNames.size > 0
            ? new Set(selectedNames)
            : displayFiles[selectedIndex] ? new Set([displayFiles[selectedIndex].name]) : new Set()
          onToggleMoveMode?.(currentDir, names)
          break
        }
        case 'Enter':
          if (moveMode) {
            onToggleMoveMode?.()
          } else {
            pendingDeleteNames = new Set()
            selectedNames = new Set()
            if (displayFiles[selectedIndex]) navigate(displayFiles[selectedIndex])
          }
          break
        case 'Backspace':
          e.preventDefault()
          pendingDeleteNames = new Set()
          selectedNames = new Set()
          navigateUp()
          break
        case 'x':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const cutNames = selectedNames.size > 0
              ? new Set(selectedNames)
              : displayFiles[selectedIndex] ? new Set([displayFiles[selectedIndex].name]) : new Set()
            if (cutNames.size > 0) onCut?.(currentDir, cutNames)
          }
          break
        case 'c':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            const copyNames = selectedNames.size > 0
              ? new Set(selectedNames)
              : displayFiles[selectedIndex] ? new Set([displayFiles[selectedIndex].name]) : new Set()
            if (copyNames.size > 0) onCopy?.(currentDir, copyNames)
          }
          break
        case 'v':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (clipboard && clipboard.dir !== currentDir) commitPaste()
          }
          break
        case ' ':
          e.preventDefault()
          {
            const name = displayFiles[selectedIndex]?.name
            if (name) {
              const next = new Set(selectedNames)
              next.has(name) ? next.delete(name) : next.add(name)
              selectedNames = next
              anchorIndex = selectedIndex
            }
          }
          break
        case 'n':
          e.preventDefault()
          startCreate('file')
          break
        case 'N':
          e.preventDefault()
          startCreate('folder')
          break
        case 'r':
        case 'F2':
          e.preventDefault()
          if (displayFiles[selectedIndex]) startRename(displayFiles[selectedIndex].name)
          break
        case 'Delete': {
          e.preventDefault()
          const targets = selectedNames.size > 0
            ? new Set(selectedNames)
            : displayFiles[selectedIndex] ? new Set([displayFiles[selectedIndex].name]) : new Set()
          if (targets.size === 0) break
          const alreadyStaged = targets.size === pendingDeleteNames.size &&
            [...targets].every(n => pendingDeleteNames.has(n))
          if (alreadyStaged) {
            commitDelete()
          } else {
            pendingDeleteNames = targets
          }
          break
        }
        case 'Escape':
          pendingDeleteNames = new Set()
          selectedNames = new Set()
          selectedIndex = -1
          if (moveMode) onToggleMoveMode?.()
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  function openSmartBar() {
    smartBarOriginalDir = currentDir
    smartBarQuery = currentDir.endsWith('/') ? currentDir : currentDir + '/'
    showSmartBar = true
  }

  function closeSmartBar() {
    showSmartBar = false
    smartBarQuery = ''
    smartBarOriginalDir = null
  }

  function cancelSmartBar() {
    if (smartBarOriginalDir !== null && smartBarOriginalDir !== currentDir) {
      currentDir = smartBarOriginalDir
    }
    showSmartBar = false
    smartBarQuery = ''
    smartBarOriginalDir = null
  }

  async function handleSmartBarInput(query) {
    smartBarQuery = query
    const lastSlash = query.lastIndexOf('/')
    const dirPart = query.slice(0, lastSlash + 1)

    if (dirPart) {
      const normalizedDir = dirPart === '/' ? '/' : dirPart.replace(/\/$/, '')
      if (normalizedDir !== currentDir) {
        try {
          const loaded = await window.krypta.readDir(dirPart)
          files = loaded
          currentDir = normalizedDir
          selectedIndex = 0
        } catch {}
      }
    }
  }

  function handleSmartBarTab() {
    const filter = smartBarFilter()
    if (!filter) return
    const lastSlash = smartBarQuery.lastIndexOf('/')
    const dirPart = smartBarQuery.slice(0, lastSlash + 1)

    const prefixMatches = files.filter(f => f.name.toLowerCase().startsWith(filter.toLowerCase()))
    if (prefixMatches.length === 0) return

    if (prefixMatches.length === 1) {
      // Only one candidate left → enter it directly
      const m = prefixMatches[0]
      smartBarQuery = dirPart + m.name + (m.isDirectory ? '/' : '')
      handleSmartBarInput(smartBarQuery)
      return
    }

    const selected = displayFiles[selectedIndex]
    const selectedMatches = selected && selected.name.toLowerCase().startsWith(filter.toLowerCase())

    if (selectedMatches) {
      if (selected.name.toLowerCase() === filter.toLowerCase()) {
        // Filter exactly equals selected item's full name → enter it
        smartBarQuery = dirPart + selected.name + (selected.isDirectory ? '/' : '')
      } else {
        // Fill to selected item's full name; also enter if it's now the only prefix match
        const uniqueAfterFill = files.filter(f =>
          f.name.toLowerCase().startsWith(selected.name.toLowerCase())
        ).length === 1
        smartBarQuery = dirPart + selected.name + (uniqueAfterFill && selected.isDirectory ? '/' : '')
      }
      handleSmartBarInput(smartBarQuery)
      return
    }

    // Selected item isn't a prefix match → common prefix fallback
    let prefix = prefixMatches[0].name
    for (const m of prefixMatches.slice(1)) {
      let i = 0
      while (i < prefix.length && i < m.name.length &&
             prefix[i].toLowerCase() === m.name[i].toLowerCase()) i++
      prefix = prefix.slice(0, i)
    }
    smartBarQuery = dirPart + prefix
    handleSmartBarInput(smartBarQuery)
  }

  async function trashNames(names) {
    const keys = await Promise.all(
      names.map(n => window.krypta.kryptaTrash(window.krypta.joinPath(currentDir, n)))
    )
    onHistory?.({ type: 'trash', dir: currentDir, names, keys })
    onChanged?.(currentDir)
  }

  function openContextMenu(e, entry) {
    e.preventDefault()
    e.stopPropagation()
    contextMenu = { x: e.clientX, y: e.clientY, items: buildContextItems(entry) }
  }

  function buildContextItems(entry) {
    // If right-clicked item is part of selection, act on whole selection; otherwise just this item
    const targets = (entry && selectedNames.size > 0 && selectedNames.has(entry.name))
      ? [...selectedNames]
      : (entry ? [entry.name] : [])
    const n = targets.length
    const countLabel = n === 1 ? `"${targets[0]}"` : `${n} items`
    const sep = { separator: true }
    const items = []

    if (entry && targets.length === 1) {
      items.push({ label: 'Open', shortcut: 'Enter', action: () => navigate(entry) })
      items.push({ label: 'Rename', shortcut: 'r', action: () => { renamingName = entry.name; renamingValue = entry.name } })
      items.push(sep)
    }

    if (targets.length > 0) {
      items.push({
        label: n > 1 ? `Cut ${countLabel}` : 'Cut',
        shortcut: 'Ctrl+X',
        action: () => onCut?.(currentDir, new Set(targets))
      })
      items.push({
        label: n > 1 ? `Copy ${countLabel}` : 'Copy',
        shortcut: 'Ctrl+C',
        action: () => onCopy?.(currentDir, new Set(targets))
      })
    }

    items.push({
      label: 'Paste',
      shortcut: 'Ctrl+V',
      action: () => commitPaste(),
      disabled: !clipboard
    })

    if (targets.length > 0) {
      items.push(sep)
      items.push({
        label: n > 1 ? `Move ${countLabel} to Trash` : 'Move to Trash',
        shortcut: 'Del',
        action: () => trashNames(targets)
      })
    }

    items.push(sep)
    items.push({ label: 'New File',   shortcut: 'n', action: () => { creatingType = 'file' } })
    items.push({ label: 'New Folder', shortcut: 'N', action: () => { creatingType = 'folder' } })
    items.push(sep)
    items.push({ label: 'Open Terminal Here', action: () => window.krypta.openTerminal(currentDir) })

    const cmds = settings?.customCommands ?? []
    if (cmds.length > 0) {
      items.push(sep)
      for (const cmd of cmds) {
        const isSingle = targets.length === 1
        const targetPath = isSingle ? window.krypta.joinPath(currentDir, targets[0]) : null
        const resolved = cmd.command
          .replace(/\{path\}/g, targetPath ?? currentDir)
          .replace(/\{dir\}/g, isSingle
            ? (entry?.isDirectory ? targetPath : currentDir)
            : currentDir)
          .replace(/\{name\}/g, isSingle ? targets[0] : '')
        items.push({
          label: cmd.label || 'Unnamed',
          disabled: !cmd.command || (targets.length > 1),
          action: () => window.krypta.runCommand(resolved)
        })
      }
    }

    return items
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

  function startCreate(type) {
    creatingType = type
    creatingName = ''
  }

  function startRename(name) {
    renamingName = name
    renamingValue = name
  }

  async function commitCreate() {
    const name = creatingName.trim()
    const type = creatingType
    creatingType = null
    creatingName = ''
    if (!name) return
    try {
      const path = window.krypta.joinPath(currentDir, name)
      if (type === 'folder') {
        await window.krypta.createDir(path)
      } else {
        await window.krypta.createFile(path)
      }
      pendingSelectName = name
      onHistory?.({ type: 'create', dir: currentDir, name, isDirectory: type === 'folder' })
      onChanged?.(currentDir)
    } catch {}
  }

  async function commitRename() {
    const newName = renamingValue.trim()
    const oldName = renamingName
    renamingName = null
    renamingValue = ''
    if (!newName || newName === oldName) return
    try {
      await window.krypta.move(
        window.krypta.joinPath(currentDir, oldName),
        window.krypta.joinPath(currentDir, newName)
      )
      pendingSelectName = newName
      onHistory?.({ type: 'rename', dir: currentDir, oldName, newName })
      onChanged?.(currentDir)
    } catch {}
  }

  function selectRange(from, to) {
    const start = Math.min(from, to)
    const end = Math.max(from, to)
    const names = new Set()
    for (let i = start; i <= end; i++) {
      if (displayFiles[i]) names.add(displayFiles[i].name)
    }
    selectedNames = names
  }

  async function commitDelete() {
    const names = [...pendingDeleteNames]
    const indices = names
      .map(n => displayFiles.findIndex(f => f.name === n))
      .filter(i => i >= 0)
      .sort((a, b) => a - b)
    const after = displayFiles[indices[indices.length - 1] + 1]
    const before = displayFiles[indices[0] - 1]
    const adjacent = (after && !pendingDeleteNames.has(after.name) ? after : null) ?? before
    if (adjacent) pendingSelectName = adjacent.name
    pendingDeleteNames = new Set()
    selectedNames = new Set()
    try {
      const keys = await Promise.all(
        names.map(n => window.krypta.kryptaTrash(window.krypta.joinPath(currentDir, n)))
      )
      onHistory?.({ type: 'trash', dir: currentDir, names, keys })
      onChanged?.(currentDir)
    } catch {}
  }

  function handleCreateKeydown(e) {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); commitCreate() }
    else if (e.key === 'Escape') { e.preventDefault(); creatingType = null; creatingName = '' }
  }

  function handleRenameKeydown(e) {
    e.stopPropagation()
    if (e.key === 'Enter') { e.preventDefault(); commitRename() }
    else if (e.key === 'Escape') { e.preventDefault(); renamingName = null; renamingValue = '' }
  }

  async function commitPaste() {
    if (!clipboard) return
    const { dir: sourceDir, names, type } = clipboard
    try {
      if (type === 'cut') {
        await Promise.all([...names].map(name =>
          window.krypta.move(
            window.krypta.joinPath(sourceDir, name),
            window.krypta.joinPath(currentDir, name)
          )
        ))
        const movedNames = [...names]
        onHistory?.({ type: 'move', srcDir: sourceDir, destDir: currentDir, names: movedNames })
        onMoved?.(sourceDir, currentDir, movedNames)
      } else {
        await Promise.all([...names].map(name =>
          window.krypta.copy(
            window.krypta.joinPath(sourceDir, name),
            window.krypta.joinPath(currentDir, name)
          )
        ))
        onHistory?.({ type: 'copy', srcDir: sourceDir, destDir: currentDir, names: [...names] })
        onChanged?.(currentDir)
      }
    } catch {}
  }


  function setSort(col) {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortCol = col
      sortDir = 'asc'
    }
  }

  function startResize(e, col) {
    e.preventDefault()
    resizing = true
    const startX = e.clientX
    const startWidth = col === 'size' ? sizeColWidth : dateColBaseWidth

    function onMove(e) {
      const newWidth = Math.max(60, startWidth - (e.clientX - startX))
      if (col === 'size') sizeColWidth = newWidth
      else dateColBaseWidth = newWidth
    }

    function onUp() {
      resizing = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }
</script>

<div class="pane" class:focused class:resizing onmouseenter={onFocus} style="--grid-cols: {gridCols}">
  <div class="pathbar" class:move-pending={moveMode} class:flashing={pathbarFlashing}>
    {#if moveMode}
      <span class="move-hint">carrying {moveMode.names.size === 1 ? [...moveMode.names][0] : moveMode.names.size + ' items'} — ←/→ to move, Esc to drop</span>
    {:else if showSmartBar}
      <SmartBar
        bind:query={smartBarQuery}
        ghostSuffix={ghostSuggestion}
        onInput={handleSmartBarInput}
        onSubmit={commitSmartBar}
        onCancel={cancelSmartBar}
        onArrow={handleSmartBarArrow}
        onTab={handleSmartBarTab}
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
    <span class="col-name col-sort-btn" class:active={sortCol === 'name'} onclick={() => setSort('name')}>Name{#if sortCol === 'name'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>
    <span class="col-size col-sort-btn" class:active={sortCol === 'size'} onclick={() => setSort('size')}>Size{#if sortCol === 'size'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>
    <span class="col-date col-sort-btn" class:active={sortCol === 'date'} onclick={() => setSort('date')}>Modified{#if sortCol === 'date'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>
    <div class="col-handle" style="right: {12 + dateColWidth + sizeColWidth - 4}px" onmousedown={(e) => startResize(e, 'size')}></div>
    <div class="col-handle" style="right: {12 + dateColWidth - 4}px" onmousedown={(e) => startResize(e, 'date')}></div>
  </div>

  <div class="file-list" bind:this={fileListEl} oncontextmenu={(e) => openContextMenu(e, null)}>
    {#if creatingType !== null}
      <div class="file-row creating">
        <span class="col-icon">
          {#if creatingType === 'folder'}
            <Folder size={14} color="var(--pink)" strokeWidth={1.5} />
          {:else}
            <File size={14} color="var(--text-dim)" strokeWidth={1.5} />
          {/if}
        </span>
        <span class="col-name">
          <input
            class="inline-input"
            bind:this={creatingInputEl}
            bind:value={creatingName}
            onkeydown={handleCreateKeydown}
            placeholder="name…"
          />
        </span>
        <span class="col-size"></span>
        <span class="col-date"></span>
      </div>
    {/if}
    {#each displayFiles as entry, i}
      <div
        class="file-row"
        class:cursor={i === selectedIndex}
        class:in-selection={selectedNames.has(entry.name)}
        class:pending-delete={pendingDeleteNames.has(entry.name)}
        class:cut={clipboard?.type === 'cut' && clipboard?.dir === currentDir && clipboard?.names?.has(entry.name)}
        class:carrying={moveMode?.dir === currentDir && moveMode?.names?.has(entry.name)}
        oncontextmenu={(e) => openContextMenu(e, entry)}
        onclick={(e) => {
          pendingDeleteNames = new Set()
          if (e.ctrlKey || e.metaKey) {
            const next = new Set(selectedNames)
            next.has(entry.name) ? next.delete(entry.name) : next.add(entry.name)
            selectedNames = next
            selectedIndex = i
            anchorIndex = i
          } else if (e.shiftKey) {
            selectedIndex = i
            selectRange(anchorIndex, i)
          } else {
            selectedNames = new Set()
            selectedIndex = i
            anchorIndex = i
          }
        }}
        ondblclick={() => navigate(entry)}
      >
        <span class="col-icon">
          {#if entry.isDirectory}
            <Folder size={14} color="var(--pink)" strokeWidth={1.5} />
          {:else}
            <File size={14} color="var(--text-dim)" strokeWidth={1.5} />
          {/if}
        </span>
        <span class="col-name">
          {#if renamingName === entry.name}
            <input
              class="inline-input"
              bind:this={renamingInputEl}
              bind:value={renamingValue}
              onkeydown={handleRenameKeydown}
            />
          {:else}
            {entry.name}
          {/if}
        </span>
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

{#if contextMenu}
  <ContextMenu
    x={contextMenu.x}
    y={contextMenu.y}
    items={contextMenu.items}
    onClose={() => contextMenu = null}
  />
{/if}

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

  .pane.focused .pathbar {
    border-bottom-color: rgba(212, 96, 110, 0.5);
  }

  .pathbar.move-pending {
    border-bottom-color: var(--pink);
  }

  .pathbar.flashing {
    animation: path-follow-flash 0.8s ease forwards;
  }

  @keyframes path-follow-flash {
    0%   { background: rgba(212, 96, 110, 0.14); }
    100% { background: transparent; }
  }

  .move-hint {
    font-size: 11px;
    color: var(--pink);
    letter-spacing: 0.04em;
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
    display: grid;
    grid-template-columns: var(--grid-cols);
    align-items: center;
    padding: 0 12px;
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
  }

  .file-header span {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
    opacity: 0.6;
  }

  .file-header .col-sort-btn {
    cursor: pointer;
    user-select: none;
    transition: opacity 0.1s;
  }

  .file-header .col-sort-btn:hover,
  .file-header .col-sort-btn.active {
    opacity: 1;
  }

  .sort-arrow {
    margin-left: 3px;
    font-size: 13px;
    color: var(--emerald);
    text-transform: none;
    letter-spacing: 0;
    line-height: 1;
  }


  .col-handle {
    position: absolute;
    top: 0;
    width: 8px;
    height: 100%;
    cursor: col-resize;
    z-index: 1;
  }

  .col-handle::after {
    content: '';
    position: absolute;
    top: 0;
    left: calc(50% - 1px);
    width: 2px;
    height: 100%;
    background: var(--border);
    transition: background 0.1s;
  }

  .col-handle:hover::after {
    background: var(--text-dim);
  }

  .file-list {
    flex: 1;
    overflow-y: auto;
    padding: 2px 0;
  }

  .file-row {
    display: grid;
    grid-template-columns: var(--grid-cols);
    align-items: center;
    padding: 0 12px;
    height: 28px;
    cursor: pointer;
    position: relative;
    box-shadow: inset 2px 0 0 transparent;
    transition: background 0.1s, box-shadow 0.1s;
  }

  .file-row:hover { background: rgba(212, 96, 110, 0.07); }

  .file-row.cursor,
  .file-row.in-selection {
    background: rgba(80, 200, 120, 0.05);
    box-shadow: inset 2px 0 0 rgba(80, 200, 120, 0.45);
  }

  .pane.focused .file-row.cursor {
    background: rgba(80, 200, 120, 0.1);
    box-shadow: inset 3px 0 0 var(--emerald);
  }

  .col-icon {
    display: flex;
    align-items: center;
  }

  .col-name {
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-right: 16px;
  }

  .col-size {
    font-size: 11px;
    color: var(--text-dim);
    padding-left: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }


  .dir-size {
    cursor: pointer;
  }

  .dir-size:hover {
    color: var(--text);
  }

  .col-date {
    font-size: 11px;
    color: var(--text-dim);
    padding-left: 8px;
    cursor: pointer;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    transition: color 0.1s;
  }

  .col-date:hover { color: var(--text); }

  .pane.resizing {
    cursor: col-resize;
  }

  .pane.resizing .file-list {
    pointer-events: none;
  }

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

  .pane:hover .add-pane-btn,
  .pane.focused .add-pane-btn { opacity: 1; }
  .add-pane-btn:hover { background: var(--bg-hover); color: var(--text); }

  .file-row.cut {
    opacity: 0.35;
  }

  .file-row.carrying,
  .file-row.cursor.carrying,
  .file-row.in-selection.carrying {
    background: rgba(212, 96, 110, 0.05);
    box-shadow: inset 2px 0 0 var(--pink);
  }

  .file-row.carrying::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 4px;
    width: 6px;
    height: 6px;
    border-top: 1.5px solid var(--pink);
    border-right: 1.5px solid var(--pink);
    transform: translateY(-50%) rotate(45deg);
    animation: slide-in-left 0.2s ease forwards;
  }

  @keyframes slide-in-left {
    from { opacity: 0; left: -2px; }
    to   { opacity: 0.7; left: 4px; }
  }

  .file-row.creating {
    box-shadow: inset 2px 0 0 var(--text-dim);
  }

  .file-row.pending-delete {
    opacity: 0.45;
    background: rgba(212, 96, 110, 0.1);
    box-shadow: inset 2px 0 0 var(--pink);
  }

  .inline-input {
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 13px;
    font-family: inherit;
    width: 100%;
    padding: 0;
    caret-color: var(--pink);
  }
</style>
