import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join } from 'path'
import { readdir, rm, mkdir, stat } from 'fs/promises'
import { homedir } from 'os'

const SEARCH_SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', 'out', 'target', '.cache',
  '__pycache__', 'vendor', '.venv', 'venv', '.next', '.nuxt',
  '$Recycle.Bin', 'System Volume Information', '$RECYCLE.BIN',
])

async function walkDir(rootDir, { maxDepth = 6, showHidden = false } = {}) {
  const results = []
  async function walk(dir, depth) {
    if (depth > maxDepth) return
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch { return }
    for (const e of entries) {
      if (!showHidden && e.name.startsWith('.')) continue
      if (e.isDirectory() && SEARCH_SKIP_DIRS.has(e.name)) continue
      const fullPath = join(dir, e.name)
      results.push({ name: e.name, path: fullPath, isDirectory: e.isDirectory() })
      if (e.isDirectory()) await walk(fullPath, depth + 1)
    }
  }
  await walk(rootDir, 0)
  return results
}

const TRASH_FILES = join(homedir(), '.krypta-trash', 'files')
const TRASH_INFO  = join(homedir(), '.krypta-trash', 'info')

async function flushKryptaTrash() {
  try {
    await mkdir(TRASH_FILES, { recursive: true })
    await mkdir(TRASH_INFO,  { recursive: true })
    const keys = await readdir(TRASH_FILES)
    await Promise.all(keys.map(async key => {
      try {
        const keyPath = join(TRASH_FILES, key)
        const s = await stat(keyPath)
        if (s.isDirectory()) {
          for (const name of await readdir(keyPath)) {
            await shell.trashItem(join(keyPath, name))
          }
          await rm(keyPath, { recursive: true }).catch(() => {})
        } else {
          await shell.trashItem(keyPath)  // legacy flat entry
        }
        await rm(join(TRASH_INFO, `${key}.json`)).catch(() => {})
      } catch {}
    }))
  } catch {}
}

let win

function createWindow() {
  win = new BrowserWindow({
    width: 450,
    height: 520,
    minWidth: 200,
    minHeight: 100,
    show: !!process.env['ELECTRON_RENDERER_URL'],
    titleBarStyle: 'hidden',
    backgroundColor: '#091925',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return
    if (input.key === 'I' && input.control && input.shift) {
      event.preventDefault()
      win.webContents.executeJavaScript(
        "(document.activeElement||document).dispatchEvent(new KeyboardEvent('keydown',{key:'I',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))"
      ).catch(() => {})
      return
    }
    if (process.env['ELECTRON_RENDERER_URL'] && input.key === 'F12') {
      win.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
  if (!process.env['ELECTRON_RENDERER_URL']) win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })
}

app.on('ready', () => {
  flushKryptaTrash()  // fire-and-forget; sweep leftovers from a previous crash
  createWindow()
  if (!process.env['ELECTRON_RENDERER_URL']) autoUpdater.checkForUpdatesAndNotify().catch(() => {})
})

app.on('before-quit', async (e) => {
  e.preventDefault()
  await flushKryptaTrash()
  app.exit(0)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})


ipcMain.on('get-user-data-path', (e) => { e.returnValue = app.getPath('userData') })
ipcMain.on('close-window', () => win?.close())
ipcMain.handle('set-always-on-top', (_, value) => { win?.setAlwaysOnTop(value, 'floating') })
ipcMain.on('minimize-window', () => win?.minimize())
ipcMain.on('maximize-window', () => win?.isMaximized() ? win.unmaximize() : win.maximize())

ipcMain.handle('get-window-bounds', () => {
  if (!win) return null
  const { x, y, width, height } = win.getBounds()
  const { workArea } = screen.getDisplayMatching(win.getBounds())
  return { x, y, width, height, workAreaX: workArea.x, workAreaY: workArea.y, workAreaWidth: workArea.width, workAreaHeight: workArea.height }
})

ipcMain.handle('set-window-bounds', (_, { x, y, width, height }) => {
  win?.setBounds({ x, y, width, height })
})

ipcMain.handle('search-files', (_, rootDir, opts) => walkDir(rootDir, opts))
ipcMain.handle('flush-krypta-trash', () => flushKryptaTrash())
