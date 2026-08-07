import {uniqueByKey} from '../utils/uniqueIds'

export function remapMediaTagLinksToSurvivor(
  rows: Array<{mediaId: number, tagId: number, metaId: number}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      mediaId: survivorId,
      tagId: row.tagId,
      metaId: row.metaId,
    })),
    (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
  )
}

export function planMediaValuesToInsert(
  sourceValues: Array<{metaId: number, value: string | null}>,
  survivorId: number,
  survivorMetaIds: Set<number>,
) {
  const valuesToInsert: Array<{mediaId: number, metaId: number, value: string | null}> = []
  const seenMetaIds = new Set<number>()
  for (const row of sourceValues) {
    if (survivorMetaIds.has(row.metaId) || seenMetaIds.has(row.metaId)) continue
    seenMetaIds.add(row.metaId)
    valuesToInsert.push({
      mediaId: survivorId,
      metaId: row.metaId,
      value: row.value,
    })
  }
  return valuesToInsert
}

export function remapPlaylistLinksToSurvivor(
  rows: Array<{mediaId: number, playlistId: number, order: number | null}>,
  survivorId: number,
) {
  return uniqueByKey(
    rows.map((row) => ({
      mediaId: survivorId,
      playlistId: row.playlistId,
      order: row.order,
    })),
    (row) => `${row.mediaId}:${row.playlistId}`,
  )
}

export {pickDefaultSurvivorId, resolutionScoreForMedia} from '../../shared/mediaMerge'
export type {MediaSurvivorCandidate} from '../../shared/mediaMerge'

/** Near-duplicate marks on the same survivor: same type/tag within ~1.5s → keep the richer one. */
export function planNearDuplicateMarkIdsToDelete(
  rows: Array<{
    id: number
    type?: string | null
    tagId?: number | null
    time?: number | null
    end?: number | null
    text?: string | null
  }>,
  windowSec = 1.5,
): number[] {
  const toDelete = new Set<number>()
  const groups = new Map<string, typeof rows>()

  for (const row of rows) {
    const key = `${String(row.type || '')}:${row.tagId == null ? '' : Number(row.tagId)}`
    const list = groups.get(key) || []
    list.push(row)
    groups.set(key, list)
  }

  const richness = (row: (typeof rows)[number]) => {
    const start = Number(row.time) || 0
    const end = row.end == null ? null : Number(row.end)
    const duration = end != null && Number.isFinite(end) ? Math.max(0, end - start) : 0
    const textLen = String(row.text || '').trim().length
    return (duration > 0 ? 1000 + duration : 0) + (textLen > 0 ? 10 + textLen : 0) + (row.tagId != null ? 1 : 0)
  }

  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => (Number(a.time) || 0) - (Number(b.time) || 0))
    for (let i = 0; i < sorted.length; i++) {
      if (toDelete.has(sorted[i].id)) continue
      for (let j = i + 1; j < sorted.length; j++) {
        if (toDelete.has(sorted[j].id)) continue
        const gap = Math.abs((Number(sorted[j].time) || 0) - (Number(sorted[i].time) || 0))
        if (gap > windowSec) break
        if (richness(sorted[i]) >= richness(sorted[j])) {
          toDelete.add(sorted[j].id)
        } else {
          toDelete.add(sorted[i].id)
          break
        }
      }
    }
  }

  return [...toDelete]
}

export function foldMediaPresetFields(
  survivor: {
    favorite?: boolean | number | null
    rating?: number | null
    views?: number | null
    viewedAt?: string | null
    bookmark?: string | null
    createdAt?: string | null
  },
  sources: Array<{
    favorite?: boolean | number | null
    rating?: number | null
    views?: number | null
    viewedAt?: string | null
    bookmark?: string | null
    createdAt?: string | null
  }>,
) {
  const all = [survivor, ...sources]
  const favorite = all.some((row) => Boolean(row.favorite))
  const rating = Math.max(0, ...all.map((row) => Number(row.rating || 0)))
  const views = all.reduce((sum, row) => sum + Math.max(0, Number(row.views || 0)), 0)

  let viewedAt: string | null = survivor.viewedAt ?? null
  for (const row of sources) {
    const value = row.viewedAt ?? null
    if (!value) continue
    if (!viewedAt || value > viewedAt) viewedAt = value
  }

  let bookmark = survivor.bookmark != null && String(survivor.bookmark).trim() !== ''
    ? String(survivor.bookmark)
    : null
  if (!bookmark) {
    for (const row of sources) {
      const value = row.bookmark != null ? String(row.bookmark).trim() : ''
      if (value) {
        bookmark = value
        break
      }
    }
  }

  let createdAt = String(survivor.createdAt || '')
  for (const row of sources) {
    const value = String(row.createdAt || '')
    if (!value) continue
    if (!createdAt || value < createdAt) createdAt = value
  }

  return {
    favorite,
    rating,
    views,
    viewedAt,
    bookmark,
    createdAt: createdAt || String(survivor.createdAt || ''),
  }
}
