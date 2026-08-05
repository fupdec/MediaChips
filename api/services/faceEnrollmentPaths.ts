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

/** Order discovered tag images: preferred suffixes first, then the rest. */
export function orderFoundTagImages(found: Map<string, string>): string[] {
  const ordered: string[] = []
  const remaining = new Map(found)
  for (const key of TAG_IMAGE_PREFERRED_ORDER) {
    const item = remaining.get(key)
    if (item) {
      ordered.push(item)
      remaining.delete(key)
    }
  }
  for (const item of remaining.values()) ordered.push(item)
  return ordered
}

export function findTagImagePaths(dbPath: string, metaId: number, tagId: number): string[] {
  const base = path.join(dbPath, 'meta', String(metaId))
  if (!fs.existsSync(base)) return []

  const prefix = `${tagId}_`
  const found = new Map<string, string>()

  for (const name of fs.readdirSync(base)) {
    if (!name.startsWith(prefix) || !/\.jpe?g$/i.test(name)) continue
    const absolute = path.join(base, name)
    if (!fs.statSync(absolute).isFile()) continue
    const suffix = name.slice(prefix.length).replace(/\.jpe?g$/i, '').toLowerCase()
    found.set(suffix, absolute)
  }

  return orderFoundTagImages(found)
}

export function toEnrollmentSourcePath(dbPath: string, imagePath: string): string {
  if (dbPath && imagePath.startsWith(dbPath)) {
    return path.relative(dbPath, imagePath)
  }
  return imagePath
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
