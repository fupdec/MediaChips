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

export {pickDefaultSurvivorId} from '../../shared/mediaMerge'
export type {MediaSurvivorCandidate} from '../../shared/mediaMerge'

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
  const views = Math.max(0, ...all.map((row) => Number(row.views || 0)))

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
