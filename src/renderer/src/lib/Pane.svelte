<script>
  import { Folder, File, GripVertical, X, ChevronLeft } from 'lucide-svelte'
  import { getFileIcon } from './fileIcons.js'
  import SmartBar from './SmartBar.svelte'
  import ContextMenu from './ContextMenu.svelte'
  import { buildIndex, query as runQuery, invalidateCache, highlightSegments, isKnownTag, suggestTag } from './search.js'
  import { sep, baseName, isUnder, relHome, getBreadcrumbs, lastSepIndex, isWindows } from './paths.js'

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
    settings = null,
    paneIndex = 0,
    pointerDrag = null,
    onFileDragStart,
    onFileDragEnd,
    onFileDrop,
    onPaneDrop,
    onClose,
    onCollapse,
    onError,
    onOpenInNewPane,
    cairns = [],
    onToggleCairn,
    flexValue = 1,
    grace = false,
    startQuery = null,
  } = $props()

  let files = $state([])
  let badges = $state({})
  let gitInfo = $state(null)
  let selectedIndex = $state(0)
  let keyboardActive = $state(false)
  let hoveredIndex = $state(-1)
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
  let showScry = $state(false)
  let scryChildrenEl = $state(null)
  let scryEntry = $state(null)

  $effect(() => {
    if (!showScry) return
    function handleScryKey(e) {
      const step = e.ctrlKey ? 5 * 26 : 26
      if (e.key === 'ArrowDown') { e.stopPropagation(); e.preventDefault(); scryChildrenEl?.scrollBy({ top: step }) }
      if (e.key === 'ArrowUp')   { e.stopPropagation(); e.preventDefault(); scryChildrenEl?.scrollBy({ top: -step }) }
    }
    document.addEventListener('keydown', handleScryKey, true)
    return () => document.removeEventListener('keydown', handleScryKey, true)
  })
  let scryData = $state(null)
  let scryLoading = $state(false)
  let scryAnchorY = $state(null)
  let scryBelow = $state(true)
  let scryPanelStyle = $derived.by(() => {
    if (scryAnchorY === null) return 'bottom: 0; max-height: 70%'
    const rowTop = Math.max(0, scryAnchorY - 62)
    const rowBottom = rowTop + 28
    return scryBelow
      ? `top: ${rowBottom}px; max-height: calc(100% - ${rowBottom + 4}px)`
      : `bottom: calc(100% - ${rowTop}px); max-height: calc(${rowTop - 4}px)`
  })

  let scryOverlayStyle = $derived.by(() => {
    const dark = 'rgba(4,10,15,0.72)'
    if (scryAnchorY === null) return `background: ${dark}`
    const rowTop = Math.max(0, scryAnchorY - 62)
    const rowBottom = rowTop + 28
    const stops = [
      rowTop > 0 ? `${dark} ${rowTop}px` : null,
      `transparent ${rowTop}px`,
      `transparent ${rowBottom}px`,
      `${dark} ${rowBottom}px`,
    ].filter(Boolean).join(', ')
    return `background: linear-gradient(to bottom, ${stops})`
  })
  let pathbarFlashing = $state(false)
  let flashTimer = null
  let selectAllTimers = []

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
  let loadError = $state(null)
  let breadcrumbsEl = $state(null)
  let breadcrumbScrollTimer = null
  let driveMenu = $state(false)
  let drives = $state([])
  let driveMenuPos = $state({ x: 0, y: 0 })
  let sizeColWidth = $state(90)
  let dateColBaseWidth = $state(110)
  let dateColWidth = $derived.by(() => {
    if (expandedDates.size === 0) return dateColBaseWidth
    const maxChars = files.reduce((max, f) => Math.max(max, formatDate(f.mtime, true).length), 0)
    return Math.max(dateColBaseWidth, maxChars * 7 + 16)
  })
  let resizing = $state(false)
  let gridCols = $derived.by(() => {
    if (smartBarSearchMode) return '22px 1fr'
    const shrink = settings?.autoHideColumns === false
    const sizePart = !showSizeCol ? null : shrink ? `minmax(50px, ${sizeColWidth}px)` : `${sizeColWidth}px`
    const datePart = !showDateCol ? null : shrink ? `minmax(60px, ${dateColWidth}px)` : `${dateColWidth}px`
    return ['22px', '1fr', sizePart, datePart].filter(Boolean).join(' ')
  })
  let paneEl = $state(null)
  let paneWidth = $state(0)

  $effect(() => {
    if (!paneEl) return
    const ro = new ResizeObserver(entries => { paneWidth = entries[0].contentRect.width })
    ro.observe(paneEl)
    return () => ro.disconnect()
  })

  let showSizeCol = $derived(
    settings?.autoHideColumns === false || paneWidth === 0 || paneWidth >= 260
  )
  let showDateCol = $derived(
    settings?.autoHideColumns === false || paneWidth === 0 || paneWidth >= 380
  )

  let dropTargetFolder = $state(null)
  let dropOverList = $state(false)
  let dropInsertIndex = $state(null)
  let dropCrumb = $state(null)
  let crumbHoverTimer = null
  let folderHoverTimer = null
  let paneDragOver = $state(false)
  let isDraggingThisPane = $state(false)
  let draggingNames = $derived(
    pointerDrag?.sourceDir === currentDir ? pointerDrag.names : new Set()
  )

  // clear all drop state when pointer drag ends
  $effect(() => {
    if (!pointerDrag) {
      dropTargetFolder = null
      dropOverList = false
      dropInsertIndex = null
      dropCrumb = null
      clearTimeout(folderHoverTimer)
      clearTimeout(crumbHoverTimer)
    }
  })

  // pending drag: tracks a mousedown that may become a drag once threshold is crossed
  let pendingDrag = null

  function handleRowPointerDown(e, entry) {
    if (e.button !== 0 || e.shiftKey) return
    const names = selectedNames.has(entry.name) ? new Set(selectedNames) : new Set([entry.name])
    pendingDrag = { names, singleIsDir: entry.isDirectory && names.size === 1, startX: e.clientX, startY: e.clientY }
    document.addEventListener('pointermove', handlePendingMove)
    document.addEventListener('pointerup', cancelPendingDrag, { once: true })
  }

  function handlePendingMove(e) {
    if (!pendingDrag) return
    const dx = e.clientX - pendingDrag.startX
    const dy = e.clientY - pendingDrag.startY
    if (Math.sqrt(dx * dx + dy * dy) > 5) {
      document.removeEventListener('pointermove', handlePendingMove)
      document.removeEventListener('pointerup', cancelPendingDrag)
      onFileDragStart?.(currentDir, pendingDrag.names, pendingDrag.singleIsDir, e.clientX, e.clientY)
      pendingDrag = null
    }
  }

  function cancelPendingDrag() {
    document.removeEventListener('pointermove', handlePendingMove)
    pendingDrag = null
  }

  let smartBarFilter = $derived(() => {
    if (!showSmartBar) return ''
    const i = lastSepIndex(smartBarQuery)
    return i >= 0 ? smartBarQuery.slice(i + 1) : smartBarQuery
  })

  let smartBarCairnsMode = $derived(showSmartBar && smartBarQuery.startsWith('@'))
  let smartBarSearchMode = $derived(showSmartBar && smartBarQuery.startsWith('?'))

  let smartBarSearchResults = $state([])
  let smartBarChips = $state([])
  let _smartBarSearchIndex = null
  let _smartBarIndexBuilding = false
  let smartBarIndexReady = $state(false)

  $effect(() => {
    if (!smartBarSearchMode) { smartBarSearchResults = []; return }
    const q = smartBarQuery.slice(1)
    if (!q.trim() && smartBarChips.length === 0) { smartBarSearchResults = []; return }
    if (smartBarIndexReady) {
      smartBarSearchResults = runQuery(_smartBarSearchIndex, q, currentDir, smartBarChips)
      return
    }
    if (!_smartBarIndexBuilding) {
      _smartBarIndexBuilding = true
      buildIndex(window.krypta.homeDir).then(idx => {
        _smartBarSearchIndex = idx
        smartBarIndexReady = true
      }).catch(err => {
        console.error('[Pane ?] index build failed:', err)
        _smartBarIndexBuilding = false
      })
    }
  })

  $effect(() => {
    if (!smartBarIndexReady || !smartBarSearchMode) return
    const q = smartBarQuery.slice(1)
    if (!q.trim() && smartBarChips.length === 0) { smartBarSearchResults = []; return }
    smartBarSearchResults = runQuery(_smartBarSearchIndex, q, currentDir, smartBarChips)
  })

  let displayFiles = $derived.by(() => {
    if (smartBarCairnsMode) {
      const filter = smartBarQuery.slice(1).toLowerCase()
      return (cairns ?? [])
        .filter(p => !filter || p.toLowerCase().includes(filter))
        .map(p => ({
          name: baseName(p),
          isDirectory: true,
          _cairnPath: p,
          size: null,
          mtime: null,
          itemCount: null,
        }))
    }
    if (smartBarSearchMode) {
      const q = smartBarQuery.slice(1)
      if (!q.trim() && smartBarChips.length === 0) {
        return files.map(f => ({
          name: f.name,
          isDirectory: f.isDirectory,
          _searchPath: window.krypta.joinPath(currentDir, f.name),
          size: null,
          mtime: null,
          itemCount: null,
        }))
      }
      return smartBarSearchResults.map(r => ({
        name: r.name,
        isDirectory: r.isDirectory,
        _searchPath: r.path,
        matches: r.matches,
        size: null,
        mtime: null,
        itemCount: null,
      }))
    }
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
    if (smartBarSearchMode) {
      const q = smartBarQuery.slice(1)
      const tagMatch = q.match(/#(\w+)$/)
      if (tagMatch) {
        const suggestion = suggestTag(tagMatch[1])
        return suggestion ? suggestion.slice(tagMatch[1].length) : ''
      }
      if (smartBarQuery !== '?') return ''
      return relHome(currentDir)
    }
    if (smartBarCairnsMode) {
      const filter = smartBarQuery.slice(1).toLowerCase()
      if (!filter) return ''
      const selected = displayFiles[selectedIndex]
      if (!selected || !selected.name.toLowerCase().startsWith(filter)) return ''
      return selected.name.slice(filter.length)
    }
    const filter = smartBarFilter()
    const selected = displayFiles[selectedIndex]
    if (!selected?.isDirectory) return ''
    if (!filter) return selected.name + sep
    if (!selected.name.toLowerCase().startsWith(filter.toLowerCase())) return ''
    return selected.name.slice(filter.length) + sep
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

  $effect(() => {
    const dir = currentDir
    gitInfo = null
    window.krypta.getGitInfo(dir).then(info => {
      if (currentDir === dir) gitInfo = info
    }).catch(() => {})
  })

  $effect(() => {
    currentDir
    if (breadcrumbsEl) breadcrumbsEl.scrollLeft = breadcrumbsEl.scrollWidth
  })

  $effect(() => {
    refreshKey
    settings?.showHidden
    loadFiles(currentDir)
  })

  let lastDirMtime = 0

  async function refreshFiles() {
    try {
      const newFiles = await window.krypta.readDir(currentDir, { showHidden: settings?.showHidden === true })
      const { mtime } = await window.krypta.statPath(currentDir)
      lastDirMtime = mtime
      const newNames = new Set(newFiles.map(f => f.name))
      const prevName = files[selectedIndex]?.name
      files = newFiles
      loadError = null
      selectedNames = new Set([...selectedNames].filter(n => newNames.has(n)))
      const idx = prevName ? newFiles.findIndex(f => f.name === prevName) : -1
      if (idx >= 0) selectedIndex = idx
      scanBadges(currentDir, newFiles)
    } catch { /* silent — don't disrupt UI on background refresh */ }
  }

  // forced refresh on window focus
  $effect(() => {
    window.addEventListener('focus', refreshFiles)
    return () => window.removeEventListener('focus', refreshFiles)
  })

  // lazy interval: stat the dir every 3s, only readDir if mtime changed
  $effect(() => {
    const dir = currentDir
    const id = setInterval(async () => {
      try {
        const { mtime } = await window.krypta.statPath(dir)
        if (mtime !== lastDirMtime) await refreshFiles()
      } catch {}
    }, 3000)
    return () => clearInterval(id)
  })

  function scanBadges(dir, fileList) {
    badges = {}
    const dirNames = fileList.filter(f => f.isDirectory).map(f => f.name)
    if (!dirNames.length) return
    window.krypta.checkMarkers(dir, dirNames).then(results => {
      if (currentDir !== dir) return
      const map = {}
      for (const r of results) {
        if (r.markers.length) map[r.name] = r.markers
      }
      badges = map
    }).catch(() => {})
  }

  async function loadFiles(dir) {
    try {
      files = await window.krypta.readDir(dir, { showHidden: settings?.showHidden === true })
      window.krypta.statPath(dir).then(({ mtime }) => { lastDirMtime = mtime }).catch(() => {})
      loadError = null
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
      scanBadges(dir, files)
    } catch (err) {
      files = []
      loadError = errorReason(err)
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
    if (entry._cairnPath) {
      currentDir = entry._cairnPath
      if (showSmartBar) closeSmartBar()
      return
    }
    if (entry._searchPath) {
      currentDir = entry.isDirectory ? entry._searchPath : window.krypta.parentDir(entry._searchPath)
      if (showSmartBar) closeSmartBar()
      return
    }
    if (entry.isDirectory) {
      currentDir = window.krypta.joinPath(currentDir, entry.name)
    } else {
      window.krypta.openFile(window.krypta.joinPath(currentDir, entry.name))
    }
  }

  function navigateUp() {
    if (!window.krypta.isRoot(currentDir)) {
      pendingSelectName = baseName(currentDir)
      currentDir = window.krypta.parentDir(currentDir)
    }
  }

  async function toggleDriveMenu(e) {
    if (driveMenu) { driveMenu = false; return }
    const r = e.currentTarget.getBoundingClientRect()
    driveMenuPos = { x: r.left, y: r.bottom + 4 }
    driveMenu = true
    try { drives = (await window.krypta.listDrives?.()) ?? [] } catch { drives = [] }
  }

  function selectDrive(d) {
    driveMenu = false
    if (d !== currentDir) currentDir = d
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
        case '@':
        case '§':
          e.preventDefault()
          openCairnsBar()
          break
        case '2':
          if (e.altKey && !e.shiftKey && !e.metaKey) { e.preventDefault(); openCairnsBar() }
          break
        case 'ArrowDown':
          e.preventDefault()
          pendingDeleteNames = new Set()
          keyboardActive = true
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
          keyboardActive = true
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
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && displayFiles[selectedIndex]?.isDirectory) {
            e.preventDefault()
            onOpenInNewPane?.(window.krypta.joinPath(currentDir, displayFiles[selectedIndex].name))
            break
          }
          if (e.shiftKey) break
          if (e.ctrlKey || e.metaKey) break
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
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && displayFiles[selectedIndex]?.isDirectory) {
            e.preventDefault()
            onOpenInNewPane?.(window.krypta.joinPath(currentDir, displayFiles[selectedIndex].name), true)
            break
          }
          if (e.shiftKey) break
          if (e.ctrlKey || e.metaKey) break
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
            break
          }
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && displayFiles[selectedIndex]?.isDirectory) {
            e.preventDefault()
            onOpenInNewPane?.(window.krypta.joinPath(currentDir, displayFiles[selectedIndex].name))
            break
          }
          e.preventDefault()
          pendingDeleteNames = new Set()
          selectedNames = new Set()
          if (displayFiles[selectedIndex]) navigate(displayFiles[selectedIndex])
          break
        case 'Backspace':
          e.preventDefault()
          pendingDeleteNames = new Set()
          selectedNames = new Set()
          navigateUp()
          break
        case 'a':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            selectAllTimers.forEach(clearTimeout)
            selectAllTimers = []
            selectedNames = new Set()
            anchorIndex = 0
            selectedIndex = displayFiles.length - 1
            const names = displayFiles.map(f => f.name)
            const delay = Math.min(12, 300 / names.length)
            names.forEach((name, i) => {
              selectAllTimers.push(setTimeout(() => {
                selectedNames = new Set([...selectedNames, name])
              }, Math.round(i * delay)))
            })
          }
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
        case 'y': {
          e.preventDefault()
          const yankTarget = displayFiles[hoveredIndex >= 0 ? hoveredIndex : selectedIndex]
          navigator.clipboard.writeText(yankTarget ? window.krypta.joinPath(currentDir, yankTarget.name) : currentDir)
          break
        }
        case 'b': {
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          const activeEntry = displayFiles[hoveredIndex >= 0 ? hoveredIndex : selectedIndex]
          const cairnTarget = activeEntry?.isDirectory
            ? window.krypta.joinPath(currentDir, activeEntry.name)
            : currentDir
          onToggleCairn?.(cairnTarget)
          break
        }
        case 'I': {
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            if (showScry) { closeScry(); break }
            const activeIdx = hoveredIndex >= 0 ? hoveredIndex : selectedIndex
            const scryEntry = displayFiles[activeIdx]
            if (scryEntry) {
              const offset = creatingType !== null ? 1 : 0
              const row = fileListEl?.children[activeIdx + offset]
              const paneRect = paneEl?.getBoundingClientRect()
              const rowRect = row?.getBoundingClientRect()
              openScry(scryEntry, (rowRect && paneRect) ? rowRect.top - paneRect.top : null)
            }
          }
          break
        }
        case 'i': {
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          if (showScry) { closeScry(); break }
          const activeIdx = hoveredIndex >= 0 ? hoveredIndex : selectedIndex
          const scryEntry = displayFiles[activeIdx]
          if (scryEntry) {
            const offset = creatingType !== null ? 1 : 0
            const row = fileListEl?.children[activeIdx + offset]
            const paneRect = paneEl?.getBoundingClientRect()
            const rowRect = row?.getBoundingClientRect()
            const anchorY = (rowRect && paneRect) ? rowRect.top - paneRect.top : null
            openScry(scryEntry, anchorY)
          }
          break
        }
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
          if (e.ctrlKey || e.metaKey) break
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
          if (showScry) { closeScry(); break }
          pendingDeleteNames = new Set()
          selectedNames = new Set()
          selectedIndex = -1
          if (moveMode) onToggleMoveMode?.()
          break
      }
    }
    function handleKeyPress(e) {
      if (!focused || showSmartBar || creatingType !== null || renamingName !== null) return
      if (e.key === '@') { e.preventDefault(); openCairnsBar() }
      if (e.key === '?') { e.preventDefault(); openSearchBar() }
    }
    document.addEventListener('keydown', handleKey)
    document.addEventListener('keypress', handleKeyPress)
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.removeEventListener('keypress', handleKeyPress)
    }
  })

  function openSmartBar() {
    smartBarOriginalDir = currentDir
    smartBarQuery = (currentDir.endsWith('/') || currentDir.endsWith('\\')) ? currentDir : currentDir + sep
    selectedIndex = Math.max(0, selectedIndex)
    showSmartBar = true
  }

  function openCairnsBar() {
    smartBarOriginalDir = currentDir
    smartBarQuery = '@'
    showSmartBar = true
  }

  function openSearchBar() {
    smartBarOriginalDir = currentDir
    smartBarQuery = '?'
    showSmartBar = true
  }

  let _startQueryFired = false
  $effect(() => {
    if (!startQuery || _startQueryFired) return
    _startQueryFired = true
    if (startQuery === '/') openSmartBar()
    else if (startQuery === '@') openCairnsBar()
    else if (startQuery === '?') openSearchBar()
  })

  function searchResultParent(entry) {
    if (!entry._searchPath) return ''
    const parent = window.krypta.parentDir(entry._searchPath)
    if (parent === currentDir) return '—'
    return relHome(parent)
  }

  function closeSmartBar() {
    showSmartBar = false
    smartBarQuery = ''
    smartBarOriginalDir = null
  }

  function cancelSmartBar() {
    const filter = (smartBarCairnsMode || smartBarSearchMode) ? '' : smartBarFilter()
    if (filter && smartBarOriginalDir !== null && smartBarOriginalDir !== currentDir) {
      currentDir = smartBarOriginalDir
    }
    showSmartBar = false
    smartBarQuery = ''
    smartBarOriginalDir = null
    smartBarChips = []
  }

  async function handleSmartBarInput(query) {
    smartBarQuery = query
    if (query.startsWith('@')) return
    if (query.includes('@')) { smartBarQuery = '@'; return }
    if (query.startsWith('?')) return
    if (query.includes('?')) { smartBarQuery = '?'; return }
    const lastSlash = lastSepIndex(query)
    if (lastSlash < 0) return
    const dirPart = query.slice(0, lastSlash + 1)  // includes trailing separator

    let normalizedDir = dirPart.replace(/[/\\]+$/, '')
    if (normalizedDir === '') normalizedDir = '/'                    // POSIX root
    else if (/^[A-Za-z]:$/.test(normalizedDir)) normalizedDir += sep // Windows drive root (C:\)
    if (normalizedDir !== currentDir) {
      try {
        const loaded = await window.krypta.readDir(dirPart)
        files = loaded
        currentDir = normalizedDir
        selectedIndex = 0
      } catch {}
    }
  }

  function handleSmartBarTab() {
    if (smartBarSearchMode) {
      const q = smartBarQuery.slice(1)
      const tagMatch = q.match(/#(\w+)$/)
      if (tagMatch) {
        const suggestion = suggestTag(tagMatch[1])
        if (suggestion) {
          if (!smartBarChips.includes(suggestion)) smartBarChips = [...smartBarChips, suggestion]
          smartBarQuery = '?' + q.slice(0, q.length - tagMatch[0].length).trimEnd()
          handleSmartBarInput(smartBarQuery)
        }
      }
      return
    }
    if (smartBarCairnsMode) {
      const filter = smartBarQuery.slice(1).toLowerCase()
      if (!filter) return
      const selected = displayFiles[selectedIndex]
      if (!selected || !selected.name.toLowerCase().startsWith(filter)) return
      const unique = displayFiles.filter(f => f.name.toLowerCase().startsWith(filter)).length === 1
      if (unique || selected.name.toLowerCase() === filter) {
        currentDir = selected._cairnPath
        closeSmartBar()
      } else {
        smartBarQuery = '@' + selected.name
      }
      return
    }
    const filter = smartBarFilter()
    const lastSlash = lastSepIndex(smartBarQuery)
    if (!filter) {
      const selected = displayFiles[selectedIndex]
      if (selected?.isDirectory) {
        smartBarQuery = smartBarQuery.slice(0, lastSlash + 1) + selected.name + sep
        handleSmartBarInput(smartBarQuery)
      }
      return
    }
    const dirPart = smartBarQuery.slice(0, lastSlash + 1)

    const prefixMatches = files.filter(f => f.name.toLowerCase().startsWith(filter.toLowerCase()))
    if (prefixMatches.length === 0) return

    if (prefixMatches.length === 1) {
      // Only one candidate left → enter it directly
      const m = prefixMatches[0]
      smartBarQuery = dirPart + m.name + (m.isDirectory ? sep : '')
      handleSmartBarInput(smartBarQuery)
      return
    }

    const selected = displayFiles[selectedIndex]
    const selectedMatches = selected && selected.name.toLowerCase().startsWith(filter.toLowerCase())

    if (selectedMatches) {
      if (selected.name.toLowerCase() === filter.toLowerCase()) {
        // Filter exactly equals selected item's full name → enter it
        smartBarQuery = dirPart + selected.name + (selected.isDirectory ? sep : '')
      } else {
        // Fill to selected item's full name; also enter if it's now the only prefix match
        const uniqueAfterFill = files.filter(f =>
          f.name.toLowerCase().startsWith(selected.name.toLowerCase())
        ).length === 1
        smartBarQuery = dirPart + selected.name + (uniqueAfterFill && selected.isDirectory ? sep : '')
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
    try {
      const keys = await Promise.all(
        names.map(n => window.krypta.kryptaTrash(window.krypta.joinPath(currentDir, n)))
      )
      onHistory?.({ type: 'trash', dir: currentDir, names, keys })
      onChanged?.(currentDir)
      invalidateCache(window.krypta.homeDir)
    } catch (err) {
      onError?.(`${names.length === 1 ? `Couldn't trash "${names[0]}"` : `Couldn't trash ${names.length} items`} — ${errorReason(err)}`)
    }
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
      if (entry.isDirectory) {
        items.push({ label: 'Open in New Pane', shortcut: 'Ctrl+Shift+Click', action: () => onOpenInNewPane?.(window.krypta.joinPath(currentDir, entry.name)) })
        const entryPath = window.krypta.joinPath(currentDir, entry.name)
        const isCairned = (cairns ?? []).includes(entryPath)
        items.push({ label: isCairned ? 'Remove from Cairns' : 'Add to Cairns', shortcut: 'b', action: () => onToggleCairn?.(entryPath) })
      }
      items.push({ label: 'Scry', shortcut: 'i', action: () => {
        const idx = displayFiles.findIndex(f => f.name === entry.name)
        const offset = creatingType !== null ? 1 : 0
        const row = idx >= 0 ? fileListEl?.children[idx + offset] : null
        const paneRect = paneEl?.getBoundingClientRect()
        const rowRect = row?.getBoundingClientRect()
        const anchorY = (rowRect && paneRect) ? rowRect.top - paneRect.top : null
        openScry(entry, anchorY)
      }})
      items.push({ label: 'Rename', shortcut: 'r', action: () => { renamingName = entry.name; renamingValue = entry.name } })
      items.push(sep)
    }

    if (!entry) {
      const isCairned = (cairns ?? []).includes(currentDir)
      items.push({ label: isCairned ? 'Remove from Cairns' : 'Add to Cairns', action: () => onToggleCairn?.(currentDir) })
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
    const terminalDir = (targets.length === 1 && entry?.isDirectory)
      ? window.krypta.joinPath(currentDir, targets[0])
      : currentDir
    const activePath = entry ? window.krypta.joinPath(currentDir, entry.name) : currentDir
    items.push({ label: 'Open Terminal Here', action: () => window.krypta.openTerminal(terminalDir) })
    items.push({ label: 'Copy Path', action: () => navigator.clipboard.writeText(activePath) })
    if (settings?.copyAllPaths && targets.length > 1)
      items.push({ label: 'Copy All Paths', action: () => navigator.clipboard.writeText(targets.map(n => window.krypta.joinPath(currentDir, n)).join('\n')) })

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
    if (smartBarCairnsMode) {
      const target = displayFiles[selectedIndex] ?? displayFiles[0]
      if (target?._cairnPath) {
        currentDir = target._cairnPath
        closeSmartBar()
      }
      return
    }
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
    keyboardActive = true
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

  function errorReason(err) {
    switch (err?.code) {
      case 'EACCES':
      case 'EPERM':      return 'permission denied'
      case 'EEXIST':     return 'name already taken'
      case 'ENOENT':     return 'file no longer exists'
      case 'ENOTEMPTY':  return 'folder is not empty'
      case 'EBUSY':      return 'file is in use'
      default:           return err?.message ?? 'unknown error'
    }
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
      invalidateCache(window.krypta.homeDir)
    } catch (err) {
      onError?.(`Couldn't create ${type === 'folder' ? 'folder' : 'file'} "${name}" — ${errorReason(err)}`)
    }
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
      invalidateCache(window.krypta.homeDir)
    } catch (err) {
      onError?.(`Couldn't rename "${oldName}" — ${errorReason(err)}`)
    }
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
      invalidateCache(window.krypta.homeDir)
    } catch (err) {
      onError?.(`${names.length === 1 ? `Couldn't trash "${names[0]}"` : `Couldn't trash ${names.length} items`} — ${errorReason(err)}`)
    }
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
        invalidateCache(window.krypta.homeDir)
      } else {
        await Promise.all([...names].map(name =>
          window.krypta.copy(
            window.krypta.joinPath(sourceDir, name),
            window.krypta.joinPath(currentDir, name)
          )
        ))
        onHistory?.({ type: 'copy', srcDir: sourceDir, destDir: currentDir, names: [...names] })
        onChanged?.(currentDir)
        invalidateCache(window.krypta.homeDir)
      }
    } catch (err) {
      onError?.(`${type === 'cut' ? 'Move' : 'Copy'} failed — ${errorReason(err)}`)
    }
  }

  async function openScry(entry, anchorY = null) {
    scryAnchorY = anchorY
    if (anchorY !== null && paneEl) {
      const overlayHeight = paneEl.getBoundingClientRect().height - 82
      scryBelow = (anchorY - 62) < overlayHeight / 2
    } else {
      scryBelow = true
    }
    scryEntry = { name: entry.name, isDirectory: entry.isDirectory, size: entry.size, mtime: entry.mtime, itemCount: entry.itemCount }
    const path = entry._cairnPath ?? window.krypta.joinPath(currentDir, entry.name)
    scryLoading = true
    showScry = true
    scryData = null
    try {
      const statResult = await window.krypta.statPath(path)
      let children = null
      if (entry.isDirectory) {
        children = await window.krypta.readDirNames(path)
      }
      scryData = { path, name: entry.name, isDirectory: entry.isDirectory, stat: statResult, children }
    } finally {
      scryLoading = false
    }
  }

  function closeScry() {
    showScry = false
    scryEntry = null
    scryData = null
    scryLoading = false
    scryAnchorY = null
    scryBelow = true
  }

  function formatMode(mode) {
    if (mode == null) return '—'
    return (mode & 0o777).toString(8).padStart(3, '0')
  }

  function fileExt(name) {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot) : '—'
  }

  function setSort(col) {
    if (sortCol === col) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      sortCol = col
      sortDir = 'asc'
    }
  }

  function openCreateMenu(e) {
    if (contextMenu?.fromCreate) { contextMenu = null; return }
    const rect = e.currentTarget.getBoundingClientRect()
    contextMenu = {
      fromCreate: true,
      x: rect.right,
      y: rect.top,
      anchorRight: true,
      items: [
        { label: 'New File',   shortcut: 'n', action: () => startCreate('file') },
        { label: 'New Folder', shortcut: 'N', action: () => startCreate('folder') },
      ]
    }
  }

  function handleBreadcrumbMouseMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const zone = 18
    clearInterval(breadcrumbScrollTimer)
    if (x < zone) {
      const speed = Math.ceil((1 - x / zone) * 5)
      breadcrumbScrollTimer = setInterval(() => { breadcrumbsEl.scrollLeft -= speed }, 16)
    } else if (x > rect.width - zone) {
      const speed = Math.ceil((1 - (rect.width - x) / zone) * 5)
      breadcrumbScrollTimer = setInterval(() => { breadcrumbsEl.scrollLeft += speed }, 16)
    }
  }

  function handleBreadcrumbMouseLeave() {
    clearInterval(breadcrumbScrollTimer)
    breadcrumbScrollTimer = null
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

<div
  class="pane"
  class:focused
  class:resizing
  class:grace
  bind:this={paneEl}
  onmouseenter={onFocus}
  style="flex: {flexValue}; --grid-cols: {gridCols}"
  ondragover={(e) => {
    if (!isDraggingThisPane && e.dataTransfer.types.includes('application/krypta-pane')) {
      e.preventDefault()
      paneDragOver = true
    }
  }}
  ondragleave={(e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) paneDragOver = false
  }}
  ondrop={(e) => {
    if (!e.dataTransfer.types.includes('application/krypta-pane')) return
    e.preventDefault()
    paneDragOver = false
    const fromIndex = parseInt(e.dataTransfer.getData('application/krypta-pane'))
    if (!isNaN(fromIndex) && fromIndex !== paneIndex) onPaneDrop?.(fromIndex, paneIndex)
  }}
