<script>
  import { Folder, GripVertical, X, ChevronLeft } from 'lucide-svelte'
  import ContextMenu from './ContextMenu.svelte'

  let {
    focused = false,
    onFocus,
    onAddPane,
    onClose,
    onCollapse,
    grace = false,
    cairns = [],
    onRemoveCairn,
    onNavigate,
    onOpenInNewPane,
    paneIndex = 0,
    onPaneDrop,
    flexValue = 1,
  } = $props()

  let selectedIndex = $state(0)
  let contextMenu = $state(null)
  let paneEl = $state(null)
  let isDraggingThisPane = $state(false)
  let paneDragOver = $state(false)

  $effect(() => {
    if (selectedIndex >= cairns.length) selectedIndex = Math.max(0, cairns.length - 1)
  })

  function entryName(path) {
    return path.split('/').filter(Boolean).at(-1) ?? path
  }

  function entryParent(path) {
    const parts = path.split('/').filter(Boolean)
    return parts.length <= 1 ? '/' : '/' + parts.slice(0, -1).join('/')
  }

  $effect(() => {
    if (!focused) return
    function handleKey(e) {
      if (contextMenu) return
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          selectedIndex = Math.min(selectedIndex + 1, cairns.length - 1)
          break
        case 'ArrowUp':
          e.preventDefault()
          selectedIndex = Math.max(selectedIndex - 1, 0)
          break
        case 'Enter':
        case 'ArrowRight':
          e.preventDefault()
          if (cairns[selectedIndex]) {
            if ((e.ctrlKey || e.metaKey) && e.shiftKey) onOpenInNewPane?.(cairns[selectedIndex])
            else if (!e.shiftKey) onNavigate?.(cairns[selectedIndex])
          }
          break
        case 'ArrowLeft':
          if ((e.ctrlKey || e.metaKey) && e.shiftKey && cairns[selectedIndex]) {
            e.preventDefault()
            onOpenInNewPane?.(cairns[selectedIndex], true)
          }
          break
        case 'b':
          if (e.ctrlKey || e.metaKey) break
          e.preventDefault()
          if (cairns[selectedIndex]) onRemoveCairn?.(cairns[selectedIndex])
          break
        case 'Escape':
          selectedIndex = -1
          break
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })

  function openContextMenu(e, path) {
    e.preventDefault()
    e.stopPropagation()
    contextMenu = {
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: 'Navigate', shortcut: 'Enter', action: () => onNavigate?.(path) },
        { label: 'Open in New Pane', shortcut: 'Ctrl+Shift+Click', action: () => onOpenInNewPane?.(path) },
        { separator: true },
        { label: 'Remove from Cairns', shortcut: 'b', action: () => onRemoveCairn?.(path) },
      ]
    }
  }
</script>

<div
  class="pane"
  class:focused
  class:grace
  bind:this={paneEl}
  onmouseenter={onFocus}
  style="flex: {flexValue}"
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
  <div class="pathbar" class:pane-drag-over={paneDragOver}>
    <button class="pane-collapse-btn" onclick={onCollapse} title="Collapse pane"><ChevronLeft size={10} strokeWidth={2.5} /></button>
    <span class="cairns-label">Cairns</span>
    <div class="pane-actions">
      <button class="pane-action-btn" onclick={onAddPane} title="New pane">+</button>
      <span class="pane-actions-sep"></span>
      <button class="pane-action-btn close" onclick={onClose} title="Close pane"><X size={10} strokeWidth={2.5} /></button>
    </div>
  </div>

  <div class="column-spacer"></div>

  <div class="cairns-list">
    {#if cairns.length === 0}
      <div class="list-notice">no cairns yet — press b on a folder</div>
    {/if}
    {#each cairns as path, i}
      <div
        class="cairn-row"
        class:cursor={i === selectedIndex}
        onclick={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
            onOpenInNewPane?.(path)
          } else {
            selectedIndex = i
            onNavigate?.(path)
          }
        }}
        onmouseenter={() => { selectedIndex = i }}
        oncontextmenu={(e) => openContextMenu(e, path)}
      >
        <span class="cairn-icon"><Folder size={14} color="var(--pink)" strokeWidth={1.5} /></span>
        <span class="cairn-name" title={path}>{entryName(path)}</span>
      </div>
    {/each}
  </div>

  {#if contextMenu}
    <ContextMenu
      x={contextMenu.x}
      y={contextMenu.y}
      items={contextMenu.items}
      onClose={() => contextMenu = null}
    />
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

  .pane.focused .pathbar {
    border-bottom-color: rgba(212, 96, 110, 0.5);
  }

  .pathbar.pane-drag-over {
    background: rgba(80, 200, 120, 0.08);
    border-bottom-color: rgba(80, 200, 120, 0.5);
  }

  .cairns-label {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--text);
    opacity: 0.7;
    user-select: none;
    letter-spacing: 0.04em;
  }

  .pane-actions {
    margin-left: auto;
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

  .column-spacer {
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  .cairns-list {
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

  .cairn-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 12px;
    height: 28px;
    cursor: pointer;
    position: relative;
    box-shadow: inset 2px 0 0 transparent;
    transition: background 0.1s, box-shadow 0.1s;
  }

  .cairn-row:hover { background: rgba(212, 96, 110, 0.07); }

  .cairn-row.cursor {
    background: rgba(80, 200, 120, 0.05);
    box-shadow: inset 2px 0 0 rgba(80, 200, 120, 0.45);
  }

  .pane.focused .cairn-row.cursor {
    background: rgba(80, 200, 120, 0.1);
    box-shadow: inset 3px 0 0 var(--emerald);
  }

  .cairn-icon { display: flex; flex-shrink: 0; }


  .cairn-name {
    font-size: 13px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
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
</style>
