import { contextBridge, ipcRenderer } from 'electron'
import { readdir, stat, rename, mkdir, writeFile, rm, cp, readFile } from 'fs/promises'
import { writeFileSync, mkdirSync, readFileSync } from 'fs'
import { join, basename, dirname, sep } from 'path'
import { homedir, platform } from 'os'
import { shell } from 'electron'
import { spawn } from 'child_process'

const IS_WIN = platform() === 'win32'

const TRASH_DIR = join(homedir(), '.krypta-trash')
const TRASH_FILES = join(TRASH_DIR, 'files')
const TRASH_INFO  = join(TRASH_DIR, 'info')

const CONFIG_DIR    = ipcRenderer.sendSync('get-user-data-path')
const CONFIG_FILE   = join(CONFIG_DIR, 'settings.json')
const SESSION_FILE  = join(CONFIG_DIR, 'session.json')
const DEFAULT_SETTINGS = { useKryptaTrash: true, customCommands: [] }

async function ensureTrashDirs() {
  await mkdir(TRASH_FILES, { recursive: true })
  await mkdir(TRASH_INFO,  { recursive: true })
}



contextBridge.exposeInMainWorld('krypta', {
  homeDir: homedir(),
  sep,
  platform: platform(),

  readDirFast: (dirPath, opts) => ipcRenderer.invoke('read-dir-fast', dirPath, opts),
  statEntries: (dirPath, names, opts) => ipcRenderer.invoke('stat-entries', dirPath, names, opts),

  searchFiles: (rootDir, opts = {}) => ipcRenderer.invoke('search-files', rootDir, opts),

  // Native OS drag-out (Windows/macOS/X11): start an OS-level drag of real files
  startDrag: (files) => ipcRenderer.send('start-drag', files),

  getRecursiveSize: async (dirPath) => {
    async function walk(p) {
      let total = 0
      try {
        const entries = await readdir(p, { withFileTypes: true })
        for (const e of entries) {
          const full = join(p, e.name)
          if (e.isDirectory()) {
            total += await walk(full)
          } else {
            try { total += (await stat(full)).size } catch {}
          }
        }
      } catch {}
      return total
    }
    return walk(dirPath)
  },

  statPath: async (filePath) => {
    const s = await stat(filePath)
    return { size: s.size, mtime: s.mtime, mode: s.mode }
  },

  readDirNames: async (dirPath) => {
    const entries = await readdir(dirPath, { withFileTypes: true })
    return entries
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map(e => ({ name: e.name, isDirectory: e.isDirectory() }))
  },

  isRoot: (dirPath) => dirname(dirPath) === dirPath,
  parentDir: (dirPath) => dirname(dirPath),
  joinPath: (...parts) => join(...parts),

  move: async (src, dest) => {
    try {
      await rename(src, dest)
    } catch (e) {
      if (e.code === 'EXDEV') {  // cross-device (e.g. C: → D:) — rename can't; copy then delete
        await cp(src, dest, { recursive: true })
        await rm(src, { recursive: true })
      } else {
        throw e
      }
    }
  },
  copy: (src, dest) => cp(src, dest, { recursive: true }),
  createFile: (filePath) => writeFile(filePath, ''),
  createDir: (dirPath) => mkdir(dirPath),
  delete: (filePath, recursive = false) => rm(filePath, { recursive }),
  openFile: (filePath) => shell.openPath(filePath),

  loadSettings: async () => {
    try {
      const content = await readFile(CONFIG_FILE, 'utf8')
      return { ...DEFAULT_SETTINGS, ...JSON.parse(content) }
    } catch {
      return { ...DEFAULT_SETTINGS }
    }
  },

  saveSettings: (settings) => {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(CONFIG_FILE, JSON.stringify(settings, null, 2))
    } catch {}
  },

  loadSession: async () => {
    try {
      const content = await readFile(SESSION_FILE, 'utf8')
      return JSON.parse(content)
    } catch {
      return null
    }
  },

  saveSession: (data) => {
    try {
      mkdirSync(CONFIG_DIR, { recursive: true })
      writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2))
    } catch {}
  },

  runCommand: (cmd) => {
    spawn(cmd, { shell: true, detached: true, stdio: 'ignore' }).unref()
  },

  openTerminal: (dirPath) => {
    // User-declared terminal command (Settings → General) wins. {dir} → target path.
    let custom = ''
    try {
      const s = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'))
      if (typeof s?.terminalCommand === 'string') custom = s.terminalCommand.trim()
    } catch {}
    if (custom) {
      spawn(custom.replace(/\{dir\}/g, dirPath), { cwd: dirPath, shell: true, detached: true, stdio: 'ignore' }).unref()
      return
    }
    if (process.env.TERMINAL) {
      spawn(process.env.TERMINAL, [], { cwd: dirPath, detached: true, stdio: 'ignore' }).unref()
      return
    }
    const candidates = platform() === 'win32'
      ? [
          ['wt.exe', ['-d', dirPath]],                       // Windows Terminal
          ['powershell.exe', ['-NoExit', '-Command', `Set-Location -LiteralPath '${dirPath.replace(/'/g, "''")}'`]],
          ['cmd.exe', ['/K', `cd /d "${dirPath}"`]],
        ]
      : platform() === 'darwin'
      ? [
          ['open', ['-a', 'Terminal', dirPath]],
        ]
      : [
          ['wezterm', ['start', '--cwd', dirPath]],
          ['alacritty', ['--working-directory', dirPath]],
          ['kitty', ['--directory', dirPath]],
          ['gnome-terminal', [`--working-directory=${dirPath}`]],
          ['xfce4-terminal', [`--working-directory=${dirPath}`]],
          ['konsole', ['--workdir', dirPath]],
          ['xterm', ['-e', `cd '${dirPath}' && exec $SHELL`]],
        ]
    function tryNext(i) {
      if (i >= candidates.length) return
      const [cmd, args] = candidates[i]
      const child = spawn(cmd, args, { cwd: dirPath, detached: true, stdio: 'ignore' })
      child.on('error', () => tryNext(i + 1))
      child.unref()
    }
    tryNext(0)
  },

  // Windows: list available drive roots (C:\, D:\, …). Empty on other platforms.
  listDrives: async () => {
    if (platform() !== 'win32') return []
    const drives = []
    for (let c = 67; c <= 90; c++) {  // C..Z — skip A:/B: to avoid empty-floppy probes
      const root = `${String.fromCharCode(c)}:\\`
      try {
        await stat(root)
        drives.push(root)
      } catch {}
    }
    return drives
  },

  // Krypta soft-delete: moves to ~/.krypta-trash/<key>/<originalName>, returns a key for undo.
  // The item keeps its original name inside a uniquely-keyed subfolder so that, when later
  // flushed to the OS trash, the Recycle Bin shows the real name (not a timestamped key).
  kryptaTrash: async (filePath) => {
    await ensureTrashDirs()
    const name = basename(filePath)
    const key = `${name}-${Date.now()}`
    const keyDir = join(TRASH_FILES, key)
    await mkdir(keyDir, { recursive: true })
    const dest = join(keyDir, name)
    try {
      await rename(filePath, dest)
    } catch (e) {
      if (e.code === 'EXDEV') {
        await cp(filePath, dest, { recursive: true })
        await rm(filePath, { recursive: true })
      } else {
        throw e
      }
    }
    await writeFile(
      join(TRASH_INFO, `${key}.json`),
      JSON.stringify({ originalPath: filePath, trashedAt: Date.now() })
    )
    return key
  },

  // Restore a soft-deleted item back to its original path
  kryptaRestore: async (key) => {
    const infoPath = join(TRASH_INFO, `${key}.json`)
    const { originalPath } = JSON.parse(await readFile(infoPath, 'utf8'))
    const src = join(TRASH_FILES, key, basename(originalPath))
    await mkdir(dirname(originalPath), { recursive: true })
    try {
      await rename(src, originalPath)
    } catch (e) {
      if (e.code === 'EXDEV') {
        await cp(src, originalPath, { recursive: true })
        await rm(src, { recursive: true })
      } else {
        throw e
      }
    }
    await rm(join(TRASH_FILES, key), { recursive: true }).catch(() => {})
    await rm(infoPath)
  },

  // Move all remaining krypta trash items to OS trash. Runs in the main process —
  // shell.trashItem is unreliable from the renderer/preload context.
  flushKryptaTrash: () => ipcRenderer.invoke('flush-krypta-trash'),

  getGitInfo: async (dirPath) => {
    let dir = dirPath
    while (true) {
      try {
        await stat(join(dir, '.git'))
        const head = await readFile(join(dir, '.git', 'HEAD'), 'utf8')
        const match = head.trim().match(/^ref: refs\/heads\/(.+)$/)
        const branch = match ? match[1] : head.trim().slice(0, 7)
        return { root: dir, branch }
      } catch {
        const parent = dirname(dir)
        if (parent === dir) return null
        dir = parent
      }
    }
  },

  checkMarkers: async (parentPath, dirNames) => {
    return Promise.all(dirNames.map(async name => {
      const markers = []
      try { await stat(join(parentPath, name, '.git')); markers.push('git') } catch {}
      return { name, markers }
    }))
  },

  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),

  window: {
    close: () => ipcRenderer.send('close-window'),
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    setAlwaysOnTop: (value) => ipcRenderer.invoke('set-always-on-top', value),
    getBounds: () => ipcRenderer.invoke('get-window-bounds'),
    setBounds: (bounds) => ipcRenderer.invoke('set-window-bounds', bounds),
  }
})