>
  <div
    class="pathbar"
    class:move-pending={moveMode}
    class:flashing={pathbarFlashing}
    class:pane-drag-over={paneDragOver}
  >
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
        onScry={() => {
          if (showScry) { closeScry(); return }
          const activeIdx = hoveredIndex >= 0 ? hoveredIndex : selectedIndex
          const entry = displayFiles[activeIdx]
          if (!entry) return
          const offset = creatingType !== null ? 1 : 0
          const row = fileListEl?.children[activeIdx + offset]
          const paneRect = paneEl?.getBoundingClientRect()
          const rowRect = row?.getBoundingClientRect()
          openScry(entry, (rowRect && paneRect) ? rowRect.top - paneRect.top : null)
        }}
        chips={smartBarSearchMode ? smartBarChips : []}
        onChipAdd={(tag) => { if (!smartBarChips.includes(tag)) smartBarChips = [...smartBarChips, tag] }}
        onChipRemove={(tag) => { smartBarChips = smartBarChips.filter(t => t !== tag) }}
      />
    {:else}
      <button class="pane-collapse-btn" onclick={onCollapse} title="Collapse pane"><ChevronLeft size={10} strokeWidth={2.5} /></button>
      <div
        class="breadcrumbs"
        bind:this={breadcrumbsEl}
        onmousemove={handleBreadcrumbMouseMove}
        onmouseleave={handleBreadcrumbMouseLeave}
      >
        {#each breadcrumbs as crumb, i}
          {#if i > 0}<span class="sep">›</span>{/if}
          {#if isWindows && i === 0}
            <button
              class="crumb drive-switch"
              class:git-dir={gitInfo && isUnder(crumb.path, gitInfo.root)}
              title="Switch drive"
              onclick={(e) => { e.stopPropagation(); toggleDriveMenu(e) }}
            >{crumb.name}</button>
          {:else if i < breadcrumbs.length - 1}
            <button
              class="crumb"
              class:git-dir={gitInfo && isUnder(crumb.path, gitInfo.root)}
              class:drop-target={dropCrumb === crumb.path}
              onclick={(e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey) { onOpenInNewPane?.(crumb.path) } else { currentDir = crumb.path } }}
              oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); contextMenu = { x: e.clientX, y: e.clientY, items: [{ label: 'Open in New Pane', shortcut: 'Ctrl+Shift+Click', action: () => onOpenInNewPane?.(crumb.path) }, { label: 'Open Terminal Here', action: () => window.krypta.openTerminal(crumb.path) }, { label: 'Copy Path', action: () => navigator.clipboard.writeText(crumb.path) }] } }}
              onpointerenter={() => {
                if (!pointerDrag) return
                if (dropCrumb !== crumb.path) {
                  dropCrumb = crumb.path
                  clearTimeout(crumbHoverTimer)
                  if (settings?.springLoad !== false) {
                    crumbHoverTimer = setTimeout(() => { currentDir = crumb.path; dropCrumb = null }, settings?.springLoadDelay ?? 800)
                  }
                }
              }}
              onpointerleave={() => {
                if (!pointerDrag) return
                dropCrumb = null
                clearTimeout(crumbHoverTimer)
              }}
              onpointerup={(e) => {
                if (!pointerDrag) return
                clearTimeout(crumbHoverTimer)
                dropCrumb = null
                if (pointerDrag.sourceDir !== crumb.path) onFileDrop?.(crumb.path, e.ctrlKey)
              }}
            >{crumb.name}</button>
          {:else}
            <button class="crumb" class:git-dir={gitInfo && isUnder(crumb.path, gitInfo.root)} onclick={(e) => { if ((e.ctrlKey || e.metaKey) && e.shiftKey) { onOpenInNewPane?.(crumb.path) } else { openSmartBar() } }} oncontextmenu={(e) => { e.preventDefault(); e.stopPropagation(); contextMenu = { x: e.clientX, y: e.clientY, items: [{ label: 'Open in New Pane', shortcut: 'Ctrl+Shift+Click', action: () => onOpenInNewPane?.(crumb.path) }, { label: 'Open Terminal Here', action: () => window.krypta.openTerminal(crumb.path) }, { label: 'Copy Path', action: () => navigator.clipboard.writeText(crumb.path) }] } }}>{crumb.name}</button>
          {/if}
        {/each}
      </div>
      {#if gitInfo}
        <span class="git-badge" title="Git repo: {gitInfo.root}">⎇ {gitInfo.branch}</span>
      {/if}
      <button class="pathbar-spacer" aria-label="Edit path" title="Edit path" onclick={openSmartBar}></button>
      <div class="pane-actions">
        <button class="pane-action-btn" onclick={onAddPane} title="New pane">+</button>
        <span class="pane-actions-sep"></span>
        <button class="pane-action-btn close" onclick={onClose} title="Close pane"><X size={10} strokeWidth={2.5} /></button>
      </div>
    {/if}
  </div>

  {#if !smartBarSearchMode}
  <div class="file-header">
    <span class="col-icon"></span>
    <span class="col-name col-sort-btn" class:active={sortCol === 'name'} onclick={() => setSort('name')}>Name{#if sortCol === 'name'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>
    {#if showSizeCol}<span class="col-size col-sort-btn" class:active={sortCol === 'size'} onclick={() => setSort('size')}>Size{#if sortCol === 'size'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>{/if}
    {#if showDateCol}<span class="col-date col-sort-btn" class:active={sortCol === 'date'} onclick={() => setSort('date')}>Modified{#if sortCol === 'date'}<span class="sort-arrow">{sortDir === 'asc' ? '▲' : '▼'}</span>{/if}</span>{/if}
    {#if showSizeCol}<div class="col-handle" style="right: {12 + (showDateCol ? dateColWidth : 0) + sizeColWidth - 4}px" onmousedown={(e) => startResize(e, 'size')}></div>{/if}
    {#if showDateCol}<div class="col-handle" style="right: {12 + dateColWidth - 4}px" onmousedown={(e) => startResize(e, 'date')}></div>{/if}
    {#if !showDateCol || !showSizeCol}
      {@const hiddenCols = [!showDateCol && 'Modified', !showSizeCol && 'Size'].filter(Boolean)}
      <div class="cols-hidden" title="{hiddenCols.join(', ')} hidden">+{hiddenCols.length}</div>
    {/if}
  </div>
  {/if}
  {#if smartBarSearchMode}
  <div class="search-count-bar">
    {#if !smartBarIndexReady}
      <span class="search-count-label">indexing…</span>
    {:else}
      <span class="search-count-label">{displayFiles.length} {displayFiles.length === 1 ? 'result' : 'results'}</span>
    {/if}
  </div>
  {/if}

  <div
    class="file-list"
    class:drop-over={dropOverList && !dropTargetFolder}
    bind:this={fileListEl}
    onmousemove={() => { if (keyboardActive) keyboardActive = false }}
    onmouseleave={() => { hoveredIndex = -1 }}
    oncontextmenu={(e) => openContextMenu(e, null)}
    onclick={(e) => {
      if (e.target === e.currentTarget) {
        selectedIndex = -1
        selectedNames = new Set()
      }
    }}
    onpointermove={(e) => {
      if (!pointerDrag) return
      const row = e.target.closest('[data-entry-name]')
      if (row) {
        const name = row.dataset.entryName
        const isDir = row.dataset.entryIsDir === 'true'
        if (isDir) {
          if (dropTargetFolder !== name) {
            dropTargetFolder = name
            dropOverList = false
            dropInsertIndex = null
            clearTimeout(folderHoverTimer)
            if (settings?.springLoad !== false) {
              const navTo = window.krypta.joinPath(currentDir, name)
              folderHoverTimer = setTimeout(() => { currentDir = navTo; dropTargetFolder = null }, settings?.springLoadDelay ?? 800)
            }
          }
        } else {
          clearTimeout(folderHoverTimer)
          dropTargetFolder = null
          const rect = row.getBoundingClientRect()
          const idx = parseInt(row.dataset.entryIndex ?? '0')
          dropInsertIndex = e.clientY < rect.top + rect.height / 2 ? idx : idx + 1
          dropOverList = true
        }
      } else {
        clearTimeout(folderHoverTimer)
        dropTargetFolder = null
        dropOverList = true
        dropInsertIndex = displayFiles.length
      }
    }}
    onpointerup={(e) => {
      if (!pointerDrag) return
      if (dropTargetFolder) {
        const targetDir = window.krypta.joinPath(currentDir, dropTargetFolder)
        if (targetDir !== pointerDrag.sourceDir) onFileDrop?.(targetDir, e.ctrlKey)
      } else if (dropOverList && currentDir !== pointerDrag.sourceDir) {
        onFileDrop?.(currentDir, e.ctrlKey)
      }
      dropTargetFolder = null
      dropOverList = false
      dropInsertIndex = null
      clearTimeout(folderHoverTimer)
    }}
    onpointerleave={() => {
      if (!pointerDrag) return
      dropOverList = false
      dropTargetFolder = null
      dropInsertIndex = null
      clearTimeout(folderHoverTimer)
    }}
  >
    {#if loadError}
      <div class="list-notice error">{loadError}</div>
    {:else if smartBarCairnsMode && displayFiles.length === 0}
      <div class="list-notice">no cairns — press b on a folder</div>
    {:else if smartBarSearchMode && smartBarQuery.length > 1 && displayFiles.length === 0}
      <div class="list-notice">no results</div>
    {:else if files.length === 0 && creatingType === null && !smartBarSearchMode}
      <div class="list-notice">empty folder</div>
    {/if}

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
        {#if showSizeCol}<span class="col-size"></span>{/if}
        {#if showDateCol}<span class="col-date"></span>{/if}
      </div>
    {/if}
    {#each displayFiles as entry, i}
      {#if dropInsertIndex === i && dropOverList && !dropTargetFolder}
        <div class="drop-line"></div>
      {/if}
      <div
        class="file-row"
        class:cursor={i === selectedIndex}
        class:keyboard-active={i === selectedIndex && keyboardActive}
        class:in-selection={selectedNames.has(entry.name)}
        class:scrying={showScry && scryEntry?.name === entry.name}
        onmouseenter={() => { hoveredIndex = i }}
        class:pending-delete={pendingDeleteNames.has(entry.name)}
        class:cut={clipboard?.type === 'cut' && clipboard?.dir === currentDir && clipboard?.names?.has(entry.name)}
        class:carrying={moveMode?.dir === currentDir && moveMode?.names?.has(entry.name)}
        class:dragging={draggingNames.has(entry.name)}
        class:drop-target={dropTargetFolder === entry.name && entry.isDirectory}
        title={entry._searchPath ?? null}
        data-entry-name={entry.name}
        data-entry-is-dir={entry.isDirectory}
        data-entry-index={i}
        onpointerdown={(e) => handleRowPointerDown(e, entry)}
        oncontextmenu={(e) => openContextMenu(e, entry)}
        onclick={(e) => {
          pendingDeleteNames = new Set()
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && entry.isDirectory) {
            onOpenInNewPane?.(window.krypta.joinPath(currentDir, entry.name))
          } else if (e.ctrlKey || e.metaKey) {
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
          <span class="icon-wrap">
            {#if entry.isDirectory}
              <Folder size={14} color="var(--pink)" strokeWidth={1.5} />
            {:else}
              {@const FileIcon = getFileIcon(entry.name)}
              <FileIcon size={14} color="var(--text-dim)" strokeWidth={1.5} />
            {/if}
            {#if entry.isDirectory && badges[entry.name]?.length}
              {#each badges[entry.name] as badge}
                {@const LABELS = { git: 'G', obsidian: 'O', onedrive: 'O', dropbox: 'D' }}
                <span class="badge badge-{badge}" title={badge}>{LABELS[badge] ?? badge[0].toUpperCase()}</span>
              {/each}
            {/if}
          </span>
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
            {#if smartBarSearchMode}
              {@const segs = highlightSegments(entry.name, entry.matches)}
              {#if segs}{#each segs as seg}{#if seg.hi}<mark class="name-match">{seg.text}</mark>{:else}{seg.text}{/if}{/each}{:else}{entry.name}{/if}
              {#if searchResultParent(entry)}<span class="name-path">{searchResultParent(entry)}</span>{/if}
            {:else}
              {entry.name}
            {/if}
          {/if}
        </span>
        {#if !smartBarSearchMode}
          {#if showSizeCol}
            {#if entry.isDirectory}
              <span
                class="col-size dir-size"
                title="Click to calculate total size"
                onclick={(e) => { e.stopPropagation(); loadDirSize(entry) }}
              >{getDirSize(entry)}</span>
            {:else}
              <span class="col-size">{formatSize(entry.size, false)}</span>
            {/if}
          {/if}
          {#if showDateCol}
            <span
              class="col-date"
              class:expanded={expandedDates.has(entry.name)}
              onclick={(e) => { e.stopPropagation(); toggleDate(entry.name) }}
            >{formatDate(entry.mtime, expandedDates.has(entry.name))}</span>
          {/if}
        {/if}
      </div>
    {/each}
    {#if dropInsertIndex === displayFiles.length && dropOverList && !dropTargetFolder}
      <div class="drop-line"></div>
    {/if}
  </div>

  {#if settings?.showCreateBtn !== false}
    <button
      class="create-btn"
      class:open={!!contextMenu?.fromCreate}
      onmousedown={(e) => { if (contextMenu?.fromCreate) e.stopPropagation() }}
      onclick={openCreateMenu}
      title={contextMenu?.fromCreate ? 'Close' : 'New file or folder'}
    >{contextMenu?.fromCreate ? '×' : '+'}</button>
  {/if}

  {#if showScry}
    <div class="scry-overlay" style={scryOverlayStyle} onclick={(e) => { if (e.target === e.currentTarget) closeScry() }}>
      <div class="scry-panel" class:above={!scryBelow} style={scryPanelStyle}>
        <div class="scry-dismiss">
          <button class="scry-close" onclick={(e) => { e.stopPropagation(); closeScry() }}>×</button>
        </div>
        {#if scryLoading || !scryData}
          <div class="scry-loading">scrying…</div>
        {:else}
          {#if scryData.isDirectory}
            <div class="scry-children" bind:this={scryChildrenEl}>
              {#if scryData.children.length === 0}
                <div class="scry-empty">empty folder</div>
              {:else}
                {#each scryData.children as child}
                  <div class="scry-child-row">
                    <span class="scry-child-icon">
                      {#if child.isDirectory}
                        <Folder size={12} color="var(--pink)" strokeWidth={1.5} />
                      {:else}
                        {@const FileIcon = getFileIcon(child.name)}
                        <FileIcon size={12} color="var(--text-dim)" strokeWidth={1.5} />
                      {/if}
                    </span>
                    <span class="scry-child-name">{child.name}</span>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
          <div class="scry-meta" class:standalone={!scryData.isDirectory}>
            <div class="scry-meta-row">
              <span class="scry-meta-key">path</span>
              <span class="scry-meta-val scry-path">{scryData.path}</span>
            </div>
            {#if scryData.isDirectory}
              <div class="scry-meta-row">
                <span class="scry-meta-key">items</span>
                <span class="scry-meta-val">{scryData.children.length} {scryData.children.length === 1 ? 'item' : 'items'}</span>
              </div>
            {:else}
              <div class="scry-meta-row">
                <span class="scry-meta-key">size</span>
                <span class="scry-meta-val">{formatSize(scryData.stat.size, false)}</span>
              </div>
              <div class="scry-meta-row">
                <span class="scry-meta-key">type</span>
                <span class="scry-meta-val">{fileExt(scryData.name)}</span>
              </div>
            {/if}
            <div class="scry-meta-row">
              <span class="scry-meta-key">modified</span>
              <span class="scry-meta-val">{formatDate(scryData.stat.mtime, true)}</span>
            </div>
            <div class="scry-meta-row">
              <span class="scry-meta-key">permissions</span>
              <span class="scry-meta-val">{formatMode(scryData.stat.mode)}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>
  {/if}

  {#if contextMenu}
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={contextMenu.items}
      anchorRight={contextMenu.anchorRight ?? false}
      onClose={() => contextMenu = null}
    />
  {/if}

  {#if driveMenu}
    <button class="drive-backdrop" aria-label="Close drive menu" onclick={() => driveMenu = false}></button>
    <div class="drive-menu" style="left: {driveMenuPos.x}px; top: {driveMenuPos.y}px;">
      {#each drives as d}
        <button class="drive-item" class:active={isUnder(currentDir, d)} onclick={() => selectDrive(d)}>{d}</button>
      {/each}
      {#if drives.length === 0}<div class="drive-empty">No drives found</div>{/if}
    </div>
  {/if}

  <div class="pane-footer">
    <div
      class="pane-handle"
      draggable="true"
      ondragstart={(e) => {
        e.stopPropagation()
        isDraggingThisPane = true
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData('application/krypta-pane', String(paneIndex))
      }}
      ondragend={() => { isDraggingThisPane = false }}
    >
      <GripVertical size={10} strokeWidth={2} />
    </div>
  </div>
</div>

<style>
  .pane {
    flex: 1;
    min-width: 0;
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
    height: 36px;
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
    gap: 0;
    overflow-x: auto;
    scrollbar-width: none;
    min-width: 0;
  }

  .breadcrumbs::-webkit-scrollbar { display: none; }

  .crumb {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 12px;
    cursor: pointer;
    padding: 2px 3px;
    border-radius: 3px;
    white-space: nowrap;
    transition: color 0.1s;
  }

  .crumb:hover { color: var(--text); }
  .crumb:last-child { color: var(--text); }
  .crumb.drop-target {
    color: var(--emerald);
    background: rgba(80, 200, 120, 0.12);
    border-radius: 3px;
  }

  .sep {
    color: var(--text-dim);
    font-size: 10px;
    opacity: 0.25;
    padding: 0 1px;
  }

  .drive-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: none;
    border: none;
    cursor: default;
  }
  .drive-menu {
    position: fixed;
    z-index: 41;
    min-width: 80px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 3px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .drive-item {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 3px;
    white-space: nowrap;
  }
  .drive-item:hover { background: var(--bg-hover); color: var(--pink); }
  .drive-item.active { color: var(--emerald); }
  .drive-empty {
    color: var(--text-dim);
    font-size: 11px;
    padding: 4px 8px;
    opacity: 0.6;
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


  .cols-hidden {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    color: var(--text-dim);
    opacity: 0.4;
    letter-spacing: 0.05em;
    cursor: default;
    user-select: none;
    transition: opacity 0.1s;
  }

  .cols-hidden:hover { opacity: 0.85; }

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
    padding: 0 0 2px;
  }

  .list-notice {
    padding: 24px 12px;
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.3;
    text-align: center;
    user-select: none;
  }

  .list-notice.error {
    color: var(--pink);
    opacity: 0.55;
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

  .pane.focused .file-row.cursor:hover,
  .pane.focused .file-row.cursor.keyboard-active {
    background: rgba(80, 200, 120, 0.1);
    box-shadow: inset 3px 0 0 var(--emerald);
  }

  .col-icon {
    display: flex;
    align-items: center;
  }

  .crumb.git-dir { color: #F05032; }

  .git-badge {
    font-size: 9px;
    color: #F05032;
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0 6px 0 3px;
    opacity: 0.8;
    user-select: none;
  }

  .icon-wrap {
    position: relative;
    display: flex;
    align-items: center;
  }

  .badge {
    position: absolute;
    font-size: 8px;
    font-weight: 900;
    line-height: 1;
    user-select: none;
  }

  .badge-git      { color: #F05032; bottom: -1px; right: -2px; }
  .badge-obsidian { color: #7C3AED; bottom: -1px; left:  -2px; }
  .badge-onedrive { color: #0078D4; top:    -5px; right: -2px; }
  .badge-dropbox  { color: #0061FF; top:    -5px; left:  -2px; }

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

  .name-path {
    font-size: 10.5px;
    color: var(--text-dim);
    opacity: 0.5;
    margin-left: 6px;
  }

  .search-count-bar {
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
  }

  .search-count-label {
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.4;
    user-select: none;
  }

  mark.name-match {
    background: none;
    color: var(--emerald);
    font-weight: 600;
  }


  .pane.resizing {
    cursor: col-resize;
  }

  .pane.resizing .file-list {
    pointer-events: none;
  }

  .pathbar-spacer {
    flex: 1 1 0;
    align-self: stretch;
    min-width: 8px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }

  .pane-actions {
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }

  .pane-actions-sep {
    width: 1px;
    height: 10px;
    background: rgba(255,255,255,0.12);
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s;
  }

  .pane-action-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, color 0.1s;
  }

  .pathbar:hover .pane-action-btn,
  .pathbar:hover .pane-actions-sep { opacity: 0.15; }

  .pane-action-btn:hover { opacity: 1 !important; color: var(--text); }
  .pane-action-btn.close:hover { color: var(--pink); }

  .pane.grace .pane-actions,
  .pane.grace .pane-collapse-btn { pointer-events: none; }

  .create-btn {
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

  .pane:hover .create-btn,
  .pane.focused .create-btn { opacity: 1; }
  .create-btn:hover { background: var(--bg-hover); color: var(--text); }
  .create-btn.open { opacity: 1; background: var(--bg-hover); color: var(--pink); border-color: rgba(212,96,110,0.3); }

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

  .pane-footer {
    height: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border-top: 1px solid var(--border);
  }

  .pane-handle {
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: grab;
    color: var(--text-dim);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .pane-handle:active { cursor: grabbing; }
  .pane:hover .pane-handle,
  .pane.focused .pane-handle { opacity: 0.2; }
  .pane-handle:hover { opacity: 0.55; }

  .pane-collapse-btn {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
    color: var(--text-dim);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.15s, color 0.1s;
  }
  .pane:hover .pane-collapse-btn,
  .pane.focused .pane-collapse-btn { opacity: 0.15; }
  .pathbar:hover .pane-collapse-btn { opacity: 0.35; }
  .pane-collapse-btn:hover { opacity: 1 !important; color: var(--text); }

  .pathbar.pane-drag-over {
    background: rgba(80, 200, 120, 0.08);
    border-bottom-color: rgba(80, 200, 120, 0.5);
  }

  .file-row.dragging { opacity: 0.35; }

  .file-row.drop-target {
    background: rgba(80, 200, 120, 0.1) !important;
    box-shadow: inset 2px 0 0 var(--emerald) !important;
  }

  .file-list.drop-over {
    outline: 1px solid rgba(80, 200, 120, 0.25);
    outline-offset: -2px;
  }

  .drop-line {
    height: 2px;
    background: var(--emerald);
    margin: 0 12px;
    border-radius: 1px;
    pointer-events: none;
    opacity: 0.7;
  }

  .scry-overlay {
    position: absolute;
    top: 62px;
    bottom: 20px;
    left: 0;
    right: 0;
    z-index: 10;
  }

  .scry-panel {
    position: absolute;
    left: 0;
    right: 0;
    background: var(--bg-raised);
    border-top: 1px solid rgba(212, 96, 110, 0.2);
    border-bottom: none;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .scry-panel.above {
    border-top: none;
    border-bottom: 1px solid rgba(212, 96, 110, 0.2);
  }

  .file-row.scrying {
    box-shadow: inset 2px 0 0 rgba(212, 96, 110, 0.6) !important;
  }

  .scry-dismiss {
    position: absolute;
    top: 4px;
    right: 6px;
    z-index: 1;
  }

  .scry-close {
    width: 18px;
    height: 18px;
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.35;
    transition: opacity 0.1s, color 0.1s;
    padding: 0;
  }
  .scry-close:hover { opacity: 1; color: var(--pink); }

  .scry-loading {
    padding: 20px 12px;
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.3;
    text-align: center;
  }

  .scry-children {
    flex: 1;
    overflow-y: auto;
    padding: 3px 0;
    min-height: 0;
  }

  .scry-empty {
    padding: 20px 12px;
    font-size: 11px;
    color: var(--text-dim);
    opacity: 0.3;
    text-align: center;
    user-select: none;
  }

  .scry-child-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 24px;
  }

  .scry-child-icon {
    display: flex;
    flex-shrink: 0;
  }

  .scry-child-name {
    font-size: 11px;
    color: var(--text-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scry-meta {
    flex-shrink: 0;
    padding: 9px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-top: 1px solid var(--border);
  }

  .scry-meta.standalone {
    flex: 1;
    border-top: none;
    overflow-y: auto;
  }

  .scry-meta-row {
    display: flex;
    gap: 10px;
    align-items: baseline;
  }

  .scry-meta-key {
    font-size: 9px;
    color: var(--text-dim);
    opacity: 0.45;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    flex-shrink: 0;
    width: 70px;
  }

  .scry-meta-val {
    font-size: 11px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .scry-path {
    font-size: 10px;
    color: var(--text-dim);
    white-space: normal;
    word-break: break-all;
    line-height: 1.5;
  }
</style>
