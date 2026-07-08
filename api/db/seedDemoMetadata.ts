import type Database from 'better-sqlite3'
import { nowIso } from './utils/timestamps'

const TAGS = [
  {
    name: 'Red',
    synonyms: 'Crimson, Scarlet, Ruby',
    rating: 4,
    favorite: 1,
    bookmark: 'important',
    color: '#ff0000',
    views: 100,
  },
  {
    name: 'Green',
    synonyms: 'Emerald, Lime, Forest',
    rating: 3,
    favorite: 0,
    bookmark: null,
    color: '#00ff00',
    views: 75,
  },
  {
    name: 'Blue',
    synonyms: 'Azure, Navy, Sky',
    rating: 5,
    favorite: 1,
    bookmark: 'favorite',
    color: '#0000ff',
    views: 120,
  },
] as const

function findMediaTypeId(sqlite: Database.Database, type: string): number | undefined {
  const row = sqlite.prepare(
    'SELECT id FROM mediaTypes WHERE type = ? ORDER BY id LIMIT 1',
  ).get(type) as {id: number} | undefined

  return row?.id
}

function linkMetaToMediaType(
  sqlite: Database.Database,
  metaId: number,
  mediaTypeId: number,
) {
  sqlite.prepare(`
    INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", scraper, show)
    SELECT ?, ?, 1, NULL, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM metaInMediaTypes WHERE metaId = ? AND mediaTypeId = ?
    )
  `).run(metaId, mediaTypeId, metaId, mediaTypeId)
}

export function seedDemoMetadata(sqlite: Database.Database) {
  const row = sqlite.prepare('SELECT COUNT(*) as count FROM meta').get() as {count: number}
  if (Number(row.count) > 0) {
    return
  }

  const timestamp = nowIso()
  const result = sqlite.prepare(`
    INSERT INTO meta (
      type, name, icon, hint, "order", synonyms, hidden, nested, marks, bookmark,
      parser, country, career, scraper, rating, favorite, chipVariant, chipLabel, color,
      imageAspectRatio, isLink, ratingIcon, ratingIconEmpty, ratingIconHalf, ratingMax,
      ratingColor, ratingHalf, sortBy, sortDir, createdAt, updatedAt
    ) VALUES (
      'array', 'Color tags', 'tag', 'For organize media', 1, 1, 0, 0, 1, 1,
      1, 0, 0, 0, 1, 1, 'flat', 0, 1,
      1, 0, 'star', 'star-outline', 'star-half-full', 5,
      '#ffab00', 0, 'createdAt', 'asc', ?, ?
    )
  `).run(timestamp, timestamp)

  const metaId = Number(result.lastInsertRowid)
  const videoTypeId = findMediaTypeId(sqlite, 'video')
  const imageTypeId = findMediaTypeId(sqlite, 'image')

  if (videoTypeId != null) {
    linkMetaToMediaType(sqlite, metaId, videoTypeId)
  }

  if (imageTypeId != null) {
    linkMetaToMediaType(sqlite, metaId, imageTypeId)
  }

  const insertTag = sqlite.prepare(`
    INSERT INTO tags (
      name, synonyms, rating, favorite, bookmark, color, views, metaId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  for (const tag of TAGS) {
    insertTag.run(
      tag.name,
      tag.synonyms,
      tag.rating,
      tag.favorite,
      tag.bookmark,
      tag.color,
      tag.views,
      metaId,
      timestamp,
      timestamp,
    )
  }
}

