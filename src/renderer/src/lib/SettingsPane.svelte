<script>
  import { Trash2, Terminal, SlidersHorizontal, Keyboard, Plus, ChevronRight } from 'lucide-svelte'

  let { focused = false, onFocus, onAddPane, settings, onSettingsChange } = $props()

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
        { key: 'Tab / Shift+Tab',  label: 'Cycle panes' },
        { key: 'Shift+← / →',     label: 'Move pane' },
        { key: 'Ctrl+,',           label: 'Settings' },
        { key: 'Ctrl+Z',           label: 'Undo' },
        { key: 'Ctrl+Y',           label: 'Redo' },
      ]
    },
    {
      label: 'Pane',
      keys: [
        { key: '↑ / ↓',           label: 'Move selection' },
        { key: '→ / Enter',        label: 'Open / enter folder' },
        { key: '← / Backspace',    label: 'Go up' },
        { key: '/',                label: 'SmartBar' },
        { key: 'n',                label: 'New file' },
        { key: 'N',                label: 'New folder' },
        { key: 'r',                label: 'Rename' },
        { key: 'Del',              label: 'Move to trash' },
        { key: 'Ctrl+X',           label: 'Cut' },
        { key: 'Ctrl+C',           label: 'Copy' },
        { key: 'Ctrl+V',           label: 'Paste' },
        { key: 'Ctrl+M',           label: 'Move mode' },
        { key: 'Shift+Click',      label: 'Range select' },
        { key: 'Ctrl+Click',       label: 'Multi-select' },
      ]
    },
    {
      label: 'SmartBar',
      keys: [
        { key: 'Tab',              label: 'Autocomplete' },
        { key: 'Backspace',        label: 'Jump up one segment' },
        { key: 'Enter',            label: 'Navigate' },
        { key: 'Escape',           label: 'Cancel' },
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
      { type: 'toggle', id: 'useKryptaTrash', label: 'Krypta trash buffer', value: settings.useKryptaTrash },
      { type: 'action', id: 'flush',          label: 'Flush buffer to OS trash' },
    ]
    if (section === 'commands') return [
      ...settings.customCommands.map((cmd, i) => ({ type: 'command', index: i, ...cmd })),
      { type: 'add' },
    ]
    if (section === 'hotkeys') return hotkeyRows
    if (section === 'general') return [
      { type: 'info', label: 'More options coming soon' },
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
        onSettingsChange({ ...settings, [row.id]: !settings[row.id] })
        break
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
        if (!isSkippable(rows[next])) selectedIndex = next
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        let next = selectedIndex
        do { next-- } while (next > 0 && isSkippable(rows[next]))
        if (!isSkippable(rows[next])) selectedIndex = next
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

<div class="settings-pane" class:focused onmouseenter={onFocus}>
  <div class="pathbar">
    {#if sectionLabel}
      <button class="crumb" onclick={() => { section = 'root'; selectedIndex = 0 }}>Settings</button>
      <span class="sep">›</span>
      <span class="crumb-current">{sectionLabel}</span>
    {:else}
      <span class="crumb-current">Settings</span>
    {/if}
  </div>

  <div class="row-list">
    {#each rows as row, i}
      {#if row.type === 'section'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
        >
          <span class="cell-icon"><svelte:component this={row.icon} size={14} color="var(--pink)" strokeWidth={1.5} /></span>
          <span class="cell-label">{row.label}</span>
          <span class="cell-right"><ChevronRight size={12} color="var(--text-dim)" strokeWidth={1.5} /></span>
        </div>

      {:else if row.type === 'toggle'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
        >
          <span class="cell-icon"></span>
          <span class="cell-label">{row.label}</span>
          <span class="cell-right value" class:on={row.value}>{row.value ? 'on' : 'off'}</span>
        </div>

      {:else if row.type === 'action'}
        <div
          class="row"
          class:selected={i === selectedIndex}
          onclick={() => { selectedIndex = i; activateRow(row) }}
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
      {/if}
    {/each}
  </div>

  <button class="add-pane-btn" onclick={onAddPane} title="Open new pane">+</button>
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
    height: 34px;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    font-size: 11px;
    color: var(--text-dim);
  }

  .settings-pane.focused .pathbar {
    border-bottom-color: rgba(212, 96, 110, 0.5);
  }

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

  .row-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px 0;
  }

  .row {
    display: grid;
    grid-template-columns: 28px 1fr auto;
    align-items: center;
    height: 26px;
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

  .row.dim { opacity: 0.5; }
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

  .cell-right.value { opacity: 0.5; }
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

  .add-pane-btn {
    position: absolute;
    bottom: 8px;
    right: 10px;
    width: 22px;
    height: 22px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 3px;
    color: var(--text-dim);
    font-size: 14px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.1s;
  }

  .settings-pane:hover .add-pane-btn,
  .settings-pane.focused .add-pane-btn { opacity: 1; }
  .add-pane-btn:hover { background: var(--bg-hover); color: var(--text); }

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
