import Fuse from 'fuse.js'

const fuseOptions = (threshold) => ({
  keys: ['name'],
  threshold,
  includeScore: true,
  includeMatches: true,
  findAllMatches: true,
  minMatchCharLength: 1,
})

const cache = new Map()
const CACHE_TTL = 60_000

const EXT_GROUPS = {
  images: ['jpg','jpeg','png','gif','webp','svg','avif','bmp','ico','tiff','heic','raw'],
  img:    ['jpg','jpeg','png','gif','webp','svg','avif','bmp','ico','tiff','heic','raw'],
  code:   ['js','ts','jsx','tsx','svelte','vue','py','rs','go','c','cpp','h','hpp','cs','java','rb','php','swift','kt','sh','bash','zsh','fish','css','scss','sass','less','html','xml','json','yaml','yml','toml','sql','lua','r','jl','ex','exs','clj','hs','elm','dart','pl','nim','zig'],
  docs:   ['md','txt','pdf','docx','doc','rtf','odt','pages','tex','rst','org','adoc'],
  video:  ['mp4','mkv','mov','avi','webm','flv','wmv','m4v','3gp'],
  audio:  ['mp3','flac','wav','ogg','aac','m4a','opus','wma','aiff'],
}

const TYPE_TAGS = new Set(['files','file','folders','folder','dirs','dir'])
const ALL_EXT_TAGS = new Set(Object.values(EXT_GROUPS).flat())

function fileExt(name) {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function matchesTag(result, tag) {
  const t = tag.toLowerCase()
  if (t === 'files' || t === 'file') return !result.isDirectory
  if (t === 'folders' || t === 'folder' || t === 'dirs' || t === 'dir') return result.isDirectory
  if (EXT_GROUPS[t]) return EXT_GROUPS[t].includes(fileExt(result.name))
  if (ALL_EXT_TAGS.has(t)) return fileExt(result.name) === t
  return true // unrecognized tag — no-op, pink chip already signals this
}

export function isKnownTag(tag) {
  const t = tag.toLowerCase()
  return TYPE_TAGS.has(t) || t in EXT_GROUPS || ALL_EXT_TAGS.has(t)
}

// Ordered suggestion vocabulary: friendly group names first, then individual extensions
const SUGGESTION_VOCAB = [
  'files', 'folders', 'dirs', 'images', 'code', 'docs', 'video', 'audio',
  ...new Set([...EXT_GROUPS.images, ...EXT_GROUPS.code, ...EXT_GROUPS.docs, ...EXT_GROUPS.video, ...EXT_GROUPS.audio]),
]

export function suggestTag(partial) {
  if (!partial) return null
  const p = partial.toLowerCase()
  return SUGGESTION_VOCAB.find(t => t.startsWith(p) && t !== p) ?? null
}

export async function buildIndex(root, opts = {}) {
  const cached = cache.get(root)
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached
  const entries = await window.krypta.searchFiles(root, opts)
  const fuseStrict = new Fuse(entries, fuseOptions(0.1))
  const fuseFuzzy  = new Fuse(entries, fuseOptions(0.4))
  const record = { entries, fuseStrict, fuseFuzzy, ts: Date.now() }
  cache.set(root, record)
  return record
}

export function query(index, searchQuery, localDir, tags = []) {
  const trimmed = searchQuery.trim()
  let results

  if (trimmed) {
    const fuse = trimmed.length <= 2 ? index.fuseStrict : index.fuseFuzzy
    const raw = fuse.search(trimmed)
    raw.sort((a, b) => {
      const aLocal = a.item.path.startsWith(localDir) ? 0 : 1
      const bLocal = b.item.path.startsWith(localDir) ? 0 : 1
      if (aLocal !== bLocal) return aLocal - bLocal
      const aDir = a.item.isDirectory ? 1 : 0
      const bDir = b.item.isDirectory ? 1 : 0
      if (aDir !== bDir) return aDir - bDir
      return (a.score ?? 1) - (b.score ?? 1)
    })
    results = raw.map(r => ({
      name: r.item.name,
      path: r.item.path,
      isDirectory: r.item.isDirectory,
      matches: r.matches,
    }))
  } else if (tags.length > 0) {
    const sorted = index.entries.slice().sort((a, b) => {
      const aLocal = a.path.startsWith(localDir) ? 0 : 1
      const bLocal = b.path.startsWith(localDir) ? 0 : 1
      if (aLocal !== bLocal) return aLocal - bLocal
      return (a.isDirectory ? 1 : 0) - (b.isDirectory ? 1 : 0)
    })
    results = sorted.map(e => ({ name: e.name, path: e.path, isDirectory: e.isDirectory, matches: null }))
  } else {
    return []
  }

  if (tags.length > 0) {
    results = results.filter(r => tags.every(tag => matchesTag(r, tag)))
  }

  return results
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

