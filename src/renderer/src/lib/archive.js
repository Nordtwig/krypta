// Renderer-side archive detection. Mirrors the canonical set in src/main/archive.js
// (ARCHIVE_EXTS) — keep the two in sync. Deliberately narrower than fileIcons.js's
// FileArchive icon set: iso/dmg/deb/rpm/img get the icon but aren't browsable here.
const ARCHIVE_EXTS = new Set([
  'zip', '7z', 'tar', 'gz', 'tgz', 'bz2', 'tbz2', 'xz', 'txz', 'rar',
])

const COMPOUND_TAR_RE = /\.(tar\.(gz|bz2|xz)|tgz|tbz2?|txz)$/i

export function isArchivePath(name) {
  const lower = name.toLowerCase()
  if (COMPOUND_TAR_RE.test(lower)) return true
  const ext = lower.includes('.') ? lower.split('.').pop() : ''
  return ARCHIVE_EXTS.has(ext)
}
