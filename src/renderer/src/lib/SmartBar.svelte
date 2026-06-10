<script>
  import { onMount } from 'svelte'

  let { query = $bindable(), placeholder = '', onInput, onSubmit, onClose, onArrow } = $props()

  let inputEl = $state(null)

  onMount(() => {
    if (inputEl) {
      inputEl.focus()
      inputEl.setSelectionRange(inputEl.value.length, inputEl.value.length)
    }
  })

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onClose()
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
  <input
    bind:this={inputEl}
    bind:value={query}
    class="smart-input"
    oninput={() => onInput(query)}
    onkeydown={handleKeydown}
    placeholder={placeholder}
    spellcheck="false"
    autocomplete="off"
  />
</div>

<style>
  .smartbar {
    width: 100%;
  }

  .smart-input {
    width: 100%;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-size: 12px;
    font-family: inherit;
    caret-color: var(--emerald);
  }

  .smart-input::placeholder {
    color: var(--text-dim);
    opacity: 0.5;
  }
</style>
