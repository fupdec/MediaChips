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
  const rows = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE media.favorite = 1
     ORDER BY RANDOM()
     LIMIT :limit`, {limit})
  return rows.map(mapHomeItem)
}

async function getTopViewedMedia(db: ApiDb, limit = 12) {
  const rows = queryAll(db, `${MEDIA_HOME_SELECT}
     ${MEDIA_HOME_FROM}
     WHERE media.views > 0
     ORDER BY media.views DESC, media.viewedAt DESC
     LIMIT :limit`, {limit})
  return rows.map(mapHomeItem)
}

async function getHomeMedia(db: ApiDb, limits: AnyRecord = {}): Promise<ParsedHomeMediaResponse> {
  const continueLimit = Math.min(Math.max(Number(limits.continue) || 12, 1), 24)
  const favoritesLimit = Math.min(Math.max(Number(limits.favorites) || 12, 1), 24)
  const topViewsLimit = Math.min(Math.max(Number(limits.topViews) || 12, 1), 24)

  const [continueWatching, favorites, topViews] = await Promise.all([
    getContinueWatching(db, continueLimit),
    getFavoriteMedia(db, favoritesLimit),
    getTopViewedMedia(db, topViewsLimit),
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
