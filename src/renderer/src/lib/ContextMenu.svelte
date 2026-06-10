<script>
  import { onMount } from 'svelte'

  let { items, x, y, onClose } = $props()

  let menuEl = $state(null)
  let activeIndex = $state(-1)
  let ax = $state(x)
  let ay = $state(y)

  onMount(() => {
    const rect = menuEl.getBoundingClientRect()
    ax = x + rect.width  > window.innerWidth  - 4 ? x - rect.width  : x
    ay = y + rect.height > window.innerHeight - 4 ? y - rect.height : y

    function onMouseDown(e) {
      if (!menuEl?.contains(e.target)) onClose()
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); return }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const dir = e.key === 'ArrowDown' ? 1 : -1
        let next = activeIndex
        let tries = 0
        do {
          next = (next + dir + items.length) % items.length
          tries++
        } while ((items[next].separator || items[next].disabled) && tries < items.length)
        if (!items[next].separator && !items[next].disabled) activeIndex = next
      }
      if (e.key === 'Enter' && activeIndex >= 0) {
        const item = items[activeIndex]
        if (item && !item.separator && !item.disabled) { item.action(); onClose() }
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  })

  function pick(item) {
    if (item.disabled || item.separator) return
    item.action()
    onClose()
  }
</script>

<div
  class="context-menu"
  bind:this={menuEl}
  style="left:{ax}px; top:{ay}px"
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each items as item, i}
    {#if item.separator}
      <div class="sep"></div>
    {:else}
      <button
        class="item"
        class:active={i === activeIndex}
        class:disabled={item.disabled}
        onclick={() => pick(item)}
        onmouseenter={() => { if (!item.disabled) activeIndex = i }}
        onmouseleave={() => activeIndex = -1}
      >
        <span class="label">{item.label}</span>
        {#if item.shortcut}
          <span class="shortcut">{item.shortcut}</span>
        {/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .context-menu {
    position: fixed;
    z-index: 1000;
    min-width: 180px;
    background: var(--bg-raised);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    padding: 3px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    font-size: 11px;
  }

  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 8px;
    border-radius: 3px;
    background: none;
    border: none;
    color: var(--text);
    font-family: inherit;
    font-size: 11px;
    cursor: default;
    text-align: left;
    gap: 16px;
  }

  .item.active {
    background: var(--bg-hover);
    color: var(--text);
  }

  .item.disabled {
    color: var(--text-dim);
    opacity: 0.4;
    cursor: default;
  }

  .shortcut {
    color: var(--text-dim);
    font-size: 10px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .item.active .shortcut {
    color: var(--text-dim);
  }

  .sep {
    height: 1px;
    background: var(--border);
    margin: 3px 0;
  }
</style>
