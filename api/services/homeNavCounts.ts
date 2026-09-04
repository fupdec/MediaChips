import type {ApiDb, AnyRecord} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../shared/mediaTrash'
import {notInTrashSql} from '../../shared/entityTrash'
import {countMarksFiltered} from './markItemsSql'

const NAV_COUNTS_TTL_MS = 20_000

export type HomeNavCounts = {
  byType: Array<{mediaTypeId: number; count: number}>
  markers: number
  playlists: number
}

type TimedCache = {
  expiresAt: number
  value: HomeNavCounts
}

let cached: TimedCache | null = null

export function clearHomeNavCountsCache(): void {
  cached = null
}

function resolveVideoMediaTypeId(db: ApiDb): number | null {
  const row = queryGet<{id: number}>(db, `
    SELECT id FROM mediaTypes WHERE type = 'video' ORDER BY id LIMIT 1
  `)
  const id = Number(row?.id)
  return Number.isFinite(id) && id > 0 ? id : null
}

function loadHomeNavCountsUncached(db: ApiDb): HomeNavCounts {
  const byTypeRows = queryAll(db, `
    SELECT
      media.mediaTypeId AS mediaTypeId,
      COUNT(*) AS count
    FROM media
    WHERE ${MEDIA_NOT_IN_TRASH_SQL}
      AND media.mediaTypeId IS NOT NULL
    GROUP BY media.mediaTypeId
  `) as AnyRecord[]

  const byType = byTypeRows.map((row) => ({
    mediaTypeId: Number(row.mediaTypeId),
    count: Number(row.count) || 0,
  })).filter((row) => Number.isFinite(row.mediaTypeId))

  const markers = countMarksFiltered(db, {types: ['favorite', 'bookmark']})

  const staticPlaylists = Number(queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    FROM playlists
    WHERE ${notInTrashSql('playlists')}
  `)?.count ?? 0)

  const videoTypeId = resolveVideoMediaTypeId(db)
  let dynamicPlaylists = 0
  if (videoTypeId != null) {
    dynamicPlaylists = Number(queryGet<{count: number}>(db, `
      SELECT COUNT(*) AS count
      FROM savedFilters
      WHERE ${notInTrashSql('savedFilters')}
        AND name IS NOT NULL
        AND mediaTypeId = :mediaTypeId
    `, {mediaTypeId: videoTypeId})?.count ?? 0)
  }

  return {
    byType,
    markers,
    playlists: staticPlaylists + dynamicPlaylists,
  }
}

/** Slim sidebar counts — no AVG / DISTINCT tags / largest-files / date windows. */
export function getHomeNavCounts(db: ApiDb): HomeNavCounts {
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = loadHomeNavCountsUncached(db)
  cached = {
    value,
    expiresAt: Date.now() + NAV_COUNTS_TTL_MS,
  }
  return value
}

export {NAV_COUNTS_TTL_MS}
