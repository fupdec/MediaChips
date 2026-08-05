import fs from 'fs'
import path from 'path'

/** Preferred performer tag image suffixes (main first). */
export const TAG_IMAGE_PREFERRED_ORDER = [
  'main',
  'avatar',
  'alt',
  'custom1',
  'custom2',
  'header',
] as const

export type TagImageEntry = {
  type: string
  absolutePath: string
  sourcePath: string
}

/** Order discovered tag images: preferred suffixes first, then the rest. */
export function orderFoundTagImages(found: Map<string, string>): string[] {
  return orderFoundTagImageEntries(found, '').map((entry) => entry.absolutePath)
}

function orderFoundTagImageEntries(
  found: Map<string, string>,
  dbPath: string,
): TagImageEntry[] {
  const ordered: TagImageEntry[] = []
  const remaining = new Map(found)
  const push = (type: string, absolutePath: string) => {
    ordered.push({
      type,
      absolutePath,
      sourcePath: dbPath
        ? path.relative(dbPath, absolutePath).split(path.sep).join('/')
        : absolutePath,
    })
  }
  for (const key of TAG_IMAGE_PREFERRED_ORDER) {
    const item = remaining.get(key)
    if (item) {
      push(key, item)
      remaining.delete(key)
    }
  }
  for (const [type, item] of remaining) push(type, item)
  return ordered
}

function scanTagImageMap(dbPath: string, metaId: number, tagId: number): Map<string, string> {
  const base = path.join(dbPath, 'meta', String(metaId))
  if (!fs.existsSync(base)) return new Map()

  const prefix = `${tagId}_`
  const found = new Map<string, string>()

  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith(prefix) || !/\.jpe?g$/i.test(name)) continue
    const absolute = path.join(base, name)
    if (!fs.statSync(absolute).isFile()) continue
    const suffix = name.slice(prefix.length).replace(/\.jpe?g$/i, '').toLowerCase()
    found.set(suffix, absolute)
  }

  return found
}

export function findTagImageEntries(
  dbPath: string,
  metaId: number,
  tagId: number,
): TagImageEntry[] {
  return orderFoundTagImageEntries(scanTagImageMap(dbPath, metaId, tagId), dbPath)
}

export function findTagImagePaths(dbPath: string, metaId: number, tagId: number): string[] {
  return findTagImageEntries(dbPath, metaId, tagId).map((entry) => entry.absolutePath)
}

export function toEnrollmentSourcePath(dbPath: string, imagePath: string): string {
  if (dbPath && imagePath.startsWith(dbPath)) {
    return path.relative(dbPath, imagePath)
  }
  return imagePath
}

/** Collect non-empty enrollment sourcePath values from DB rows. */
export function collectEnrollmentSourcePaths(
  rows: Array<{sourcePath?: string | null}>,
): Set<string> {
  return new Set(rows.map((row) => String(row.sourcePath || '')).filter(Boolean))
}

export function filterPendingEnrollmentPaths(input: {
  imagePaths: string[]
  existingSourcePaths: Iterable<string>
  dbPath: string
  force?: boolean
}): string[] {
  if (input.force) return [...input.imagePaths]
  const existing = new Set(
    [...input.existingSourcePaths].map(String).filter(Boolean),
  )
  return input.imagePaths.filter((imagePath) => {
    const sourcePath = toEnrollmentSourcePath(input.dbPath, imagePath)
    return !existing.has(sourcePath) && !existing.has(imagePath)
  })
}

export function collectExistingEmbeddings(
  rows: Array<{embedding?: string | null}>,
  embeddingFromJson: (value: string) => Float32Array,
): Float32Array[] {
  const embeddings: Float32Array[] = []
  for (const row of rows) {
    if (row.embedding == null || row.embedding === '') continue
    try {
      embeddings.push(embeddingFromJson(String(row.embedding)))
    } catch {
      // Ignore corrupt rows.
    }
  }
  return embeddings
}

export function resolveAbsoluteCropPath(
  dbPath: string,
  cropPath: string | null | undefined,
): string | null {
  if (!cropPath) return null
  if (path.isAbsolute(cropPath)) return fs.existsSync(cropPath) ? cropPath : null
  const absolute = path.join(dbPath, cropPath)
  return fs.existsSync(absolute) ? absolute : null
}
