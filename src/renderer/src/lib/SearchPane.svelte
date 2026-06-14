<script>
  import { Folder, GripVertical, X, ChevronLeft, Search } from 'lucide-svelte'
  import { getFileIcon } from './fileIcons.js'
  import { buildIndex, query as runQuery, shortenPath, highlightSegments } from './search.js'

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
  let results = $state([])
  let loading = $state(false)
  let indexReady = $state(false)
  let selectedIndex = $state(0)
  let inputEl = $state(null)
  let isDraggingThisPane = $state(false)
  let paneDragOver = $state(false)
  let searchIndex = null

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
    if (!indexReady || !searchInput.trim()) { results = []; return }
    results = runQuery(searchIndex, searchInput, currentDir)
    selectedIndex = 0
  })

  $effect(() => {
    if (inputEl) inputEl.focus()
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
        } else if (e.key === 'Enter') {
          e.preventDefault()
          if (results[selectedIndex]) navigate(results[selectedIndex], (e.ctrlKey || e.metaKey) && e.shiftKey, false)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          inputEl.blur()
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
    <input
      bind:this={inputEl}
      bind:value={searchInput}
      class="search-input"
      placeholder="Search…"
      spellcheck="false"
      autocomplete="off"
    />
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

  <div class="results-list">
    {#if loading}
      <div class="list-notice">indexing…</div>
    {:else if !searchInput.trim()}
      <div class="list-notice">type to search home</div>
    {:else if results.length === 0}
      <div class="list-notice">no results</div>
    {:else}
      {#each results as result, i}
        {@const Icon = result.isDirectory ? Folder : getFileIcon(result.name)}
        <div
          class="result-row"
          class:cursor={i === selectedIndex}
          title={result.path}
          onmouseenter={() => { selectedIndex = i }}
          onclick={(e) => navigate(result, (e.ctrlKey || e.metaKey) && e.shiftKey)}
        >
          <span class="result-icon">
            <Icon size={13} color={result.isDirectory ? 'var(--pink)' : 'var(--text-dim)'} strokeWidth={1.5} />
          </span>
          <span class="result-name">
            {#each highlightSegments(result.name, result.matches) ?? [{ text: result.name, hi: false }] as seg}{#if seg.hi}<mark class="match">{seg.text}</mark>{:else}{seg.text}{/if}{/each}
            {#if displayParent(result.path)}<span class="result-path-suffix">{shortenPath(displayParent(result.path))}</span>{/if}
          </span>
        </div>
      {/each}
    {/if}
  </div>

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

  .search-input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    padding: 0;
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
  .result-path-suffix {
    font-size: 10.5px;
    color: var(--text-dim);
    opacity: 0.5;
    margin-left: 6px;
  }

  mark.match {
    background: none;
    color: var(--emerald);
    font-weight: 600;
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
</style>
