/**
 * Parse media file path fields in a cross-platform way.
 *
 * path-browserify (and Node's posix path) treat `\` as a normal character, so
 * Windows paths like `D:\Videos\movie.mp4` would make basename/name the whole
 * string. Use the last `/` or `\` as the separator instead.
 */
export interface MediaPathFields {
  path: string
  basename: string
  name: string
  ext: string
}

export function parseMediaFilePath(filePath: string | null | undefined): MediaPathFields {
  const normalized = String(filePath ?? '')
  const separatorIndex = Math.max(
    normalized.lastIndexOf('/'),
    normalized.lastIndexOf('\\'),
  )
  const basename = separatorIndex >= 0
    ? normalized.slice(separatorIndex + 1)
    : normalized

  const lastDot = basename.lastIndexOf('.')
  const hasExt = lastDot > 0
  const ext = hasExt ? basename.slice(lastDot) : ''
  const name = hasExt ? basename.slice(0, lastDot) : basename

  return {
    path: normalized,
    basename,
    name,
    ext,
  }
}

/** True when a stored media name looks like a path rather than a display title. */
export function mediaNameLooksLikePath(name: string | null | undefined): boolean {
  const value = String(name ?? '')
  return value.includes('/') || value.includes('\\')
}
