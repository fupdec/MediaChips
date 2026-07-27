import type Database from 'better-sqlite3'
import { nowIso } from './utils/timestamps'

type StarterMetaField = {
  type: string
  name: string
  icon: string
  hint: string
  order: number
  parser?: number
  ratingMax?: number
}

const STARTER_META: StarterMetaField[] = [
  {
    type: 'array',
    name: 'Tags',
    icon: 'tag-multiple-outline',
    hint: 'Tags from file paths and folders — rename or extend as you like',
    order: 1,
    parser: 1,
  },
  {
    type: 'rating',
    name: 'Rating',
    icon: 'star-outline',
    hint: 'Score media from 1 to 5',
    order: 2,
    ratingMax: 5,
  },
  {
    type: 'boolean',
    name: 'Favorite',
    icon: 'heart-outline',
    hint: 'Mark media as favorite',
    order: 3,
  },
]

const STARTER_TAGS = [
  {
    name: 'Watch later',
    synonyms: 'Later, Queue, To watch',
    rating: 0,
    favorite: 0,
    bookmark: null as string | null,
    color: '#2196f3',
  },
  {
    name: 'Favorites',
    synonyms: 'Fav, Best',
    rating: 5,
    favorite: 1,
    bookmark: 'favorite',
    color: '#e91e63',
  },
  {
    name: 'Rewatch',
    synonyms: 'Watch again, Replay',
    rating: 4,
    favorite: 0,
    bookmark: null,
    color: '#ff9800',
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
  order: number,
) {
  sqlite.prepare(`
    INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "order", scraper, show)
    SELECT ?, ?, ?, NULL, 1
    WHERE NOT EXISTS (
      SELECT 1 FROM metaInMediaTypes WHERE metaId = ? AND mediaTypeId = ?
    )
  `).run(metaId, mediaTypeId, order, metaId, mediaTypeId)
}

function insertStarterMeta(
  sqlite: Database.Database,
  field: StarterMetaField,
  timestamp: string,
): number {
  const result = sqlite.prepare(`
    INSERT INTO meta (
      type, name, icon, hint, "order", synonyms, hidden, nested, marks, bookmark,
      parser, country, career, scraper, rating, favorite, chipVariant, chipLabel, color,
      imageAspectRatio, isLink, ratingIcon, ratingIconEmpty, ratingIconHalf, ratingMax,
      ratingColor, ratingHalf, sortBy, sortDir, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, 0, 0, 0, 0, 0,
      ?, 0, 0, 0, 0, 1, 'flat', 0, 0,
      1, 0, 'star', 'star-outline', 'star-half-full', ?,
      '#ffab00', 0, 'createdAt', 'asc', ?, ?
    )
  `).run(
    field.type,
    field.name,
    field.icon,
    field.hint,
    field.order,
    field.parser ?? 0,
    field.ratingMax ?? 5,
    timestamp,
    timestamp,
  )

  return Number(result.lastInsertRowid)
}

function insertStarterTags(
  sqlite: Database.Database,
  tagsMetaId: number,
  timestamp: string,
) {
  const insert = sqlite.prepare(`
    INSERT INTO tags (
      name, synonyms, rating, favorite, bookmark, color, views, metaId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `)

  for (const tag of STARTER_TAGS) {
    insert.run(
      tag.name,
      tag.synonyms,
      tag.rating,
      tag.favorite,
      tag.bookmark,
      tag.color,
      tagsMetaId,
      timestamp,
      timestamp,
    )
  }
}

function findTagsMetaId(sqlite: Database.Database): number | undefined {
  const row = sqlite.prepare(`
    SELECT id FROM meta
    WHERE type = 'array' AND lower(name) = 'tags'
    ORDER BY id
    LIMIT 1
  `).get() as {id: number} | undefined

  return row?.id
}

/** If Tags category exists but has no tags, seed the starter set once. */
function ensureStarterTagsIfEmpty(sqlite: Database.Database) {
  const tagsMetaId = findTagsMetaId(sqlite)
  if (tagsMetaId == null) return

  const countRow = sqlite.prepare(
    'SELECT COUNT(*) as count FROM tags WHERE metaId = ?',
  ).get(tagsMetaId) as {count: number}

  if (Number(countRow.count) > 0) return

  insertStarterTags(sqlite, tagsMetaId, nowIso())
}

/**
 * Seeds Tags (with path parser), Rating, and Favorite when the meta table is empty.
 * Pins them to Videos and Images and adds a few starter tags. Idempotent for non-empty libraries.
 * Also backfills starter tags when Tags exists but has none.
 */
export function seedStarterMeta(sqlite: Database.Database) {
  const row = sqlite.prepare('SELECT COUNT(*) as count FROM meta').get() as {count: number}
  if (Number(row.count) > 0) {
    ensureStarterTagsIfEmpty(sqlite)
    return
  }

  const timestamp = nowIso()
  const videoTypeId = findMediaTypeId(sqlite, 'video')
  const imageTypeId = findMediaTypeId(sqlite, 'image')
  const pinTargets = [videoTypeId, imageTypeId].filter(
    (id): id is number => id != null,
  )

  let tagsMetaId: number | null = null

  for (const field of STARTER_META) {
    const metaId = insertStarterMeta(sqlite, field, timestamp)
    if (field.type === 'array' && field.name === 'Tags') {
      tagsMetaId = metaId
    }
    for (const mediaTypeId of pinTargets) {
      linkMetaToMediaType(sqlite, metaId, mediaTypeId, field.order)
    }
  }

  if (tagsMetaId != null) {
    insertStarterTags(sqlite, tagsMetaId, timestamp)
  }
}

/** @deprecated Use seedStarterMeta */
export const seedDemoMetadata = seedStarterMeta
