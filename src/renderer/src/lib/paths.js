// Cross-platform path helpers for the renderer.
//
// All real path resolution (join / dirname / root detection) is delegated to
// window.krypta.* which wraps Node's `path` module and is correct on every OS.
// These helpers only cover renderer-side display/structure concerns —
// breadcrumb segments, ~ substitution, and "is path under dir" checks — using
// the platform separator instead of a hardcoded '/'.

export const sep = window.krypta.sep
export const isWindows = window.krypta.platform === 'win32'

// On Windows, typed paths and some stored values may use either separator;
// match both when splitting for display.
const SPLIT_RE = /[/\\]+/

/** Index of the last separator (either / or \) in a typed string, or -1. */
export function lastSepIndex(s) {
  return Math.max(s.lastIndexOf('/'), s.lastIndexOf('\\'))
}

/** Last path segment (basename), separator-aware. */
export function baseName(p) {
  const parts = p.split(SPLIT_RE).filter(Boolean)
  return parts.at(-1) ?? p
}

/** True if `p` is `dir` itself or nested under it. */
export function isUnder(p, dir) {
  if (p === dir) return true
  return p.startsWith(dir.endsWith(sep) ? dir : dir + sep)
}

/** Replace the home dir prefix with ~ (separator-aware). */
export function relHome(p) {
  const home = window.krypta.homeDir
  if (p === home) return '~'
  return isUnder(p, home) ? '~' + p.slice(home.length) : p
}

/**
 * Build clickable breadcrumb segments by walking up the tree via the
 * platform-correct parentDir/isRoot, so the root is `/` on POSIX and the
 * drive (e.g. `C:\`) on Windows.
 */
export function getBreadcrumbs(dir) {
  const crumbs = []
  let p = dir
  let guard = 0
  while (guard++ < 256) {
    if (window.krypta.isRoot(p)) {
      crumbs.unshift({ name: p, path: p })
      break
    }
    const parent = window.krypta.parentDir(p)
    if (parent === p) {  // safety: dirname stopped advancing
      crumbs.unshift({ name: p, path: p })
      break
    }
    let name = p.slice(parent.length)
    while (name.startsWith(sep) || name.startsWith('/')) name = name.slice(1)
    crumbs.unshift({ name, path: p })
    p = parent
  }
  return crumbs
}
