<script>
  import Titlebar from './lib/Titlebar.svelte'
  import Pane from './lib/Pane.svelte'

  let focusedPane = $state(0)
  let panes = $state([{ dir: window.krypta.homeDir }])

  function addPane(afterIndex) {
    const newPane = { dir: panes[afterIndex]?.dir ?? window.krypta.homeDir }
    panes = [...panes.slice(0, afterIndex + 1), newPane, ...panes.slice(afterIndex + 1)]
    focusedPane = afterIndex + 1
  }

  function removePane(index) {
    if (panes.length <= 1) {
      window.krypta.window.close()
      return
    }
    panes = panes.filter((_, i) => i !== index)
    focusedPane = Math.min(focusedPane, panes.length - 1)
  }

  $effect(() => {
    function handleKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 't') {
        e.preventDefault()
        addPane(focusedPane)
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
        e.preventDefault()
        removePane(focusedPane)
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div class="app">
  <Titlebar />
  <main>
    {#each panes as pane, i (i)}
      <Pane
        bind:currentDir={panes[i].dir}
        focused={focusedPane === i}
        onFocus={() => focusedPane = i}
        onAddPane={() => addPane(i)}
      />
    {/each}
  </main>
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
</style>
