<script>
  import { onMount } from 'svelte'
  import { Folder, File, Star, SlidersHorizontal, ChevronRight, GripVertical } from 'lucide-svelte'
  import Titlebar from './lib/Titlebar.svelte'
  import Pane from './lib/Pane.svelte'
  import SettingsPane from './lib/SettingsPane.svelte'
  import CairnsPane from './lib/CairnsPane.svelte'
  import SearchPane from './lib/SearchPane.svelte'
  import KryptaLogo from './lib/KryptaLogo.svelte'
  import { getFileIcon } from './lib/fileIcons.js'
  import { isUnder } from './lib/paths.js'

  const COMFORTABLE = 300
  const DEFAULT_WIDTH = 450
  const STRIP_WIDTH = 32

  let focusedPane = $state(0)
  let panes = $state([])
  let closedPaneHistory = []
  let restoringPane = false
  let paneFlexValues = $state([])
  let mainEl = $state(null)
  let resizingPanes = $state(false)
  let settings = $state({ useKryptaTrash: true, customCommands: [] })
  let mouseHasMoved = true
  let sessionLoaded = $state(false)
  let saveTimer = null
  let stripDragOver = $state(null)
  let gracePanes = $state(new Set())

  function setGrace(index) {
    gracePanes = new Set([...gracePanes, index])
    setTimeout(() => { gracePanes = new Set([...gracePanes].filter(i => i !== index)) }, 500)
  }

  onMount(async () => {
    const [loadedSettings, session] = await Promise.all([
      window.krypta.loadSettings(),
      window.krypta.loadSession()
    ])
    settings = loadedSettings

    if (loadedSettings.restoreSession !== false && session?.panes?.length) {
      const restored = await Promise.all(session.panes.map(async (p) => {
        const collapseState = p.collapsed ? { collapsed: true, collapsedFlex: p.collapsedFlex, collapsedWidth: p.collapsedWidth } : {}
        if (p.type === 'settings') return { type: 'settings', ...collapseState }
        if (p.type === 'cairns') return { type: 'cairns', ...collapseState }
        if (p.type === 'search') return { type: 'search', ...collapseState }
        let dir = p.dir ?? window.krypta.homeDir
        try { await window.krypta.statPath(dir) } catch { dir = window.krypta.homeDir }
        return { dir, refreshKey: 0, flashKey: 0, ...collapseState }
      }))
      panes = restored
      paneFlexValues = session.flexValues?.length === restored.length
        ? session.flexValues
        : restored.map(() => 1)
      focusedPane = Math.min(session.focusedPane ?? 0, restored.length - 1)
    } else {
      panes = [loadedSettings.startScreen === 'cairns'
        ? { type: 'cairns' }
        : loadedSettings.startScreen === 'search'
        ? { type: 'search' }
        : { dir: window.krypta.homeDir, refreshKey: 0, flashKey: 0 }]
      paneFlexValues = [1]
    }
    sessionLoaded = true
  })

  $effect(() => {
    if (!sessionLoaded) return
    clearTimeout(saveTimer)
    if (settings?.restoreSession === false) return
    const snapshot = panes.map(p => {
      const base = p.type === 'settings' ? { type: 'settings' } : p.type === 'cairns' ? { type: 'cairns' } : p.type === 'search' ? { type: 'search' } : { dir: p.dir }
      return p.collapsed ? { ...base, collapsed: true, collapsedFlex: p.collapsedFlex, collapsedWidth: p.collapsedWidth } : base
    })
    const flexValues = [...paneFlexValues]
    const focused = focusedPane
    saveTimer = setTimeout(() => {
      window.krypta.saveSession({ panes: snapshot, flexValues, focusedPane: focused })
    }, 1000)
  })

  function persistSettings(s) {
    window.krypta.saveSettings(JSON.parse(JSON.stringify(s)))
  }

  function handleSettingsChange(newSettings) {
    settings = newSettings
    persistSettings(newSettings)
  }

  function insertPane(afterIndex, paneObj) {
    const splitFlex = (paneFlexValues[afterIndex] ?? 1) / 2
    const newFlex = [...paneFlexValues]
    newFlex[afterIndex] = splitFlex
    paneFlexValues = [...newFlex.slice(0, afterIndex + 1), splitFlex, ...newFlex.slice(afterIndex + 1)]
    panes = [...panes.slice(0, afterIndex + 1), paneObj, ...panes.slice(afterIndex + 1)]
    focusedPane = afterIndex + 1
  }

  function openSpecial(type) {
    const existing = panes.findIndex(p => p.type === type)
    if (existing >= 0) { focusedPane = existing; return }
    if (settings.openInNewPane === false) {
      panes[focusedPane] = { type, _prev: JSON.parse(JSON.stringify(panes[focusedPane])) }
    } else {
      addPaneObject(focusedPane, { type })
    }
  }

  function openSettings() { openSpecial('settings') }
  function openCairns()   { openSpecial('cairns') }
  function openSearch()   { openSpecial('search') }

  function handleToggleCairn(dir) {
    const cairns = settings?.cairns ?? []
    const newCairns = cairns.includes(dir) ? cairns.filter(c => c !== dir) : [...cairns, dir]
    const newSettings = { ...settings, cairns: newCairns }
    settings = newSettings
    persistSettings(newSettings)
  }

  function handleRemoveCairn(dir) {
    const newSettings = { ...settings, cairns: (settings?.cairns ?? []).filter(c => c !== dir) }
    settings = newSettings
    persistSettings(newSettings)
  }

  async function collapsePane(index) {
    if (panes.filter(p => !p.collapsed).length <= 1) return
    const b = await window.krypta.window.getBounds()
    if (!b) return
    const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
    const currentFlex = paneFlexValues[index]
    const panePixelWidth = Math.round(currentFlex / totalFlex * b.width)
    const stripFlex = STRIP_WIDTH / b.width * totalFlex
    panes = panes.map((p, i) => i === index ? { ...p, collapsed: true, collapsedFlex: currentFlex, collapsedWidth: panePixelWidth } : p)
    paneFlexValues = paneFlexValues.map((v, i) => i === index ? stripFlex : v)
    if (focusedPane === index) {
      const next = panes.findIndex((p, i) => i !== index && !p.collapsed)
      if (next >= 0) focusedPane = next
    }
    if (settings?.autoExpandPanes !== false) {
      const targetWidth = Math.max(DEFAULT_WIDTH, b.width - panePixelWidth + STRIP_WIDTH)
      if (b.width > targetWidth) await window.krypta.window.setBounds({ x: b.x, y: b.y, width: targetWidth, height: b.height })
    }
  }

  async function expandPane(index) {
    const pane = panes[index]
    if (!pane?.collapsed) return
    const b = await window.krypta.window.getBounds()
    if (!b) return
    const collapsedFlex = pane.collapsedFlex ?? 1
    const collapsedWidth = pane.collapsedWidth ?? COMFORTABLE

    panes = panes.map((p, i) => i === index ? { ...p, collapsed: false, collapsedFlex: undefined, collapsedWidth: undefined } : p)
    focusedPane = index
    setGrace(index)

    const nonStripCount = panes.filter(p => !p.collapsed).length
    const stripCount = panes.filter(p => p.collapsed).length
    const widthNeeded = nonStripCount * COMFORTABLE + stripCount * STRIP_WIDTH
    const shouldGrow = settings?.autoExpandPanes !== false && b.width < widthNeeded

    if (shouldGrow) {
      const targetWidth = b.width - STRIP_WIDTH + collapsedWidth
      paneFlexValues = paneFlexValues.map((v, i) => i === index ? collapsedFlex : v)
      let newX = b.x
      const rightEdge = b.workAreaX + b.workAreaWidth
      if (newX + targetWidth > rightEdge) {
        newX = rightEdge - targetWidth
        if (newX < b.workAreaX) newX = b.workAreaX
      }
      await window.krypta.window.setBounds({ x: Math.round(newX), y: b.y, width: Math.round(targetWidth), height: b.height })
    } else {
      // Window already has room — redistribute flex proportionally within current bounds.
      // This also corrects skewed flex values that built up during drag-to-collapse.
      const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
      const stripFlexSum = panes.reduce((a, p, i) => (i !== index && p.collapsed) ? a + paneFlexValues[i] : a, 0)
      const otherFlexSum = paneFlexValues.reduce((a, v, i) => (i !== index && !panes[i].collapsed) ? a + v : a, 0)
      const expandedFlex = (collapsedWidth / b.width) * totalFlex
      const remainingFlex = totalFlex - expandedFlex - stripFlexSum
      paneFlexValues = paneFlexValues.map((v, i) => {
        if (i === index) return expandedFlex
        if (panes[i].collapsed) return v
        return otherFlexSum > 0 ? v / otherFlexSum * remainingFlex : remainingFlex / (nonStripCount - 1)
      })
    }
  }

  async function collapseAllExcept(keepIndex) {
    const toCollapse = panes.map((p, i) => i).filter(i => i !== keepIndex && !panes[i].collapsed)
    if (!toCollapse.length) return
    const b = await window.krypta.window.getBounds()
    if (!b) return
    const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
    const newPanes = [...panes]
    const newFlex = [...paneFlexValues]
    let targetWidth = b.width
    for (const i of toCollapse) {
      const currentFlex = paneFlexValues[i]
      const panePixelWidth = Math.round(currentFlex / totalFlex * b.width)
      newPanes[i] = { ...panes[i], collapsed: true, collapsedFlex: currentFlex, collapsedWidth: panePixelWidth }
      newFlex[i] = STRIP_WIDTH / b.width * totalFlex
      targetWidth = Math.max(DEFAULT_WIDTH, targetWidth - panePixelWidth + STRIP_WIDTH)
    }
    panes = newPanes
    paneFlexValues = newFlex
    if (settings?.autoExpandPanes !== false && targetWidth < b.width) {
      await window.krypta.window.setBounds({ x: b.x, y: b.y, width: targetWidth, height: b.height })
    }
  }

  async function expandAll() {
    const toExpand = panes.map((p, i) => i).filter(i => panes[i].collapsed)
    if (!toExpand.length) return
    const restoreData = toExpand.map(i => ({ index: i, collapsedFlex: panes[i].collapsedFlex ?? 1, collapsedWidth: panes[i].collapsedWidth ?? COMFORTABLE }))
    panes = panes.map((p, i) => toExpand.includes(i)
      ? { ...p, collapsed: false, collapsedFlex: undefined, collapsedWidth: undefined } : p)
    toExpand.forEach(i => setGrace(i))
    const nonStripCount = panes.filter(p => !p.collapsed).length
    const stripCount = panes.filter(p => p.collapsed).length
    const widthNeeded = nonStripCount * COMFORTABLE + stripCount * STRIP_WIDTH
    const b = await window.krypta.window.getBounds()
    const currentWidth = b?.width ?? mainEl.getBoundingClientRect().width
    if (b && settings?.autoExpandPanes !== false && currentWidth < widthNeeded) {
      restoreData.forEach(({ index, collapsedFlex }) => {
        paneFlexValues = paneFlexValues.map((v, i) => i === index ? collapsedFlex : v)
      })
      const targetWidth = widthNeeded
      let newX = b.x
      const rightEdge = b.workAreaX + b.workAreaWidth
      if (newX + targetWidth > rightEdge) { newX = rightEdge - targetWidth; if (newX < b.workAreaX) newX = b.workAreaX }
      await window.krypta.window.setBounds({ x: Math.round(newX), y: b.y, width: Math.round(targetWidth), height: b.height })
    } else {
      const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
      const desired = panes.map((p, i) => {
        const r = restoreData.find(r => r.index === i)
        if (r) return r.collapsedWidth
        if (p.collapsed) return STRIP_WIDTH
        return paneFlexValues[i] / totalFlex * currentWidth
      })
      const totalDesired = desired.reduce((a, v) => a + v, 0)
      paneFlexValues = desired.map(w => w / totalDesired * totalFlex)
    }
  }

  let clipboard = $state(null)   // { dir, names: Set<string>, type: 'cut'|'copy' }
  let moveMode = $state(null)    // { dir, names: Set<string> }
  let pointerDrag = $state(null)  // { sourceDir, names: Set<string>, singleIsDir: bool, x, y }
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

  async function addPaneObject(afterIndex, paneObj) {
    if (settings?.autoExpandPanes !== false) {
      const b = await window.krypta.window.getBounds()
      const wouldBeCramped = b && b.width < (panes.length + 1) * COMFORTABLE
      if (wouldBeCramped) {
        const newCount = panes.length + 1
        const allEqual = paneFlexValues.every(v => Math.abs(v - paneFlexValues[0]) < 0.01)
        const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
        let newWidth = allEqual ? newCount * COMFORTABLE : b.width + COMFORTABLE
        let newX = b.x
        const rightEdge = b.workAreaX + b.workAreaWidth
        if (newX + newWidth > rightEdge) {
          newX = rightEdge - newWidth
          if (newX < b.workAreaX) { newX = b.workAreaX; newWidth = rightEdge - b.workAreaX }
        }
        const newFlexVal = allEqual ? 1 : totalFlex * COMFORTABLE / b.width
        const newFlex = [...paneFlexValues.slice(0, afterIndex + 1), newFlexVal, ...paneFlexValues.slice(afterIndex + 1)]
        panes = [...panes.slice(0, afterIndex + 1), paneObj, ...panes.slice(afterIndex + 1)]
        paneFlexValues = allEqual ? Array(newCount).fill(1) : newFlex
        focusedPane = afterIndex + 1
        await window.krypta.window.setBounds({ x: Math.round(newX), y: b.y, width: Math.round(newWidth), height: b.height })
        return
      }
    }
    insertPane(afterIndex, paneObj)
  }

  async function addPane(afterIndex) {
    const srcPane = panes[afterIndex]
    const srcDir = srcPane?.type === 'settings' ? window.krypta.homeDir : (srcPane?.dir ?? window.krypta.homeDir)
    await addPaneObject(afterIndex, { dir: srcDir, refreshKey: 0, flashKey: 0 })
  }

  async function restorePane() {
    if (closedPaneHistory.length === 0) return
    const { dir, flex: savedFlex } = closedPaneHistory.pop()
    restoringPane = true
    try {
      const afterIndex = focusedPane
      const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)
      const scale = totalFlex / (totalFlex + savedFlex)
      const newFlexValues = paneFlexValues.map(v => v * scale)
      newFlexValues.splice(afterIndex + 1, 0, savedFlex)
      panes = [...panes.slice(0, afterIndex + 1), { dir, refreshKey: 0, flashKey: 0 }, ...panes.slice(afterIndex + 1)]
      paneFlexValues = newFlexValues
      focusedPane = afterIndex + 1
      if (settings?.autoExpandPanes !== false) {
        const b = await window.krypta.window.getBounds()
        if (b && b.width < panes.length * COMFORTABLE) {
          let newWidth = panes.length * COMFORTABLE
          const rightEdge = b.workAreaX + b.workAreaWidth
          if (b.x + newWidth > rightEdge) newWidth = rightEdge - b.x
          await window.krypta.window.setBounds({ x: b.x, y: b.y, width: Math.round(newWidth), height: b.height })
        }
      }
    } finally {
      restoringPane = false
    }
  }

  async function removePane(index) {
    const pane = panes[index]
    if (pane?._prev) { panes[index] = pane._prev; return }
    if (panes.length <= 1) { if (!restoringPane) window.krypta.window.close(); return }
    if (pane && pane.type !== 'settings' && pane.dir) closedPaneHistory.push({ dir: pane.dir, flex: paneFlexValues[index] })
    const wasAllEqual = paneFlexValues.every(v => Math.abs(v - paneFlexValues[0]) < 0.01)
    const removedFlex = paneFlexValues[index]
    const totalFlex = paneFlexValues.reduce((a, v) => a + v, 0)

    const newFlex = paneFlexValues.filter((_, i) => i !== index)
    const neighborIndex = index < newFlex.length ? index : index - 1
    newFlex[neighborIndex] = (newFlex[neighborIndex] ?? 0) + removedFlex

    panes = panes.filter((_, i) => i !== index)
    paneFlexValues = wasAllEqual ? Array(panes.length).fill(1) : newFlex
    focusedPane = Math.min(focusedPane, panes.length - 1)

    if (settings?.autoExpandPanes !== false) {
      const b = await window.krypta.window.getBounds()
      if (b) {
        const removedWidth = Math.round(removedFlex / totalFlex * b.width)
        const targetWidth = Math.max(DEFAULT_WIDTH, b.width - removedWidth)
        if (b.width > targetWidth) {
          await window.krypta.window.setBounds({ x: b.x, y: b.y, width: targetWidth, height: b.height })
        }
      }
    }
  }

  function startPaneResize(e, leftIndex, rightIndex) {
    e.preventDefault()

    const totalFlex = paneFlexValues.reduce((a, b) => a + b, 0)
    const containerWidth = mainEl.getBoundingClientRect().width
    const pixelPerFlex = containerWidth / totalFlex
    const COLLAPSE_PX = 100
    const EXPAND_PX = 110  // where the pane jumps to on expand — small gap prevents flicker
    const stripFlex = STRIP_WIDTH / pixelPerFlex
    const collapseFlex = COLLAPSE_PX / pixelPerFlex
    const STICKY_PX = 40
    const JUMP_PX = EXPAND_PX - STRIP_WIDTH

    const startLeft = paneFlexValues[leftIndex]
    const startRight = paneFlexValues[rightIndex]

    resizingPanes = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    let prevX = e.clientX
    let stickyAccum = 0
    let hasJumped = false

    function onMove(e) {
      const dx = e.clientX - prevX
      if (dx === 0) return
      prevX = e.clientX

      // Re-read strip status and flex values each frame so mid-drag state changes don't stale
      const leftIsStrip = !!panes[leftIndex]?.collapsed
      const rightIsStrip = !!panes[rightIndex]?.collapsed
      const curLeft = paneFlexValues[leftIndex]
      const curRight = paneFlexValues[rightIndex]
      const total = curLeft + curRight

      // Sticky dead zone: only when dragging toward a collapsed strip to expand it
      let deltaX = dx
      const towardLeft = leftIsStrip && dx > 0
      const towardRight = rightIsStrip && dx < 0
      if (towardLeft || towardRight) {
        stickyAccum += Math.abs(dx)
        if (stickyAccum < STICKY_PX) return
        const overshoot = stickyAccum - STICKY_PX
        stickyAccum = STICKY_PX  // cap so subsequent moves apply 1:1
        if (!hasJumped) {
          hasJumped = true
          deltaX = Math.sign(dx) * (overshoot + JUMP_PX)
        } else {
          deltaX = Math.sign(dx) * overshoot
        }
      } else {
        stickyAccum = 0
        hasJumped = false
      }

      let deltaFlex = deltaX / pixelPerFlex
      let newLeft = curLeft + deltaFlex
      let newRight = curRight - deltaFlex

      // Strips can't shrink below their width — clamp and balance
      if (leftIsStrip && newLeft < stripFlex) { newLeft = stripFlex; newRight = total - newLeft }
      if (rightIsStrip && newRight < stripFlex) { newRight = stripFlex; newLeft = total - newRight }

      // Expand strip when it grows past strip width
      if (leftIsStrip && newLeft > stripFlex) {
        panes = panes.map((p, i) => i === leftIndex && p.collapsed
          ? { ...p, collapsed: false, collapsedFlex: undefined, collapsedWidth: undefined } : p)
      } else if (rightIsStrip && newRight > stripFlex) {
        panes = panes.map((p, i) => i === rightIndex && p.collapsed
          ? { ...p, collapsed: false, collapsedFlex: undefined, collapsedWidth: undefined } : p)
      }

      // Collapse only when actively shrinking past threshold (deltaFlex sign = which side shrinks)
      if (!leftIsStrip && deltaFlex < 0 && newLeft < collapseFlex) {
        panes = panes.map((p, i) => i === leftIndex && !p.collapsed
          ? { ...p, collapsed: true, collapsedFlex: startLeft, collapsedWidth: Math.round(startLeft * pixelPerFlex) } : p)
        newLeft = stripFlex
        newRight = total - newLeft
      } else if (!rightIsStrip && deltaFlex > 0 && newRight < collapseFlex) {
        panes = panes.map((p, i) => i === rightIndex && !p.collapsed
          ? { ...p, collapsed: true, collapsedFlex: startRight, collapsedWidth: Math.round(startRight * pixelPerFlex) } : p)
        newRight = stripFlex
        newLeft = total - newRight
      }

      const next = [...paneFlexValues]
      next[leftIndex] = newLeft
      next[rightIndex] = newRight
      paneFlexValues = next
    }

    function onUp() {
      resizingPanes = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function handleCut(dir, names) { clipboard = { dir, names, type: 'cut' } }
  function handleCopy(dir, names) { clipboard = { dir, names, type: 'copy' } }

  function handleFileDragStart(sourceDir, names, singleIsDir, x, y) {
    pointerDrag = { sourceDir, names, singleIsDir, x, y }
    document.body.classList.add('krypta-dragging')
  }

  function handleFileDragEnd() {
    pointerDrag = null
    document.body.classList.remove('krypta-dragging')
  }

  async function handleFileDrop(targetDir, isCopy) {
    if (!pointerDrag) return
    const { sourceDir, names } = pointerDrag
    handleFileDragEnd()
    if (targetDir === sourceDir) return
    const nameArr = [...names]
    try {
      if (isCopy) {
        await Promise.all(nameArr.map(name =>
          window.krypta.copy(
            window.krypta.joinPath(sourceDir, name),
            window.krypta.joinPath(targetDir, name)
          )
        ))
        pushHistory({ type: 'copy', srcDir: sourceDir, destDir: targetDir, names: nameArr })
        handleChanged(targetDir)
      } else {
        await Promise.all(nameArr.map(name =>
          window.krypta.move(
            window.krypta.joinPath(sourceDir, name),
            window.krypta.joinPath(targetDir, name)
          )
        ))
        pushHistory({ type: 'move', srcDir: sourceDir, destDir: targetDir, names: nameArr })
        handleMoved(sourceDir, targetDir, nameArr)
      }
    } catch {}
  }

  function handlePaneDrop(fromIndex, toIndex) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= panes.length || toIndex >= panes.length) return
    const newPanes = [...panes]
    ;[newPanes[fromIndex], newPanes[toIndex]] = [newPanes[toIndex], newPanes[fromIndex]]
    panes = newPanes
    if (focusedPane === fromIndex) focusedPane = toIndex
    else if (focusedPane === toIndex) focusedPane = fromIndex
  }

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
        if (isUnder(panes[i].dir, oldBase)) {
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
    if (!pointerDrag) return
    function onMove(e) { if (pointerDrag) { pointerDrag.x = e.clientX; pointerDrag.y = e.clientY } }
    function onUp() { handleFileDragEnd() }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', onUp)
    }
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
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        restorePane()
      } else if (e.key === ',' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault()
        openSettings()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault()
        openCairns()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        openSearch()
      } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowLeft' && focusedPane > 0) {
        e.preventDefault()
        ;[panes[focusedPane - 1], panes[focusedPane]] = [panes[focusedPane], panes[focusedPane - 1]]
        focusedPane--
      } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && e.key === 'ArrowRight' && focusedPane < panes.length - 1) {
        e.preventDefault()
        ;[panes[focusedPane], panes[focusedPane + 1]] = [panes[focusedPane + 1], panes[focusedPane]]
        focusedPane++
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowLeft' && !e.shiftKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        e.stopImmediatePropagation()
        focusedPane = Math.max(0, focusedPane - 1)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'ArrowRight' && !e.shiftKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        e.stopImmediatePropagation()
        focusedPane = Math.min(panes.length - 1, focusedPane + 1)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        focusedPane = e.shiftKey
          ? (focusedPane - 1 + panes.length) % panes.length
          : (focusedPane + 1) % panes.length
      } else if (e.key === '[' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault()
        if (e.shiftKey) {
          panes.some(p => p.collapsed) ? expandAll() : collapseAllExcept(focusedPane)
        } else {
          panes[focusedPane]?.collapsed ? expandPane(focusedPane) : collapsePane(focusedPane)
        }
      } else if (e.key === 'Enter' && panes[focusedPane]?.collapsed) {
        e.preventDefault()
        expandPane(focusedPane)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div class="app">
  <Titlebar onOpenCairns={openCairns} onOpenSearch={openSearch} onOpenSettings={openSettings} />
  <main bind:this={mainEl}>

    {#if !sessionLoaded}
      <div class="loading-screen">
        <KryptaLogo size={36} color="var(--text-dim)" />
        <div class="loading-dots">
          <span class="dot"></span>
          <span class="dot"></span>
          <span class="dot"></span>
        </div>
      </div>
    {/if}

    {#each panes as pane, i (i)}
      {#if i > 0 && !(pane.collapsed && panes[i - 1].collapsed)}
        <div class="pane-resizer" onmousedown={(e) => startPaneResize(e, i - 1, i)}></div>
      {/if}
      {#if pane.collapsed}
        {@const label = pane.type === 'settings' ? 'Settings' : pane.type === 'cairns' ? 'Cairns' : pane.type === 'search' ? 'Search' : (pane.dir?.split(window.krypta.sep).at(-1) || pane.dir || '')}
        <div
          class="pane-strip"
          class:focused={focusedPane === i}
          class:pane-drag-over={stripDragOver === i}
          style="flex: {paneFlexValues[i]}"
          onclick={() => expandPane(i)}
          onmouseenter={() => { if (mouseHasMoved && !resizingPanes) focusedPane = i }}
          ondragover={(e) => {
            if (!e.dataTransfer.types.includes('application/krypta-pane')) return
            e.preventDefault()
            stripDragOver = i
          }}
          ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) stripDragOver = null }}
          ondrop={(e) => {
            e.preventDefault()
            stripDragOver = null
            const from = parseInt(e.dataTransfer.getData('application/krypta-pane'))
            if (!isNaN(from) && from !== i) handlePaneDrop(from, i)
          }}
        >
          <span class="strip-expand"><ChevronRight size={10} strokeWidth={2} /></span>
          <div class="strip-content">
            <span class="strip-icon">
              {#if pane.type === 'settings'}
                <SlidersHorizontal size={12} strokeWidth={1.5} />
              {:else if pane.type === 'cairns'}
                <Star size={12} strokeWidth={1.5} />
              {:else}
                <Folder size={12} strokeWidth={1.5} />
              {/if}
            </span>
            <span class="strip-label">{label}</span>
          </div>
          <div
            class="strip-grip"
            draggable="true"
            onclick={(e) => e.stopPropagation()}
            ondragstart={(e) => {
              e.stopPropagation()
              e.dataTransfer.effectAllowed = 'move'
              e.dataTransfer.setData('application/krypta-pane', String(i))
            }}
          >
            <GripVertical size={10} strokeWidth={2} />
          </div>
        </div>
      {:else if pane.type === 'cairns'}
        <CairnsPane
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved && !resizingPanes) focusedPane = i }}
          onAddPane={() => addPane(i)}
          onClose={() => removePane(i)}
          onCollapse={() => collapsePane(i)}
          grace={gracePanes.has(i)}
          cairns={settings?.cairns ?? []}
          onRemoveCairn={handleRemoveCairn}
          onNavigate={(dir) => { panes = panes.map((p, idx) => idx === i ? { dir, refreshKey: 0, flashKey: 0 } : p) }}
          onOpenInNewPane={(dir, before = false) => addPaneObject(before ? i - 1 : i, { dir, refreshKey: 0, flashKey: 0 })}
          onConvertToPane={(prefix) => { const dir = panes.find(p => p.dir)?.dir ?? window.krypta.homeDir; panes = panes.map((p, idx) => idx === i ? { dir, startQuery: prefix, refreshKey: 0, flashKey: 0 } : p) }}
          paneIndex={i}
          onPaneDrop={handlePaneDrop}
          flexValue={paneFlexValues[i]}
        />
      {:else if pane.type === 'search'}
        <SearchPane
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved && !resizingPanes) focusedPane = i }}
          onAddPane={() => addPane(i)}
          onClose={() => removePane(i)}
          onCollapse={() => collapsePane(i)}
          grace={gracePanes.has(i)}
          currentDir={panes.find(p => p.dir)?.dir ?? window.krypta.homeDir}
          onNavigate={(dir) => { panes = panes.map((p, idx) => idx === i ? { dir, refreshKey: 0, flashKey: 0 } : p) }}
          onOpenInNewPane={(dir, before = false) => addPaneObject(before ? i - 1 : i, { dir, refreshKey: 0, flashKey: 0 })}
          onConvertToPane={(prefix) => { const dir = panes.find(p => p.dir)?.dir ?? window.krypta.homeDir; panes = panes.map((p, idx) => idx === i ? { dir, startQuery: prefix, refreshKey: 0, flashKey: 0 } : p) }}
          paneIndex={i}
          onPaneDrop={handlePaneDrop}
          flexValue={paneFlexValues[i]}
        />
      {:else if pane.type === 'settings'}
        <SettingsPane
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved && !resizingPanes) focusedPane = i }}
          onAddPane={() => addPane(i)}
          onClose={() => removePane(i)}
          onCollapse={() => collapsePane(i)}
          grace={gracePanes.has(i)}
          {settings}
          onSettingsChange={handleSettingsChange}
          paneIndex={i}
          onPaneDrop={handlePaneDrop}
          flexValue={paneFlexValues[i]}
        />
      {:else}
        <Pane
          bind:currentDir={panes[i].dir}
          focused={focusedPane === i}
          onFocus={() => { if (mouseHasMoved && !resizingPanes) focusedPane = i }}
          onAddPane={() => addPane(i)}
          onClose={() => removePane(i)}
          onCollapse={() => collapsePane(i)}
          grace={gracePanes.has(i)}
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
          paneIndex={i}
          pointerDrag={pointerDrag}
          onFileDragStart={handleFileDragStart}
          onFileDragEnd={handleFileDragEnd}
          onFileDrop={handleFileDrop}
          onPaneDrop={handlePaneDrop}
          onError={showToast}
          onOpenInNewPane={(dir, before = false) => addPaneObject(before ? i - 1 : i, { dir, refreshKey: 0, flashKey: 0 })}
          cairns={settings?.cairns ?? []}
          onToggleCairn={handleToggleCairn}
          flexValue={paneFlexValues[i]}
          startQuery={pane.startQuery ?? null}
        />
      {/if}
    {/each}
  </main>

  {#if toast}
    {#key toast.id}
      <div class="toast">{toast.message}</div>
    {/key}
  {/if}

  {#if pointerDrag}
    {@const ghostName = pointerDrag.names.size === 1 ? [...pointerDrag.names][0] : null}
    {@const GhostIcon = ghostName ? (pointerDrag.singleIsDir ? Folder : getFileIcon(ghostName)) : File}
    <div class="drag-ghost" style="left:{pointerDrag.x + 14}px; top:{pointerDrag.y + 10}px">
      <GhostIcon size={13} color={pointerDrag.singleIsDir ? 'var(--pink)' : 'var(--text-dim)'} strokeWidth={1.5} />
      <span>{ghostName ?? `${pointerDrag.names.size} items`}</span>
    </div>
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

  .pane-resizer {
    width: 0;
    flex-shrink: 0;
    position: relative;
    cursor: col-resize;
    z-index: 10;
  }

  .pane-resizer::before {
    content: '';
    position: absolute;
    top: 0;
    left: -4px;
    width: 8px;
    height: 100%;
  }

  .pane-resizer::after {
    content: '';
    position: absolute;
    top: 0;
    left: -1px;
    width: 2px;
    height: 100%;
    background: transparent;
    transition: background 0.15s;
  }

  .pane-resizer:hover::after {
    background: rgba(255, 255, 255, 0.1);
  }

  .pane-strip {
    min-width: 32px;
    max-width: 32px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 6px 0;
    gap: 6px;
    border-right: 1px solid var(--border);
    cursor: pointer;
    overflow: hidden;
    user-select: none;
    transition: background 0.15s;
  }

  .pane-strip.focused { border-right-color: rgba(212, 96, 110, 0.4); }
  .pane-strip:hover,
  .pane-strip.focused { background: rgba(212, 96, 110, 0.03); }
  .pane-strip.pane-drag-over { background: rgba(80, 200, 120, 0.08); border-right-color: rgba(80, 200, 120, 0.5); }

  .strip-grip {
    display: flex;
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0;
    cursor: grab;
    transition: opacity 0.15s;
  }
  .pane-strip:hover .strip-grip,
  .pane-strip.focused .strip-grip { opacity: 0.25; }
  .strip-grip:hover { opacity: 0.6 !important; }

  .strip-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .strip-icon {
    display: flex;
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0.45;
    transition: opacity 0.15s, color 0.15s;
  }
  .pane-strip:hover .strip-icon { opacity: 1; color: var(--pink); }

  .strip-label {
    writing-mode: vertical-rl;
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.45;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-height: 0;
    transition: opacity 0.15s;
  }
  .pane-strip:hover .strip-label,
  .pane-strip.focused .strip-label { opacity: 1; }

  .strip-expand {
    display: flex;
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0.25;
    transition: opacity 0.15s, color 0.15s;
  }
  .pane-strip:hover .strip-expand { opacity: 1; color: var(--pink); }

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

  .loading-screen {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }

  .loading-dots {
    display: flex;
    gap: 5px;
  }

  .dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--pink);
    animation: dot-bounce 1.2s ease-in-out infinite;
    opacity: 0.3;
  }

  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }

  @keyframes dot-bounce {
    0%, 80%, 100% { transform: translateY(0); opacity: 0.3; }
    40% { transform: translateY(-5px); opacity: 0.8; }
  }

  .drag-ghost {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    background: var(--bg-raised);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    padding: 4px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text);
    white-space: nowrap;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }

  :global(body.krypta-dragging) {
    cursor: grabbing !important;
    user-select: none !important;
  }
</style>
