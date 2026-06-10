import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'

let win

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 700,
    minWidth: 600,
    minHeight: 400,
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

  win.webContents.openDevTools()
  win.on('closed', () => { win = null })
}

app.disableHardwareAcceleration()
app.on('ready', createWindow)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.on('close-window', () => win?.close())
ipcMain.on('minimize-window', () => win?.minimize())
ipcMain.on('maximize-window', () => win?.isMaximized() ? win.unmaximize() : win.maximize())
