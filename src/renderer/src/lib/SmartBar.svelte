<script>
  import { onMount } from 'svelte'

  let { query = $bindable(), placeholder = '', onInput, onSubmit, onCancel, onArrow, onTab, ghostSuffix = '' } = $props()

  let inputEl = $state(null)
  let ghostInnerEl = $state(null)

  onMount(() => {
    if (inputEl) {
      inputEl.focus()
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length)
    }
  })

  $effect(() => {
    if (!inputEl || !ghostInnerEl) return
    function sync() { ghostInnerEl.style.transform = `translateX(-${inputEl.scrollLeft}px)` }
    inputEl.addEventListener('scroll', sync)
    sync()
    return () => inputEl.removeEventListener('scroll', sync)
  })

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel?.()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      onTab?.()
    } else if (e.key === 'Backspace') {
      const atEnd = inputEl?.selectionStart === query.length && inputEl?.selectionEnd === query.length
      if (atEnd && query.endsWith('/') && query.length > 1) {
        e.preventDefault()
        e.stopPropagation()
        const stripped = query.slice(0, -1)
        const prev = stripped.lastIndexOf('/')
        query = prev >= 0 ? query.slice(0, prev + 1) : '/'
        onInput(query)
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      onSubmit()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      onArrow?.(1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      onArrow?.(-1)
    }
  }
</script>

<div class="smartbar">
  <div class="input-wrap">
    {#if ghostSuffix}
      <div class="ghost" aria-hidden="true">
        <span bind:this={ghostInnerEl} class="ghost-inner">
          <span class="ghost-spacer">{query}</span><span class="ghost-hint">{ghostSuffix}</span>
        </span>
      </div>
    {/if}
    <input
      bind:this={inputEl}
      bind:value={query}
      class="smart-input"
      oninput={(e) => {
        const val = e.currentTarget.value
        if (!val.startsWith('@') && val.includes('@')) {
          e.currentTarget.value = '@'
          query = '@'
          onInput('@')
        } else {
          onInput(val)
        }
      }}
      onkeydown={handleKeydown}
      onblur={() => onCancel?.()}
      placeholder={placeholder}
      spellcheck="false"
      autocomplete="off"
    />
  </div>
</div>

<style>
  .smartbar {
    width: 100%;
  }

  .input-wrap {
    position: relative;
    width: 100%;
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
    padding: 0;
  }

  .ghost-spacer {
    visibility: hidden;
  }

  .ghost-hint {
    color: var(--text-dim);
    opacity: 0.45;
  }

  .smart-input {
    position: relative;
    width: 100%;
    padding: 0;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    caret-color: var(--emerald);
    z-index: 1;
  }

  .smart-input::placeholder {
    color: var(--text-dim);
    opacity: 0.5;
  }
</style>
