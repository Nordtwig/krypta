import sevenBin from '7zip-bin'
import Seven from 'node-7z'
import { spawn } from 'child_process'
import { mkdtemp, readdir, rm, rename, cp, mkdir } from 'fs/promises'
import { tmpdir } from 'os'
import { join, basename } from 'path'

const path7za = sevenBin.path7za

// Canonical set of extensions Krypta treats as a browsable/scryable archive.
// Deliberately NARROWER than fileIcons.js's FileArchive set — iso/dmg/deb/rpm/img
// get the archive icon but are out of scope for browse. Keep these in sync with
// any renderer-side copy when Scry/browse land.
export const ARCHIVE_EXTS = new Set([
  'zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'rar',
])

// A gz/bz2/xz layer wrapping a tar: listing the outer yields a single `.tar`
// that must be descended into to reach the real entries.
const COMPOUND_TAR_RE = /\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz)$/i

export function isArchivePath(name) {
  const lower = name.toLowerCase()
  if (COMPOUND_TAR_RE.test(lower)) return true
  const ext = lower.includes('.') ? lower.split('.').pop() : ''
  return ARCHIVE_EXTS.has(ext)
}

function run(method, ...args) {
  return new Promise((resolve, reject) => {
    const out = []
    const stream = Seven[method](...args)
    stream.on('data', (d) => out.push(d))
    stream.on('end', () => resolve(out))
    stream.on('error', reject)
  })
}

function mapEntries(raw) {
  const entries = []
  for (const e of raw) {
    const p = (e.file || '').replace(/^\.\//, '').replace(/\/+$/, '')
    if (!p || p === '.') continue
    entries.push({
      path: p,
      isDirectory: typeof e.attributes === 'string' && e.attributes[0] === 'D',
      size: typeof e.size === 'number' ? e.size : null,
      mtime: e.datetime ? new Date(e.datetime).getTime() : null,
    })
  }
  return entries
}

// List an archive's full entry set without extracting (reads the central
// directory for zip; streams for tar). Compound tar.* auto-descends one layer.
// Throws on corrupt/unreadable archives — caller surfaces the error.
export async function listArchive(filePath) {
  if (COMPOUND_TAR_RE.test(filePath)) {
    const tmp = await mkdtemp(join(tmpdir(), 'krypta-arc-'))
    try {
      await run('extractFull', filePath, tmp, { $bin: path7za })
      const inner = (await readdir(tmp)).find((n) => n.toLowerCase().endsWith('.tar'))
      if (!inner) return []
      return mapEntries(await run('list', join(tmp, inner), { $bin: path7za }))
    } finally {
      rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
  }
  return mapEntries(await run('list', filePath, { $bin: path7za }))
}

// Spawn 7za directly — node-7z's $cherryPicked option does NOT actually filter
// (it extracts the whole archive), so we drive the binary ourselves to extract
// only the entries we want.
function spawn7za(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(path7za, args)
    let err = ''
    p.stderr?.on('data', (d) => { err += d })
    p.on('error', reject)
    p.on('close', (code) => code === 0
      ? resolve()
      : reject(new Error(`7za exited ${code}${err ? ': ' + err.trim().split('\n').pop() : ''}`)))
  })
}

// Compound tar.* must be decompressed to its inner .tar first; run `fn` against
// the archive 7za can cherry-pick from (the original, or the extracted inner tar).
async function withSourceArchive(archivePath, fn) {
  if (!COMPOUND_TAR_RE.test(archivePath)) return fn(archivePath)
  const tmp = await mkdtemp(join(tmpdir(), 'krypta-arc-'))
  try {
    await spawn7za(['x', archivePath, '-o' + tmp, '-y'])
    const inner = (await readdir(tmp)).find((n) => n.toLowerCase().endsWith('.tar'))
    if (!inner) throw new Error('no inner tar')
    return await fn(join(tmp, inner))
  } finally {
    rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

async function moveAcross(from, to) {
  try {
    await rename(from, to)
  } catch (e) {
    if (e.code === 'EXDEV') {  // staging tmp and destDir on different filesystems
      await cp(from, to, { recursive: true })
      await rm(from, { recursive: true, force: true })
    } else throw e
  }
}

// Extract a single FILE entry, flattened to destDir/<basename>. Returns its path.
// Used to open a file from inside an archive. (`7za e` flattens.)
export async function extractEntry(archivePath, innerPath, destDir) {
  if (innerPath.split(/[\\/]/).includes('..')) throw new Error('unsafe entry path')
  await mkdir(destDir, { recursive: true })
  return withSourceArchive(archivePath, async (src) => {
    // pass bare + ./-prefixed pattern — tar entries are ./-prefixed, zip's aren't
    await spawn7za(['e', src, '-o' + destDir, innerPath, './' + innerPath, '-y'])
    return join(destDir, basename(innerPath))
  })
}

// Extract entries OUT of an archive into a real folder (drag-out). Each item lands
// at destDir/<basename>: files flattened (`7za e`), folders extracted with their
// subtree then moved up so the parent path isn't recreated. isDirectory is resolved
// from the archive listing so the renderer needn't carry per-item type info.
export async function extractItems(archivePath, innerPaths, destDir) {
  await mkdir(destDir, { recursive: true })
  const entries = await listArchive(archivePath)
  const isDir = (p) => entries.some((e) => e.path === p && e.isDirectory) || entries.some((e) => e.path.startsWith(p + '/'))
  return withSourceArchive(archivePath, async (src) => {
    for (const innerPath of innerPaths) {
      if (innerPath.split(/[\\/]/).includes('..')) continue
      if (isDir(innerPath)) {
        const staging = await mkdtemp(join(tmpdir(), 'krypta-arc-'))
        try {
          await spawn7za(['x', src, '-o' + staging, innerPath + '/*', './' + innerPath + '/*', '-r', '-y'])
          await moveAcross(join(staging, innerPath), join(destDir, basename(innerPath)))
        } finally {
          rm(staging, { recursive: true, force: true }).catch(() => {})
        }
      } else {
        await spawn7za(['e', src, '-o' + destDir, innerPath, './' + innerPath, '-y'])
      }
    }
  })
}
