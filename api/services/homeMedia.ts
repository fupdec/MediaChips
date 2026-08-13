import type { ApiDb, AnyRecord } from '../types/db'
import type { ParsedHomeMediaResponse } from '@shared/schemas/home'
import { queryAll } from '../db/utils/rawQuery'

const MEDIA_HOME_SELECT = `SELECT media.id,
  media.path,
  media.name,
  media.basename,
  media.ext,
  media.mediaTypeId,
  media.filesize,
  media.rating,
  media.favorite,
  media.views,
  media.viewedAt,
  videoMetadata.duration,
  videoMetadata.time,
  COALESCE(videoMetadata.width, imageMetadata.width) AS width,
  COALESCE(videoMetadata.height, imageMetadata.height) AS height`

const MEDIA_HOME_FROM = `FROM media
LEFT JOIN videoMetadata ON media.id = videoMetadata.mediaId
LEFT JOIN imageMetadata ON media.id = imageMetadata.mediaId`

const mapHomeItem = (row: AnyRecord) => ({
  id: row.id,
  path: row.path,
  name: row.name,
  basename: row.basename,
  ext: row.ext,
  mediaTypeId: row.mediaTypeId,
  filesize: row.filesize,
  rating: row.rating,
  favorite: row.favorite,
  views: row.views,
  viewedAt: row.viewedAt,
  duration: row.duration,
  time: row.time,
  width: row.width,
  height: row.height,
  tags: [],
  values: [],
  key: String(row.id),
})

/** Pick a pivot id in [minId, maxId] for circular favorite sampling. */
export function chooseFavoriteSamplePivot(
  minId: number,
  maxId: number,
  random: () => number = Math.random,
): number {
  if (!Number.isFinite(minId) || !Number.isFinite(maxId) || maxId < minId) {
    return minId
  }
  const span = maxId - minId + 1
  return minId + Math.floor(random() * span)
}

async function getContinueWatching(db: ApiDb, limit = 12) {
  const rows = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE videoMetadata.time > 0
       AND media.viewedAt IS NOT NULL
       AND (
         videoMetadata.duration IS NULL
         OR videoMetadata.duration = 0
         OR videoMetadata.time < videoMetadata.duration * 0.95
       )
     ORDER BY media.viewedAt DESC
     LIMIT :limit`, {limit})
  return rows.map(mapHomeItem)
}

async function getFavoriteMedia(db: ApiDb, limit = 12) {
  const bounds = queryAll(db, `
    SELECT
      (SELECT id FROM media WHERE favorite = 1 ORDER BY id ASC LIMIT 1) AS minId,
      (SELECT id FROM media WHERE favorite = 1 ORDER BY id DESC LIMIT 1) AS maxId
  `)[0] as {minId?: number | null; maxId?: number | null} | undefined

  const minId = Number(bounds?.minId)
  const maxId = Number(bounds?.maxId)
  if (!Number.isFinite(minId) || !Number.isFinite(maxId)) {
    return []
  }

  const pivot = chooseFavoriteSamplePivot(minId, maxId)
  const first = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE media.favorite = 1
       AND media.id >= :pivot
     ORDER BY media.id ASC
     LIMIT :limit`, {pivot, limit})

  if (first.length >= limit) {
    return first.map(mapHomeItem)
  }

  const remaining = limit - first.length
  const wrap = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE media.favorite = 1
       AND media.id < :pivot
     ORDER BY media.id ASC
     LIMIT :limit`, {pivot, limit: remaining})

  return [...first, ...wrap].map(mapHomeItem)
}

async function getTopViewedMedia(db: ApiDb, limit = 12) {
  const rows = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE media.views > 0
     ORDER BY media.views DESC, media.viewedAt DESC
     LIMIT :limit`, {limit})
  return rows.map(mapHomeItem)
}

function clampHomeLimit(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return fallback
  if (n === 0) return 0
  return Math.min(Math.max(Math.floor(n), 1), 24)
}

async function getHomeMedia(db: ApiDb, limits: AnyRecord = {}): Promise<ParsedHomeMediaResponse> {
  const continueLimit = clampHomeLimit(limits.continue, 12)
  const favoritesLimit = clampHomeLimit(limits.favorites, 12)
  const topViewsLimit = clampHomeLimit(limits.topViews, 12)

  const [continueWatching, favorites, topViews] = await Promise.all([
    continueLimit > 0 ? getContinueWatching(db, continueLimit) : Promise.resolve([]),
    favoritesLimit > 0 ? getFavoriteMedia(db, favoritesLimit) : Promise.resolve([]),
    topViewsLimit > 0 ? getTopViewedMedia(db, topViewsLimit) : Promise.resolve([]),
  ])

  return {
    continueWatching,
    favorites,
    topViews,
  } as ParsedHomeMediaResponse
}

export {
  getHomeMedia,
  getContinueWatching,
  getFavoriteMedia,
  getTopViewedMedia,
}
