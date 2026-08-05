/** Virtual media path delimiter: `/abs/archive.zip!/relative/entry.jpg` */
export const ZIP_VIRTUAL_SEP = '!/'

/**
 * True only for `something.zip!/entry` paths.
 * Ordinary folders that contain `!` (e.g. `Back Out Again!/01.jpg`) are not treated as zip paths.
 */
export function isVirtualZipPath(filePath: string | null | undefined): boolean {
  if (typeof filePath !== 'string') return false
  const idx = filePath.indexOf(ZIP_VIRTUAL_SEP)
  if (idx <= 0) return false
  const zipPart = filePath.slice(0, idx).replace(/\\/g, '/')
  return /\.zip$/i.test(zipPart)
}

export function parseVirtualZipPath(
  filePath: string | null | undefined,
): { zipPath: string; entryName: string } | null {
  if (!isVirtualZipPath(filePath)) return null

  const value = String(filePath)
  const idx = value.indexOf(ZIP_VIRTUAL_SEP)
  if (idx <= 0) return null

  const zipPath = value.slice(0, idx)
  const entryName = value
    .slice(idx + ZIP_VIRTUAL_SEP.length)
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
  if (!zipPath || !entryName) return null

  return { zipPath, entryName }
}

export function getZipArchivePath(filePath: string | null | undefined): string | null {
  return parseVirtualZipPath(filePath)?.zipPath ?? null
}

export function buildZipPathPrefix(zipPath: string): string {
  return `${zipPath}${ZIP_VIRTUAL_SEP}`
}

export function zipArchiveBasename(zipPath: string): string {
  const normalized = String(zipPath || '').replace(/\\/g, '/')
  const parts = normalized.split('/')
  return parts[parts.length - 1] || normalized
}
