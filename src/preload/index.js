import { contextBridge, ipcRenderer } from 'electron'
import { readdir, stat, rename, mkdir, writeFile, rm } from 'fs/promises'
import { join, basename, dirname, sep } from 'path'
import { homedir, platform } from 'os'
import { shell } from 'electron'

contextBridge.exposeInMainWorld('krypta', {
  homeDir: homedir(),
  sep,
  platform: platform(),

  readDir: async (dirPath) => {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const filtered = entries
      .filter(e => !e.name.startsWith('.'))
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
          itemCount = children.filter(n => !n.startsWith('.')).length
        } catch {}
      }
      return { name: e.name, isDirectory: e.isDirectory(), size, mtime, itemCount }
    }))
  },

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
    return { size: s.size, mtime: s.mtime }
  },

  isRoot: (dirPath) => {
    return dirname(dirPath) === dirPath
  },

  parentDir: (dirPath) => {
    return dirname(dirPath)
  },

  joinPath: (...parts) => join(...parts),

  move: (src, dest) => rename(src, dest),
  createFile: (filePath) => writeFile(filePath, ''),
  createDir: (dirPath) => mkdir(dirPath),
  delete: (filePath, recursive = false) => rm(filePath, { recursive }),
  openFile: (filePath) => shell.openPath(filePath),

  window: {
    close: () => ipcRenderer.send('close-window'),
    minimize: () => ipcRenderer.send('minimize-window'),
    maximize: () => ipcRenderer.send('maximize-window')
  }
})
