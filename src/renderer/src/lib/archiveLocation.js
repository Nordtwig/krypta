// Virtual-path model for browsing *inside* an archive.
//
// A location inside an archive is encoded in the single `currentDir` string as:
//   <realArchivePath>\x00<innerPath>
// The null char is the separator — it can never appear in a real filesystem path,
// so parsing is unambiguous and session persistence/round-tripping just works.
// Everything that consumes `currentDir` asks these helpers instead of splitting
// paths by hand. When NOT in an archive, currentDir is an ordinary path and these
// helpers report inArchive: false.

const SEP = '\x00'

export function parseLocation(dir) {
  const i = dir.indexOf(SEP)
  if (i === -1) return { inArchive: false, archivePath: dir, innerPath: '' }
  return { inArchive: true, archivePath: dir.slice(0, i), innerPath: dir.slice(i + 1) }
}

/** Build the location string for the root of an archive (its top level). */
export function enterArchive(archivePath) {
  return archivePath + SEP
}

/** Descend into a child (dir name) of the current inner path. */
export function joinInner(dir, name) {
  const { archivePath, innerPath } = parseLocation(dir)
  const next = innerPath ? innerPath + '/' + name : name
  return archivePath + SEP + next
}

/**
 * Go up one level. From an inner subfolder → its parent inner folder. From the
 * archive root → out of the archive, back to the real path of the archive file.
 */
export function parentLocation(dir) {
  const { archivePath, innerPath } = parseLocation(dir)
  if (!innerPath) return archivePath // exit the archive
  const slash = innerPath.lastIndexOf('/')
  return slash === -1 ? archivePath + SEP : archivePath + SEP + innerPath.slice(0, slash)
}

/** The name to re-select after going up (the folder/archive we came from). */
export function locationBaseName(dir) {
  const { archivePath, innerPath } = parseLocation(dir)
  if (!innerPath) {
    // at archive root → the thing we came from is the archive file itself
    const parts = archivePath.split(/[/\\]/).filter(Boolean)
    return parts.at(-1) ?? archivePath
  }
  const slash = innerPath.lastIndexOf('/')
  return slash === -1 ? innerPath : innerPath.slice(slash + 1)
}

/** Human-readable form of a location: `/path/foo.zip/inner/dir` (no `\x00`). */
export function displayPath(dir) {
  const { inArchive, archivePath, innerPath } = parseLocation(dir)
  if (!inArchive) return dir
  return innerPath ? archivePath + '/' + innerPath : archivePath
}

/** Reduce a flat archive entry list to the direct children of `innerPath`. */
export function directChildren(entries, innerPath) {
  const prefix = innerPath ? innerPath + '/' : ''
  const out = new Map()
  for (const e of entries) {
    if (prefix && !e.path.startsWith(prefix)) continue
    const rest = e.path.slice(prefix.length)
    if (!rest) continue
    const slash = rest.indexOf('/')
    if (slash === -1) {
      // direct entry — explicit listing wins over any synthesized placeholder
      out.set(rest, { name: rest, isDirectory: e.isDirectory, size: e.size, mtime: e.mtime, itemCount: null })
    } else {
      // nested — synthesize the intermediate dir if the archive omitted it
      const dirName = rest.slice(0, slash)
      if (!out.has(dirName)) out.set(dirName, { name: dirName, isDirectory: true, size: null, mtime: null, itemCount: null })
    }
  }
  return [...out.values()]
}
