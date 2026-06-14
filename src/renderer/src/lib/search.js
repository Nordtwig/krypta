import Fuse from 'fuse.js'

const fuseOptions = {
  keys: ['name'],
  threshold: 0.4,
  includeScore: true,
  includeMatches: true,
  findAllMatches: true,
  minMatchCharLength: 1,
}

// Cache: root → { entries, fuse, ts }
const cache = new Map()
const CACHE_TTL = 60_000

export async function buildIndex(root, opts = {}) {
  const cached = cache.get(root)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached

  const entries = await window.krypta.searchFiles(root, opts)
  const fuse = new Fuse(entries, fuseOptions)
  const record = { entries, fuse, ts: Date.now() }
  cache.set(root, record)
  return record
}

export function query(index, searchQuery, localDir) {
  if (!searchQuery.trim()) return []

  const raw = index.fuse.search(searchQuery)

  // Boost results inside the current pane's dir to the top
  raw.sort((a, b) => {
    const aLocal = a.item.path.startsWith(localDir) ? 0 : 1
    const bLocal = b.item.path.startsWith(localDir) ? 0 : 1
    if (aLocal !== bLocal) return aLocal - bLocal
    const aDir = a.item.isDirectory ? 1 : 0
    const bDir = b.item.isDirectory ? 1 : 0
    if (aDir !== bDir) return aDir - bDir
    return (a.score ?? 1) - (b.score ?? 1)
  })

  return raw.map(r => ({
    name: r.item.name,
    path: r.item.path,
    isDirectory: r.item.isDirectory,
    matches: r.matches,
  }))
}

export function invalidateCache(root) {
  cache.delete(root)
}

export function highlightSegments(name, matches) {
  const hit = matches?.find(m => m.key === 'name')
  if (!hit?.indices?.length) return null
  const segs = []
  let last = 0
  for (const [s, e] of hit.indices) {
    if (s > last) segs.push({ text: name.slice(last, s), hi: false })
    segs.push({ text: name.slice(s, e + 1), hi: true })
    last = e + 1
  }
  if (last < name.length) segs.push({ text: name.slice(last), hi: false })
  return segs
}

export function shortenPath(relPath) {
  if (!relPath || relPath === '~' || relPath === '—') return relPath
  const inner = relPath.startsWith('~/') ? relPath.slice(2) : relPath
  const parts = inner.split('/').filter(Boolean)
  if (parts.length <= 3) return relPath
  return '~/…/' + parts.slice(-2).join('/')
}
