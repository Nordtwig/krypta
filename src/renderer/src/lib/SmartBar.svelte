<script>
  import { onMount } from 'svelte'
  import { isKnownTag } from './search.js'
  import { sep, lastSepIndex } from './paths.js'

  let { query = $bindable(), placeholder = '', onInput, onSubmit, onCancel, onArrow, onTab, onScry, ghostSuffix = '', chips = [], onChipAdd, onChipRemove } = $props()

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
      if (atEnd && query === '?' && chips.length > 0) {
        e.preventDefault()
        e.stopPropagation()
        onChipRemove?.(chips.at(-1))
      } else if (atEnd && (query.endsWith('/') || query.endsWith('\\')) && query.length > 1) {
        e.preventDefault()
        e.stopPropagation()
        const stripped = query.slice(0, -1)
        const prev = lastSepIndex(stripped)
        query = prev >= 0 ? query.slice(0, prev + 1) : sep
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
    } else if (e.key === 'I' && e.shiftKey && e.ctrlKey) {
      e.preventDefault()
      e.stopPropagation()
      onScry?.()
    }
  }
</script>

<div class="smartbar">
  {#each chips as chip}
    <span class="chip" class:unknown={!isKnownTag(chip)}>
      #{chip}<button
        class="chip-remove"
        onmousedown={(e) => { e.preventDefault(); onChipRemove?.(chip) }}
      >×</button>
    </span>
  {/each}
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
        let val = e.currentTarget.value
        if (!val.startsWith('@') && val.includes('@')) {
          e.currentTarget.value = '@'
          query = '@'
          onInput('@')
        } else if (!val.startsWith('?') && val.includes('?')) {
          e.currentTarget.value = '?'
          query = '?'
          onInput('?')
        } else {
          if (val.startsWith('?')) {
            const extracted = []
            const cleaned = val.replace(/#(\w+)\s/g, (_, tag) => { extracted.push(tag); return '' })
            if (extracted.length) {
              for (const tag of extracted) {
                if (!chips.includes(tag)) onChipAdd?.(tag)
              }
              val = cleaned
              e.currentTarget.value = cleaned
              query = cleaned
            }
          }
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
    display: flex;
    align-items: center;
    gap: 4px;
    overflow: hidden;
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

  .chip.unknown {
    background: var(--pink);
  }

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
