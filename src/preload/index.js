import { contextBridge, ipcRenderer } from 'electron'
import { readdir, stat, rename, mkdir, writeFile, rm, cp, readFile } from 'fs/promises'
import { writeFileSync, mkdirSync } from 'fs'
import { join, basename, dirname, sep } from 'path'
import { homedir, platform } from 'os'
import { shell } from 'electron'
import { spawn } from 'child_process'

const TRASH_DIR = join(homedir(), '.krypta-trash')
const TRASH_FILES = join(TRASH_DIR, 'files')
const TRASH_INFO  = join(TRASH_DIR, 'info')

const CONFIG_DIR    = join(homedir(), '.config', 'krypta')
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

  readDir: async (dirPath, { showHidden = false } = {}) => {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const filtered = entries
      .filter(e => showHidden || !e.name.startsWith('.'))
      .sort((a, b) => {
        if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
        return a.name.localeCompare(b.name)
      })
    return Promise.all(filtered.map(async e => {
      let size = null, mtime = null
      try {
        const s = await stat(join(dirPath, e.name))
        size = s.size
        mtime = s.mtime.getTime()
      } catch {}
      let itemCount = null
      if (e.isDirectory()) {
        try {
          const children = await readdir(join(dirPath, e.name))
          itemCount = children.filter(n => showHidden || !n.startsWith('.')).length
        } catch {}
      }
      return { name: e.name, isDirectory: e.isDirectory(), size, mtime, itemCount }
    }))
  },

  searchFiles: (rootDir, opts = {}) => ipcRenderer.invoke('search-files', rootDir, opts),

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

  move: (src, dest) => rename(src, dest),
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
    if (process.env.TERMINAL) {
      spawn(process.env.TERMINAL, [], { cwd: dirPath, detached: true, stdio: 'ignore' }).unref()
      return
    }
    const candidates = [
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
      const child = spawn(cmd, args, { detached: true, stdio: 'ignore' })
      child.on('error', () => tryNext(i + 1))
      child.unref()
    }
    tryNext(0)
  },

  // Krypta soft-delete: moves to ~/.krypta-trash/, returns a key for undo
  kryptaTrash: async (filePath) => {
    await ensureTrashDirs()
    const name = basename(filePath)
    const key = `${name}-${Date.now()}`
    const dest = join(TRASH_FILES, key)
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
    await mkdir(dirname(originalPath), { recursive: true })
    try {
      await rename(join(TRASH_FILES, key), originalPath)
    } catch (e) {
      if (e.code === 'EXDEV') {
        await cp(join(TRASH_FILES, key), originalPath, { recursive: true })
        await rm(join(TRASH_FILES, key), { recursive: true })
      } else {
        throw e
      }
    }
    await rm(infoPath)
  },

  // Move all remaining krypta trash items to OS trash (called on exit and startup)
  flushKryptaTrash: async () => {
    try {
      await ensureTrashDirs()
      const keys = await readdir(TRASH_FILES)
      await Promise.all(keys.map(async key => {
        try {
          await shell.trashItem(join(TRASH_FILES, key))
          await rm(join(TRASH_INFO, `${key}.json`)).catch(() => {})
        } catch {}
      }))
    } catch {}
  },

  window: {
    close: () => ipcRenderer.send('close-window'),
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window'),
    getBounds: () => ipcRenderer.invoke('get-window-bounds'),
    setBounds: (bounds) => ipcRenderer.invoke('set-window-bounds', bounds),
  }
})
