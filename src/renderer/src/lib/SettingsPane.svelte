<script>
  import { Trash2, Terminal, SlidersHorizontal, Keyboard, Plus, ChevronRight, ChevronLeft, GripVertical, RotateCcw, X } from 'lucide-svelte'

  const DEFAULTS = {
    useKryptaTrash:    true,
    springLoad:        true,
    springLoadDelay:   800,
    autoHideColumns:   true,
    showCreateBtn:     true,
    showHidden:        false,
    restoreSession:    true,
    startScreen:       'home',
    autoExpandPanes:   true,
    openInNewPane:     true,
    copyAllPaths:      false,
  }

  let { focused = false, onFocus, onAddPane, onClose, onCollapse, settings, onSettingsChange, paneIndex = 0, onPaneDrop, flexValue = 1, grace = false } = $props()
  let paneDragOver = $state(false)
  let isDraggingThisPane = $state(false)

  let section = $state('root')
  let selectedIndex = $state(0)
  let editingIndex = $state(null)
  let editLabel = $state('')
  let editCommand = $state('')
  let editField = $state('label')
  let labelInputEl = $state(null)
  let commandInputEl = $state(null)

  const rootSections = [
    { type: 'section', id: 'trash',    label: 'Trash',              icon: Trash2 },
    { type: 'section', id: 'commands', label: 'Custom Commands',    icon: Terminal },
    { type: 'section', id: 'hotkeys',  label: 'Keyboard Shortcuts', icon: Keyboard },
    { type: 'section', id: 'general',  label: 'General',            icon: SlidersHorizontal },
  ]

  const hotkeyGroups = [
    {
      label: 'Global',
      keys: [
        { key: 'Ctrl+T',           label: 'New pane' },
        { key: 'Ctrl+W',           label: 'Close pane' },
        { key: 'Ctrl+R',           label: 'Restore last closed pane' },
        { key: 'Tab / Shift+Tab',  label: 'Cycle panes' },
        { key: 'Ctrl+← / →',      label: 'Focus prev / next pane' },
        { key: 'Shift+← / →',     label: 'Move pane' },
        { key: '[',                label: 'Collapse / expand pane' },
        { key: 'Shift+[',          label: 'Collapse all / expand all' },
        { key: 'Ctrl+B',           label: 'Cairns' },
        { key: 'Ctrl+,',           label: 'Settings' },
        { key: 'Ctrl+Z',           label: 'Undo' },
        { key: 'Ctrl+Y',           label: 'Redo' },
      ]
    },
    {
      label: 'Pane',
      keys: [
        { key: '↑ / ↓',                       label: 'Move selection' },
        { key: '→ / Enter',                    label: 'Open / enter folder' },
        { key: '← / Backspace',                label: 'Go up' },
        { key: 'Ctrl+Shift+→ / Enter / Click', label: 'Open in new pane (right)' },
        { key: 'Ctrl+Shift+←',                 label: 'Open in new pane (left)' },
        { key: 'Space',                         label: 'Toggle selection' },
        { key: '/',                             label: 'SmartBar' },
        { key: '@ / §',                         label: 'SmartBar (Cairns mode)' },
        { key: 'b',                             label: 'Toggle cairn (hover target)' },
        { key: 'y',                             label: 'Copy path (hover target)' },
        { key: 'n',                             label: 'New file' },
        { key: 'N',                             label: 'New folder' },
        { key: 'r',                             label: 'Rename' },
        { key: 'Del',                           label: 'Move to trash' },
        { key: 'Ctrl+A',                        label: 'Select all' },
        { key: 'Ctrl+X',                        label: 'Cut' },
        { key: 'Ctrl+C',                        label: 'Copy' },
        { key: 'Ctrl+V',                        label: 'Paste' },
        { key: 'm',                             label: 'Move mode' },
        { key: 'Shift+Click',                   label: 'Range select' },
        { key: 'Ctrl+Click',                    label: 'Multi-select' },
      ]
    },
    {
      label: 'SmartBar',
      keys: [
        { key: '↑ / ↓',   label: 'Navigate suggestions' },
        { key: 'Tab',      label: 'Autocomplete' },
        { key: 'Backspace', label: 'Jump up one segment' },
        { key: 'Enter',    label: 'Navigate' },
        { key: '@',        label: 'Switch to Cairns mode' },
        { key: 'Escape',   label: 'Commit or cancel' },
      ]
    },
    {
      label: 'Cairns',
      keys: [
        { key: '↑ / ↓',        label: 'Move selection' },
        { key: '→ / Enter',    label: 'Navigate to cairn' },
        { key: 'Ctrl+Shift+→', label: 'Open in new pane (right)' },
        { key: 'Ctrl+Shift+←', label: 'Open in new pane (left)' },
        { key: 'b',            label: 'Remove cairn' },
      ]
    },
  ]

  const hotkeyRows = hotkeyGroups.flatMap(group => [
    { type: 'group', label: group.label },
    ...group.keys.map(k => ({ type: 'shortcut', ...k }))
  ])

  let rows = $derived.by(() => {
    if (section === 'root') return rootSections
    if (section === 'trash') return [
      { type: 'toggle', id: 'useKryptaTrash', label: 'Krypta trash buffer', value: settings.useKryptaTrash, default: DEFAULTS.useKryptaTrash },
      { type: 'action', id: 'flush',          label: 'Flush buffer to OS trash' },
    ]
    if (section === 'commands') return [
      ...settings.customCommands.map((cmd, i) => ({ type: 'command', index: i, ...cmd })),
      { type: 'add' },
    ]
    if (section === 'hotkeys') return hotkeyRows
    if (section === 'general') return [
      { type: 'toggle', id: 'springLoad', label: 'Spring-load folders', value: settings.springLoad !== false, default: DEFAULTS.springLoad },
      { type: 'range',  id: 'springLoadDelay', label: 'Spring-load delay', value: settings.springLoadDelay ?? DEFAULTS.springLoadDelay, min: 200, max: 2000, step: 50, disabled: settings.springLoad === false, default: DEFAULTS.springLoadDelay, sub: true },
      { type: 'toggle', id: 'autoHideColumns', label: 'Auto-hide narrow columns', value: settings.autoHideColumns !== false, default: DEFAULTS.autoHideColumns },
      { type: 'toggle', id: 'showCreateBtn',   label: 'Quick-create button',       value: settings.showCreateBtn !== false,  default: DEFAULTS.showCreateBtn },
      { type: 'toggle', id: 'showHidden',      label: 'Show hidden files',          value: settings.showHidden === true,      default: DEFAULTS.showHidden },
      { type: 'toggle', id: 'restoreSession',  label: 'Restore session on launch',  value: settings.restoreSession !== false,  default: DEFAULTS.restoreSession },
      { type: 'select', id: 'startScreen', label: 'Start with', value: settings.startScreen ?? DEFAULTS.startScreen, default: DEFAULTS.startScreen, disabled: settings.restoreSession !== false, sub: true, options: [{ value: 'home', label: 'Home directory' }, { value: 'cairns', label: 'Cairns' }, { value: 'search', label: 'Search' }] },
      { type: 'toggle', id: 'autoExpandPanes', label: 'Expand window for new panes', value: settings.autoExpandPanes !== false, default: DEFAULTS.autoExpandPanes },
      { type: 'toggle', id: 'openInNewPane',   label: 'Open Cairns, Settings and Search in new pane', value: settings.openInNewPane !== false, default: DEFAULTS.openInNewPane },
      { type: 'toggle', id: 'copyAllPaths',    label: 'Copy all paths on multi-select', value: settings.copyAllPaths === true, default: DEFAULTS.copyAllPaths },
    ]
    return []
  })

  let sectionLabel = $derived(rootSections.find(s => s.id === section)?.label ?? null)

  function activateRow(row) {
    if (!row) return
    switch (row.type) {
      case 'section':
        section = row.id
        selectedIndex = 0
        break
      case 'toggle':
        onSettingsChange({ ...settings, [row.id]: !row.value })
        break
      case 'select': {
        if (row.disabled) break
        const idx = row.options.findIndex(o => o.value === row.value)
        const next = row.options[(idx + 1) % row.options.length]
        onSettingsChange({ ...settings, [row.id]: next.value })
        break
      }
      case 'action':
        if (row.id === 'flush') window.krypta.flushKryptaTrash()
        break
      case 'command':
        startEdit(row.index)
        break
      case 'add':
        addCommand()
        break
    }
  }

  function startEdit(index) {
    const cmd = settings.customCommands[index]
    editingIndex = index
    editLabel = cmd.label
    editCommand = cmd.command
    editField = 'label'
  }

  function addCommand() {
    const newCommands = [...settings.customCommands, { label: '', command: '' }]
    onSettingsChange({ ...settings, customCommands: newCommands })
    editingIndex = newCommands.length - 1
    editLabel = ''
    editCommand = ''
    editField = 'label'
    selectedIndex = newCommands.length - 1
  }

  function commitEdit() {
    if (editingIndex === null) return
    const label = editLabel.trim()
    const command = editCommand.trim()
    if (!label && !command) { cancelEdit(); return }
    const newCommands = [...settings.customCommands]
    newCommands[editingIndex] = { label: label || 'Unnamed', command }
    onSettingsChange({ ...settings, customCommands: newCommands })
    editingIndex = null
  }

  function cancelEdit() {
    const orig = settings.customCommands[editingIndex]
    if (!orig?.label && !orig?.command) {
      const newCommands = settings.customCommands.filter((_, i) => i !== editingIndex)
      onSettingsChange({ ...settings, customCommands: newCommands })
      selectedIndex = Math.min(selectedIndex, Math.max(0, newCommands.length - 1))
    }
    editingIndex = null
  }

  function handleRangeChange(id, value) {
    onSettingsChange({ ...settings, [id]: value })
  }

  function resetToDefault(row) {
    onSettingsChange({ ...settings, [row.id]: row.default })
  }

  function deleteSelected() {
    const row = rows[selectedIndex]
    if (row?.type !== 'command') return
    const newCommands = settings.customCommands.filter((_, i) => i !== row.index)
    onSettingsChange({ ...settings, customCommands: newCommands })
    selectedIndex = Math.min(selectedIndex, Math.max(0, newCommands.length))
  }

  $effect(() => {
    if (editingIndex !== null) {
      if (editField === 'label' && labelInputEl) { labelInputEl.focus(); labelInputEl.select() }
      else if (editField === 'command' && commandInputEl) { commandInputEl.focus(); commandInputEl.select() }
    }
  })

  $effect(() => {
    function handleKey(e) {
      if (!focused) return

      if (editingIndex !== null) {
        if (e.key === 'Tab') {
          e.preventDefault()
          editField = editField === 'label' ? 'command' : 'label'
        } else if (e.key === 'Enter') {
          e.preventDefault()
          editField === 'label' ? (editField = 'command') : commitEdit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          cancelEdit()
        }
        return
      }

      const isSkippable = (r) => r?.type === 'group' || r?.type === 'shortcut' || r?.type === 'info'

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        let next = selectedIndex
        do { next++ } while (next < rows.length - 1 && isSkippable(rows[next]))
        if (next < rows.length && !isSkippable(rows[next])) selectedIndex = next
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        let next = selectedIndex
        do { next-- } while (next > 0 && isSkippable(rows[next]))
        if (next >= 0 && !isSkippable(rows[next])) selectedIndex = next
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        e.preventDefault()
        activateRow(rows[selectedIndex])
      } else if (e.key === 'ArrowLeft' || e.key === 'Backspace') {
        if (section !== 'root') { e.preventDefault(); section = 'root'; selectedIndex = 0 }
      } else if (e.key === 'Delete' && section === 'commands') {
        e.preventDefault()
        deleteSelected()
      } else if (e.key === 'n' && section === 'commands') {
        e.preventDefault()
        addCommand()
      } else if (e.key === 'r' && section === 'commands') {
        const row = rows[selectedIndex]
        if (row?.type === 'command') { e.preventDefault(); startEdit(row.index) }
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div
  class="settings-pane"
  class:focused
  class:grace
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
  <div
    class="pathbar"
    class:pane-drag-over={paneDragOver}
  >
    <button class="pane-collapse-btn" onclick={onCollapse} title="Collapse pane"><ChevronLeft size={10} strokeWidth={2.5} /></button>
    {#if sectionLabel}
      <button class="crumb" onclick={() => { section = 'root'; selectedIndex = 0 }}>Settings</button>
      <span class="sep">›</span>
      <span class="crumb-current">{sectionLabel}</span>
    {:else}
      <span class="crumb-current">Settings</span>
    {/if}
    <div class="pane-actions">
      <button class="pane-action-btn" onclick={onAddPane} title="New pane">+</button>
      <span class="pane-actions-sep"></span>
      <button class="pane-action-btn close" onclick={onClose} title="Close pane"><X size={10} strokeWidth={2.5} /></button>
    </div>
  </div>

  <div class="column-spacer">{sectionLabel ?? 'All'}</div>

  <div class="row-list">
    {#each rows as row, i}
      {#if row.type === 'section'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"><svelte:component this={row.icon} size={14} color="var(--pink)" strokeWidth={1.5} /></span>
          <span class="cell-label">{row.label}</span>
          <span class="cell-right"><ChevronRight size={12} color="var(--text-dim)" strokeWidth={1.5} /></span>
        </div>

      {:else if row.type === 'toggle'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          class:sub={row.sub}
          onclick={() => { selectedIndex = i; activateRow(row) }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
          <span class="cell-right value" class:on={row.value}>
            {#if row.default !== undefined && row.value !== row.default}
              <button class="reset-btn" onclick={(e) => { e.stopPropagation(); resetToDefault(row) }} title="Reset to default">
                <RotateCcw size={9} color="currentColor" strokeWidth={2.5} />
              </button>
            {/if}
            {row.value ? 'on' : 'off'}
          </span>
        </div>

      {:else if row.type === 'action'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
        </div>

      {:else if row.type === 'command'}
        {#if row.index === editingIndex}
          <div class="row editing">
            <span class="cell-icon"><Terminal size={13} color="var(--text-dim)" strokeWidth={1.5} /></span>
            <input
              bind:this={labelInputEl}
              bind:value={editLabel}
              class="edit-input"
              class:active={editField === 'label'}
              placeholder="Label"
              onkeydown={(e) => e.stopPropagation()}
              onfocus={() => editField = 'label'}
              spellcheck="false"
            />
            <input
              bind:this={commandInputEl}
              bind:value={editCommand}
              class="edit-input mono"
              class:active={editField === 'command'}
              placeholder="command {path}"
              onkeydown={(e) => e.stopPropagation()}
              onfocus={() => editField = 'command'}
              spellcheck="false"
            />
          </div>
        {:else}
          <div
            class="row"
            class:selected={i === selectedIndex}
            onclick={() => { selectedIndex = i }}
            ondblclick={() => startEdit(row.index)}
            onmouseenter={() => selectedIndex = i}
          >
            <span class="cell-icon"><Terminal size={13} color="var(--text-dim)" strokeWidth={1.5} /></span>
            <span class="cell-label">{row.label}</span>
            <span class="cell-right command">{row.command || '—'}</span>
          </div>
        {/if}

      {:else if row.type === 'add'}
        <div
          class="row dim"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"><Plus size={13} color="var(--text-dim)" strokeWidth={1.5} /></span>
          <span class="cell-label">New command</span>
        </div>

      {:else if row.type === 'group'}
        <div class="row-group-header">
          {row.label}
        </div>

      {:else if row.type === 'shortcut'}
        <div class="row shortcut-row">
          <span class="shortcut-label">{row.label}</span>
          <kbd>{row.key}</kbd>
        </div>

      {:else if row.type === 'info'}
        <div class="row dim non-interactive">
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
        </div>

      {:else if row.type === 'range'}
        <div
          class="row range-row"
          class:selected={i === selectedIndex}
          class:disabled={row.disabled}
          class:sub={row.sub}
          onclick={() => selectedIndex = i}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
          <div class="range-control" onclick={(e) => e.stopPropagation()}>
            <input
              type="range"
              min={row.min}
              max={row.max}
              step={row.step}
              value={row.value}
              disabled={row.disabled}
              oninput={(e) => handleRangeChange(row.id, parseInt(e.currentTarget.value))}
            />
            {#if row.default !== undefined && row.value !== row.default}
              <button class="reset-btn" onclick={(e) => { e.stopPropagation(); resetToDefault(row) }} title="Reset to default">
                <RotateCcw size={9} color="currentColor" strokeWidth={2.5} />
              </button>
            {/if}
            <span class="range-value">{row.value}ms</span>
          </div>
        </div>

      {:else if row.type === 'select'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          class:sub={row.sub}
          class:disabled={row.disabled}
          onclick={() => { selectedIndex = i; activateRow(row) }}
          onmouseenter={() => selectedIndex = i}
        >
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
          <span class="cell-right value on">
            {#if row.default !== undefined && row.value !== row.default}
              <button class="reset-btn" onclick={(e) => { e.stopPropagation(); resetToDefault(row) }} title="Reset to default">
                <RotateCcw size={9} color="currentColor" strokeWidth={2.5} />
              </button>
            {/if}
            {row.options.find(o => o.value === row.value)?.label ?? row.value}
          </span>
        </div>
      {/if}
    {/each}
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
  .settings-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    border-right: 1px solid var(--border);
    position: relative;
    overflow: hidden;
  }

  .pathbar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 12px;
    height: 36px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-dim);
  }

  .settings-pane.focused .pathbar {
    border-bottom-color: rgba(212, 96, 110, 0.5);
  }

  .pathbar.pane-drag-over {
    background: rgba(80, 200, 120, 0.08);
    border-bottom-color: rgba(80, 200, 120, 0.5);
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
  .settings-pane:hover .pane-handle,
  .settings-pane.focused .pane-handle { opacity: 0.2; }
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
  .settings-pane:hover .pane-collapse-btn,
  .settings-pane.focused .pane-collapse-btn { opacity: 0.15; }
  .pathbar:hover .pane-collapse-btn { opacity: 0.35; }
  .pane-collapse-btn:hover { opacity: 1 !important; color: var(--text); }

  .settings-pane.grace .pane-actions,
  .settings-pane.grace .pane-collapse-btn { pointer-events: none; }

  .crumb {
    background: none;
    border: none;
    color: var(--text-dim);
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }
  .crumb:hover { color: var(--text); }

  .crumb-current { color: var(--text-dim); }
  .sep { opacity: 0.4; }

  .column-spacer {
    height: 26px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--text-dim);
    opacity: 0.6;
    user-select: none;
  }

  .row-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 0 2px;
  }

  .row {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    height: 28px;
    padding: 0 12px 0 0;
    gap: 0;
    cursor: default;
    position: relative;
    user-select: none;
  }

  .row.selected {
    background: rgba(80, 200, 120, 0.05);
    box-shadow: inset 2px 0 0 rgba(80, 200, 120, 0.45);
  }

  .settings-pane.focused .row.selected {
    background: rgba(80, 200, 120, 0.1);
    box-shadow: inset 3px 0 0 var(--emerald);
  }

  .row:not(.non-interactive):hover { background: rgba(212, 96, 110, 0.07); }
  .row.dim { opacity: 0.5; }
  .row.sub { grid-template-columns: 44px 1fr auto; }
  .row.non-interactive { cursor: default; }

  .cell-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    flex-shrink: 0;
  }

  .cell-label {
    font-size: 12px;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cell-right {
    display: flex;
    align-items: center;
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
    padding-right: 4px;
  }

  .cell-right.value { opacity: 0.5; gap: 5px; }
  .cell-right.value:not(.on) { color: var(--pink); opacity: 0.7; }
  .cell-right.value.on { color: var(--emerald); opacity: 0.9; }

  .cell-right.command {
    font-family: monospace;
    font-size: 10px;
    opacity: 0.45;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row.editing {
    grid-template-columns: 28px 1fr 1.4fr;
    height: 28px;
    gap: 6px;
    padding-right: 12px;
  }

  .edit-input {
    background: none;
    border: none;
    border-bottom: 1px solid var(--border);
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
    padding: 0 2px;
    width: 100%;
    caret-color: var(--emerald);
  }

  .edit-input.mono { font-family: monospace; font-size: 11px; }
  .edit-input.active { border-bottom-color: rgba(212, 96, 110, 0.6); }
  .edit-input::placeholder { color: var(--text-dim); opacity: 0.35; }

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

  .settings-pane:hover .pane-action-btn,
  .settings-pane:hover .pane-actions-sep,
  .settings-pane.focused .pane-action-btn,
  .settings-pane.focused .pane-actions-sep { opacity: 0.15; }

  .pathbar:hover .pane-action-btn,
  .pathbar:hover .pane-actions-sep { opacity: 0.35; }

  .pane-action-btn:hover { opacity: 1 !important; color: var(--text); }
  .pane-action-btn.close:hover { color: var(--pink); }

  .row-group-header {
    padding: 12px 12px 4px 28px;
    font-size: 9px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--text-dim);
    opacity: 0.5;
    user-select: none;
  }

  .row-group-header:first-child { padding-top: 6px; }

  .shortcut-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 0 28px;
    cursor: default;
    user-select: none;
  }

  .shortcut-label {
    font-size: 12px;
    color: var(--text-dim);
  }

  .reset-btn {
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    color: var(--text-dim);
    opacity: 0.8;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: opacity 0.1s, color 0.1s;
  }
  .reset-btn:hover { opacity: 1; color: var(--pink); }

  .range-row { height: 28px; overflow: hidden; }

  .range-control {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-right: 4px;
  }

  .range-control input[type="range"] {
    width: 80px;
    height: 16px;
    accent-color: var(--emerald);
    cursor: pointer;
  }

  .range-value {
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.7;
    min-width: 36px;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .row.disabled .cell-label,
  .row.disabled .range-value { opacity: 0.35; }
  .row.disabled .range-control input { cursor: not-allowed; opacity: 0.35; }

  kbd {
    font-family: monospace;
    font-size: 10px;
    color: var(--text-dim);
    background: rgba(255,255,255,0.04);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    white-space: nowrap;
    flex-shrink: 0;
  }
</style>
