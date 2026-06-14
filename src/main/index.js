import { app, BrowserWindow, ipcMain, shell, screen } from 'electron'
import { join } from 'path'
import { readdir, rm, mkdir } from 'fs/promises'
import { homedir } from 'os'

const TRASH_FILES = join(homedir(), '.krypta-trash', 'files')
const TRASH_INFO  = join(homedir(), '.krypta-trash', 'info')

async function flushKryptaTrash() {
  try {
    await mkdir(TRASH_FILES, { recursive: true })
    await mkdir(TRASH_INFO,  { recursive: true })
    const keys = await readdir(TRASH_FILES)
    await Promise.all(keys.map(async key => {
      try {
        await shell.trashItem(join(TRASH_FILES, key))
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

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return
      const isDevTools = input.key === 'F12' ||
        (input.key === 'I' && input.control && input.shift)
      if (isDevTools) {
        win.webContents.toggleDevTools()
        event.preventDefault()
      }
    })
  }
  if (!process.env['ELECTRON_RENDERER_URL']) win.once('ready-to-show', () => win.show())
  win.on('closed', () => { win = null })
}

app.on('ready', () => {
  flushKryptaTrash()  // fire-and-forget; sweep leftovers from a previous crash
  createWindow()
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

ipcMain.on('close-window', () => win?.close())
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
