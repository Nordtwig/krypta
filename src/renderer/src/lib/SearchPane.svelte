<script>
  import { Folder, GripVertical, X, ChevronLeft, Search } from 'lucide-svelte'
  import { getFileIcon } from './fileIcons.js'
  import { buildIndex, query as runQuery, highlightSegments, isKnownTag, suggestTag } from './search.js'

  let {
    focused = false,
    onFocus,
    onAddPane,
    onClose,
    onCollapse,
    grace = false,
    paneIndex = 0,
    onPaneDrop,
    flexValue = 1,
    currentDir = window.krypta.homeDir,
    onNavigate,
    onOpenInNewPane,
    onConvertToPane,
  } = $props()

  let searchInput = $state('')
  let chips = $state([])
  let results = $state([])
  let loading = $state(false)
  let indexReady = $state(false)
  let selectedIndex = $state(0)
  let inputEl = $state(null)
  let paneEl = $state(null)
  let resultsListEl = $state(null)
  let isDraggingThisPane = $state(false)
  let paneDragOver = $state(false)
  let searchIndex = null

  let showScry = $state(false)
  let scryChildrenEl = $state(null)
  let scryEntry = $state(null)
  let scryData = $state(null)
  let scryLoading = $state(false)
  let scryAnchorY = $state(null)
  let scryBelow = $state(true)

  let scryPanelStyle = $derived.by(() => {
    if (scryAnchorY === null) return 'bottom: 0; max-height: 70%'
    const rowTop = Math.max(0, scryAnchorY - 62)
    const rowBottom = rowTop + 32
    return scryBelow
      ? `top: ${rowBottom}px; max-height: calc(100% - ${rowBottom + 4}px)`
      : `bottom: calc(100% - ${rowTop}px); max-height: calc(${rowTop - 4}px)`
  })

  let scryOverlayStyle = $derived.by(() => {
    const dark = 'rgba(4,10,15,0.72)'
    if (scryAnchorY === null) return `background: ${dark}`
    const rowTop = Math.max(0, scryAnchorY - 62)
    const rowBottom = rowTop + 32
    const stops = [
      rowTop > 0 ? `${dark} ${rowTop}px` : null,
      `transparent ${rowTop}px`,
      `transparent ${rowBottom}px`,
      `${dark} ${rowBottom}px`,
    ].filter(Boolean).join(', ')
    return `background: linear-gradient(${stops})`
  })

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

  function formatSize(bytes) {
    if (bytes == null) return '—'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 ** 2) return (bytes / 1024).toFixed(1) + ' KB'
    if (bytes < 1024 ** 3) return (bytes / 1024 ** 2).toFixed(1) + ' MB'
    return (bytes / 1024 ** 3).toFixed(2) + ' GB'
  }

  function formatDate(mtime) {
    if (!mtime) return '—'
    return new Date(mtime).toLocaleString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    })
  }

  function formatMode(mode) {
    if (mode == null) return '—'
    return (mode & 0o777).toString(8).padStart(3, '0')
  }

  function fileExt(name) {
    const dot = name.lastIndexOf('.')
    return dot > 0 ? name.slice(dot) : '—'
  }

  async function openScry(result, anchorY = null) {
    scryAnchorY = anchorY
    if (anchorY !== null && paneEl) {
      const overlayHeight = paneEl.getBoundingClientRect().height - 82
      scryBelow = (anchorY - 62) < overlayHeight / 2
    } else {
      scryBelow = true
    }
    scryEntry = { name: result.name, isDirectory: result.isDirectory, path: result.path }
    scryLoading = true
    showScry = true
    scryData = null
    try {
      const statResult = await window.krypta.statPath(result.path)
      const children = result.isDirectory ? await window.krypta.readDirNames(result.path) : null
      scryData = { path: result.path, name: result.name, isDirectory: result.isDirectory, stat: statResult, children }
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

  function triggerScry() {
    if (showScry) { closeScry(); return }
    const result = results[selectedIndex]
    if (!result) return
    const row = resultsListEl?.children[selectedIndex]
    const paneRect = paneEl?.getBoundingClientRect()
    const rowRect = row?.getBoundingClientRect()
    openScry(result, (rowRect && paneRect) ? rowRect.top - paneRect.top : null)
  }

  $effect(() => {
    loading = true
    buildIndex(window.krypta.homeDir).then(idx => {
      searchIndex = idx
      loading = false
      indexReady = true
    }).catch(err => {
      console.error('[SearchPane] index build failed:', err)
      loading = false
    })
  })

  $effect(() => {
    if (!indexReady) { results = []; return }
    if (!searchInput.trim() && chips.length === 0) { results = []; return }
    results = runQuery(searchIndex, searchInput, currentDir, chips)
    selectedIndex = 0
  })

  $effect(() => {
    if (inputEl) inputEl.focus()
  })

  // Ghost hint for partial #tag at end of input
  let tagSuggestion = $derived.by(() => {
    const m = searchInput.match(/#(\w+)$/)
    if (!m || !m[1]) return ''
    const s = suggestTag(m[1])
    return s ? s.slice(m[1].length) : ''
  })

  function parentDir(fullPath) {
    return window.krypta.parentDir(fullPath)
  }

  function relPath(fullPath) {
    const home = window.krypta.homeDir
    if (fullPath === home) return '~'
    return fullPath.startsWith(home + '/') ? '~' + fullPath.slice(home.length) : fullPath
  }

  function displayParent(fullPath) {
    return relPath(parentDir(fullPath))
  }

  function navigate(result, newPane = false, left = false) {
    const target = result.isDirectory ? result.path : parentDir(result.path)
    if (newPane) onOpenInNewPane?.(target, left)
    else onNavigate?.(target)
  }

  function commitTagSuggestion() {
    const m = searchInput.match(/#(\w+)$/)
    if (!m || !m[1]) return false
    const suggestion = suggestTag(m[1])
    if (!suggestion) return false
    if (!chips.includes(suggestion)) chips = [...chips, suggestion]
    searchInput = searchInput.slice(0, searchInput.length - m[0].length).trimEnd()
    return true
  }

  $effect(() => {
    if (!focused) return
    function handleKey(e) {
      if (e.target === inputEl) {
        if (e.key === 'ArrowDown') {
          e.preventDefault()
          selectedIndex = Math.min(selectedIndex + 1, results.length - 1)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          selectedIndex = Math.max(selectedIndex - 1, 0)
        } else if (e.key === 'Tab') {
          e.preventDefault()
          commitTagSuggestion()
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (results[selectedIndex]) navigate(results[selectedIndex], (e.ctrlKey || e.metaKey) && e.shiftKey, false)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          if (showScry) { closeScry(); return }
          inputEl.blur()
        } else if (e.key === 'I' && e.ctrlKey && e.shiftKey) {
          e.preventDefault()
          triggerScry()
        }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        inputEl?.focus()
        return
      }
      switch (e.key) {
        case 'ArrowDown': e.preventDefault(); selectedIndex = Math.min(selectedIndex + 1, results.length - 1); break
        case 'ArrowUp':  e.preventDefault(); selectedIndex = Math.max(selectedIndex - 1, 0); break
        case 'Enter':
        case 'ArrowRight':
          e.preventDefault()
          if (results[selectedIndex]) navigate(results[selectedIndex], (e.ctrlKey || e.metaKey) && e.shiftKey, false)
          break
        case 'ArrowLeft':
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && results[selectedIndex]) {
            e.preventDefault()
            navigate(results[selectedIndex], true, true)
          }
          break
        case 'i':
          if (!e.ctrlKey && !e.metaKey) { e.preventDefault(); triggerScry() }
          break
        case 'Escape':
          if (showScry) { e.preventDefault(); closeScry() }
          break
        case '/':
        case '?':
        case '@':
          e.preventDefault()
          onConvertToPane?.(e.key)
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div
  bind:this={paneEl}
  class="pane"
  class:focused
  class:grace
  style="flex: {flexValue}"
  onmouseenter={onFocus}
  ondragover={(e) => {
    if (!isDraggingThisPane && e.dataTransfer.types.includes('application/krypta-pane')) {
      e.preventDefault()
      paneDragOver = true
    }
  }}
  ondragleave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) paneDragOver = false }}
  ondrop={(e) => {
    if (!e.dataTransfer.types.includes('application/krypta-pane')) return
    e.preventDefault()
    paneDragOver = false
    const fromIndex = parseInt(e.dataTransfer.getData('application/krypta-pane'))
    if (!isNaN(fromIndex) && fromIndex !== paneIndex) onPaneDrop?.(fromIndex, paneIndex)
  }}
>
  <div class="pathbar" class:pane-drag-over={paneDragOver}>
    <button class="pane-collapse-btn" onclick={onCollapse} title="Collapse pane"><ChevronLeft size={10} strokeWidth={2.5} /></button>
    <span class="search-icon"><Search size={12} strokeWidth={2} /></span>
    {#each chips as chip}
      <span class="chip" class:unknown={!isKnownTag(chip)}>
        #{chip}<button
          class="chip-remove"
          onmousedown={(e) => { e.preventDefault(); chips = chips.filter(t => t !== chip) }}
        >×</button>
      </span>
    {/each}
    <div class="input-wrap">
      {#if tagSuggestion}
        <div class="ghost" aria-hidden="true">
          <span class="ghost-inner">
            <span class="ghost-spacer">{searchInput}</span><span class="ghost-hint">{tagSuggestion}</span>
          </span>
        </div>
      {/if}
      <input
        bind:this={inputEl}
        bind:value={searchInput}
        class="search-input"
        placeholder="Search…"
        spellcheck="false"
        autocomplete="off"
        oninput={(e) => {
          let val = e.currentTarget.value
          const extracted = []
          const cleaned = val.replace(/#(\w+)\s/g, (_, tag) => { extracted.push(tag); return '' })
          if (extracted.length) {
            chips = [...chips, ...extracted.filter(t => !chips.includes(t))]
            e.currentTarget.value = cleaned
            searchInput = cleaned
          }
        }}
        onkeydown={(e) => {
          if (e.key === 'Backspace' && searchInput === '' && chips.length > 0) {
            e.preventDefault()
            chips = chips.slice(0, -1)
          }
        }}
      />
    </div>
    <div class="pane-actions">
      <button class="pane-action-btn" onclick={onAddPane} title="New pane">+</button>
      <span class="pane-actions-sep"></span>
      <button class="pane-action-btn close" onclick={onClose} title="Close pane"><X size={10} strokeWidth={2.5} /></button>
    </div>
  </div>

  <div class="column-spacer">
    {#if loading}
      <span class="spacer-info">indexing…</span>
    {:else}
      <span class="spacer-info">{results.length} {results.length === 1 ? 'result' : 'results'}</span>
    {/if}
  </div>

  <div class="results-list" bind:this={resultsListEl}>
    {#if loading}
      <div class="list-notice">indexing…</div>
    {:else if !searchInput.trim() && chips.length === 0}
      <div class="list-notice">type to search home</div>
    {:else if results.length === 0}
      <div class="list-notice">no results</div>
    {:else}
      {#each results as result, i}
        {@const Icon = result.isDirectory ? Folder : getFileIcon(result.name)}
        <div
          class="result-row"
          class:cursor={i === selectedIndex}
          class:scrying={showScry && scryEntry?.path === result.path}
          title={result.path}
          onmouseenter={() => { selectedIndex = i }}
          onclick={(e) => navigate(result, (e.ctrlKey || e.metaKey) && e.shiftKey)}
        >
          <span class="result-icon">
            <Icon size={13} color={result.isDirectory ? 'var(--pink)' : 'var(--text-dim)'} strokeWidth={1.5} />
          </span>
          <span class="result-name">
            {#each highlightSegments(result.name, result.matches) ?? [{ text: result.name, hi: false }] as seg}{#if seg.hi}<mark class="match">{seg.text}</mark>{:else}{seg.text}{/if}{/each}
            {#if displayParent(result.path)}<span class="result-path-suffix">{displayParent(result.path)}</span>{/if}
          </span>
        </div>
      {/each}
    {/if}
  </div>

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
                <span class="scry-meta-val">{formatSize(scryData.stat.size)}</span>
              </div>
              <div class="scry-meta-row">
                <span class="scry-meta-key">type</span>
                <span class="scry-meta-val">{fileExt(scryData.name)}</span>
              </div>
            {/if}
            <div class="scry-meta-row">
              <span class="scry-meta-key">modified</span>
              <span class="scry-meta-val">{formatDate(scryData.stat.mtime)}</span>
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
  .pane:last-child { border-right: none; }

  .pathbar {
    height: 36px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    gap: 6px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .pane.focused .pathbar { border-bottom-color: rgba(212, 96, 110, 0.5); }
  .pathbar.pane-drag-over {
    background: rgba(80, 200, 120, 0.08);
    border-bottom-color: rgba(80, 200, 120, 0.5);
  }

  .search-icon {
    display: flex;
    align-items: center;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    padding: 2px 4px 2px 5px;
    border-radius: 3px;
    font-size: 10px;
    line-height: 1;
    flex-shrink: 0;
    background: var(--emerald);
    color: var(--bg);
    user-select: none;
    white-space: nowrap;
  }
  .chip.unknown { background: var(--pink); }
  .chip-remove {
    background: none;
    border: none;
    padding: 0 0 0 2px;
    color: inherit;
    font-size: 12px;
    line-height: 1;
    cursor: pointer;
    opacity: 0.65;
    display: flex;
    align-items: center;
  }
  .chip-remove:hover { opacity: 1; }

  .input-wrap {
    flex: 1;
    min-width: 40px;
    position: relative;
    overflow: hidden;
  }

  .ghost {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    pointer-events: none;
    overflow: hidden;
  }

  .ghost-inner {
    display: inline-block;
    white-space: pre;
    font-size: 12px;
    font-family: inherit;
  }

  .ghost-spacer { visibility: hidden; }

  .ghost-hint {
    color: var(--text-dim);
    opacity: 0.45;
  }

  .search-input {
    position: relative;
    width: 100%;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    padding: 0;
    caret-color: var(--emerald);
    z-index: 1;
  }
  .search-input::placeholder { color: var(--text-dim); opacity: 0.5; }

  .pane-actions {
    margin-left: auto;
    flex-shrink: 0;
    display: flex;
    align-items: center;
  }
  .pane-actions-sep {
    width: 1px; height: 10px;
    background: rgba(255,255,255,0.12);
    flex-shrink: 0; opacity: 0;
    transition: opacity 0.15s;
  }
  .pane-action-btn {
    flex-shrink: 0; width: 18px; height: 18px;
    border: none; background: none; color: var(--text-dim);
    font-size: 14px; line-height: 1; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s, color 0.1s;
  }
  .pathbar:hover .pane-action-btn,
  .pathbar:hover .pane-actions-sep { opacity: 0.15; }
  .pane-action-btn:hover { opacity: 1 !important; color: var(--text); }
  .pane-action-btn.close:hover { color: var(--pink); }

  .pane.grace .pane-actions,
  .pane.grace .pane-collapse-btn { pointer-events: none; }

  .pane-collapse-btn {
    flex-shrink: 0; width: 18px; height: 18px;
    border: none; background: none; padding: 0;
    cursor: pointer; color: var(--text-dim);
    display: flex; align-items: center; justify-content: center;
    opacity: 0; transition: opacity 0.15s, color 0.1s;
  }
  .pane:hover .pane-collapse-btn,
  .pane.focused .pane-collapse-btn { opacity: 0.15; }
  .pathbar:hover .pane-collapse-btn { opacity: 0.35; }
  .pane-collapse-btn:hover { opacity: 1 !important; color: var(--text); }

  .column-spacer {
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
  }

  .spacer-info {
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.4;
    user-select: none;
  }

  .results-list {
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

  .result-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 32px;
    cursor: pointer;
    box-shadow: inset 2px 0 0 transparent;
    transition: background 0.1s, box-shadow 0.1s;
  }
  .result-row:hover { background: rgba(212, 96, 110, 0.07); }
  .result-row.cursor {
    background: rgba(80, 200, 120, 0.05);
    box-shadow: inset 2px 0 0 rgba(80, 200, 120, 0.45);
  }
  .pane.focused .result-row.cursor {
    background: rgba(80, 200, 120, 0.1);
    box-shadow: inset 3px 0 0 var(--emerald);
  }

  .result-icon { display: flex; flex-shrink: 0; }

  .result-name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  mark.match {
    background: none;
    color: var(--emerald);
    font-weight: 600;
  }

  .result-path-suffix {
    font-size: 10.5px;
    color: var(--text-dim);
    opacity: 0.5;
    margin-left: 6px;
  }

  .pane-footer {
    height: 20px; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    border-top: 1px solid var(--border);
  }
  .pane-handle {
    display: flex; align-items: center; justify-content: center;
    cursor: grab; color: var(--text-dim);
    opacity: 0; transition: opacity 0.15s;
  }
  .pane-handle:active { cursor: grabbing; }
  .pane:hover .pane-handle,
  .pane.focused .pane-handle { opacity: 0.2; }
  .pane-handle:hover { opacity: 0.55; }

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

  .result-row.scrying {
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

  .scry-child-icon { display: flex; flex-shrink: 0; }

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

  .scry-meta-row { display: flex; gap: 10px; align-items: baseline; }

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
