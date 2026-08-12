import {
  isPathInsideFolder,
  normalizeMediaPath,
  pathsEquivalent,
} from './normalizeUserPath'

export function parseExcludedPathsJson(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }

  if (typeof value !== 'string' || !value.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  } catch {
    return []
  }
}

export function serializeExcludedPaths(paths: string[]): string | null {
  if (!paths.length) {
    return null
  }
  return JSON.stringify(paths)
}

/**
 * Keep unique normalized paths that are strict children of `rootPath`.
 * The root itself and paths outside the root are dropped.
 */
export function normalizeExcludedPaths(
  rootPath: string,
  paths: unknown,
): string[] {
  const root = normalizeMediaPath(String(rootPath || ''))
  if (!root) {
    return []
  }

  const incoming = Array.isArray(paths)
    ? paths
    : typeof paths === 'string'
      ? parseExcludedPathsJson(paths)
      : []

  const unique = new Map<string, string>()

  for (const raw of incoming) {
    if (typeof raw !== 'string') continue
    let normalized = normalizeMediaPath(raw.trim())
    if (!normalized) continue
    // Drop trailing separators so `/tmp` and `/tmp/` collide.
    if (normalized.length > 1) {
      normalized = normalized.replace(/[\\/]+$/, '')
    }
    if (!isPathInsideFolder(normalized, root)) continue

    const key = normalized.toLowerCase()
    if (!unique.has(key)) {
      unique.set(key, normalized)
    }
  }

  return [...unique.values()]
}

/** True when `filePath` is the exclude path itself or nested under it. */
export function isPathUnderExcluded(
  filePath: string,
  excludedPaths: string[] | null | undefined,
): boolean {
  if (!excludedPaths?.length) {
    return false
  }

  const target = normalizeMediaPath(filePath)
  if (!target) {
    return false
  }

  for (const excluded of excludedPaths) {
    if (!excluded) continue
    if (pathsEquivalent(target, excluded)) {
      return true
    }
    if (isPathInsideFolder(target, excluded)) {
      return true
    }
  }

  return false
}
