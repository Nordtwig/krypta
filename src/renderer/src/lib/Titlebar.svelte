<script>
  import KryptaLogo from './KryptaLogo.svelte'
  import { Bookmark, Search, SlidersHorizontal, Pin, PinOff } from 'lucide-svelte'
  const { window: win } = window.krypta
  let { onOpenCairns, onOpenSearch, onOpenSettings } = $props()
  let menuOpen = $state(false)
  let pinned = $state(false)

  function openAndClose(fn) {
    menuOpen = false
    fn()
  }

  async function togglePin() {
    pinned = !pinned
    await win.setAlwaysOnTop(pinned)
  }

  $effect(() => {
    function handleKey(e) {
      if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.shiftKey && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        togglePin()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  })
</script>

<div class="titlebar">
  <span class="logo" onclick={() => menuOpen = !menuOpen} title="Menu">
    <span class="logo-icon"><KryptaLogo size={13} color="var(--text-dim)" /></span>
    Krypta
  </span>

  {#if menuOpen}
    <div class="backdrop" onclick={() => menuOpen = false}></div>
    <div class="logo-menu">
      <button onclick={() => openAndClose(onOpenCairns)}>
        <Bookmark size={13} strokeWidth={1.5} />
        <span class="menu-label">Cairns</span>
        <span class="menu-shortcut">Ctrl+B</span>
      </button>
      <button onclick={() => openAndClose(onOpenSearch)}>
        <Search size={13} strokeWidth={1.5} />
        <span class="menu-label">Search</span>
        <span class="menu-shortcut">Ctrl+F</span>
      </button>
      <button onclick={() => openAndClose(onOpenSettings)}>
        <SlidersHorizontal size={13} strokeWidth={1.5} />
        <span class="menu-label">Settings</span>
        <span class="menu-shortcut">Ctrl+,</span>
      </button>
    </div>
  {/if}

  <div class="controls">
    <button class="ctrl pin" class:active={pinned} onclick={togglePin} title="Pin on top (P)">
      {#if pinned}<Pin size={11} strokeWidth={2} />{:else}<PinOff size={11} strokeWidth={2} />{/if}
    </button>
    <button class="ctrl minimize" onclick={win.minimize} title="Minimize">–</button>
    <button class="ctrl maximize" onclick={win.maximize} title="Maximize">□</button>
    <button class="ctrl close" onclick={win.close} title="Close">×</button>
  </div>
</div>

<style>
  .titlebar {
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px 0 16px;
    -webkit-app-region: drag;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    position: relative;
  }

  .logo-icon {
    display: flex;
    position: relative;
    top: -1px;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 4px;
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: var(--text-dim);
    -webkit-app-region: no-drag;
    cursor: pointer;
    user-select: none;
  }

  .logo:hover { color: var(--text); }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 99;
  }

  .logo-menu {
    position: absolute;
    top: calc(100% + 4px);
    left: 12px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px;
    z-index: 100;
    display: flex;
    flex-direction: column;
    min-width: 160px;
  }

  .logo-menu button {
    background: none;
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 3px;
    color: var(--text-dim);
    width: 100%;
    text-align: left;
  }

  .logo-menu button:hover {
    background: var(--bg-hover);
    color: var(--text);
  }

  .menu-label {
    flex: 1;
    font-size: 12px;
  }

  .menu-shortcut {
    font-size: 10px;
    color: var(--text-dim);
    opacity: 0.6;
  }

  .controls {
    display: flex;
    gap: 8px;
    -webkit-app-region: no-drag;
  }

  .ctrl {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 14px;
    line-height: 1;
    padding: 0 2px;
    opacity: 0.4;
    transition: opacity 0.15s;
  }

  .ctrl:hover { opacity: 1; }

  .close    { color: var(--pink); }
  .minimize { color: var(--text-dim); }
  .maximize { color: var(--emerald); }
  .pin      { color: var(--text-dim); display: flex; align-items: center; position: relative; top: 2px; }
  .pin.active { color: var(--pink); opacity: 1; }
</style>
