<script>
  import KryptaLogo from './KryptaLogo.svelte'
  const { window: win } = window.krypta
</script>

<div class="titlebar">
  <span class="logo">
    <KryptaLogo size={13} color="var(--text-dim)" />
    Krypta
  </span>
  <div class="controls">
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
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 7px;
    font-family: 'Press Start 2P', monospace;
    font-size: 8px;
    color: var(--text-dim);
    -webkit-app-region: drag;
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
</style>
