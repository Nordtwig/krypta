const electron = require("electron")
const app = electron.app
const BrowserWindow = electron.BrowserWindow
const path = require("path")
const url = require("url")
const ipc = electron.ipcMain

let win

function createWindow() {
    win = new BrowserWindow({
        width: 700,
        height: 500,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        titleBarStyle: 'hidden'
    })
    win.loadURL(url.format({
        pathname: path.join(__dirname, "index.html"),
        protocol: "file",
        slashes: true
    }))
    win.webContents.openDevTools()
    win.on("closed",() => {
        win = null
    })
}

app.disableHardwareAcceleration(); 
app.on("ready", createWindow)
app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
        app.quit()
    }
})
app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length == 0) {
        createWindow()
    }
})
app.on("activate", () => {
    if (win === null) {
        createWindow()
    }
})

ipc.on("close", () => { win.close() })