import type {AnyRecord} from '../types/db'
import type {OldIdMapping} from '../types/migration'

export function normalizeLegacyId(value: unknown): string {
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : String(value)
  }
  const raw = String(value)
  return /^\d+\.0+$/.test(raw) ? String(Number.parseInt(raw, 10)) : raw
}

export function sameOldId(a: unknown, b: unknown): boolean {
  return normalizeLegacyId(a) === normalizeLegacyId(b)
}

/** Trim-only path key for LowDB path uniqueness (not filesystem normalize). */
export function normalizeLegacyMediaPath(pathValue: unknown): string {
  return String(pathValue ?? '').trim()
}

/**
 * Legacy LowDB libraries sometimes contain duplicate paths (and blank paths).
 * SQLite media.path is unique, so keep one row per path and alias other oldIds
 * onto the kept row so playlists/marks/meta still resolve.
 */
export function dedupeLegacyVideosByPath(videos: AnyRecord[]): {
  videos: AnyRecord[]
  oldIdAliases: Map<string, string>
} {
  const videosByPath = new Map<string, AnyRecord>()
  const oldIdAliases = new Map<string, string>()
  const blankPathVideos: AnyRecord[] = []

  for (const video of videos) {
    const pathKey = normalizeLegacyMediaPath(video.path)
    const oldId = normalizeLegacyId(video.oldId)
    if (!pathKey) {
      blankPathVideos.push(video)
      continue
    }

    const existing = videosByPath.get(pathKey)
    if (!existing) {
      videosByPath.set(pathKey, video)
      continue
    }

    const keptOldId = normalizeLegacyId(existing.oldId)
    if (oldId && keptOldId && oldId !== keptOldId) {
      oldIdAliases.set(oldId, keptOldId)
    }
  }

  // Blank paths would all collide on '' — keep one and alias the rest.
  if (blankPathVideos.length) {
    const [kept, ...duplicates] = blankPathVideos
    const keptOldId = normalizeLegacyId(kept.oldId)
    for (const duplicate of duplicates) {
      const oldId = normalizeLegacyId(duplicate.oldId)
      if (oldId && keptOldId && oldId !== keptOldId) {
        oldIdAliases.set(oldId, keptOldId)
      }
    }
    return {
      videos: [...videosByPath.values(), kept],
      oldIdAliases,
    }
  }

  return {
    videos: [...videosByPath.values()],
    oldIdAliases,
  }
}

export function expandMediaIdMappings(
  mediaIds: OldIdMapping[],
  oldIdAliases: Map<string, string>,
): OldIdMapping[] {
  if (!oldIdAliases.size) return mediaIds

  const byOldId = new Map(
    mediaIds
      .filter((row) => row.oldId != null && row.oldId !== '')
      .map((row) => [normalizeLegacyId(row.oldId), row]),
  )

  const expanded = [...mediaIds]
  for (const [aliasOldId, canonicalOldId] of oldIdAliases) {
    if (byOldId.has(aliasOldId)) continue
    const canonical = byOldId.get(normalizeLegacyId(canonicalOldId))
    if (!canonical) continue
    expanded.push({id: canonical.id, oldId: aliasOldId})
  }
  return expanded
}

export function dedupeByMediaId<T extends {mediaId: number}>(rows: T[]): T[] {
  const byMediaId = new Map<number, T>()
  for (const row of rows) {
    if (!byMediaId.has(row.mediaId)) byMediaId.set(row.mediaId, row)
  }
  return [...byMediaId.values()]
}
