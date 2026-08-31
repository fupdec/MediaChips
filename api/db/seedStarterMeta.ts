import type Database from 'better-sqlite3'
import { nowIso } from './utils/timestamps'

type PinTarget = 'video' | 'image'

type StarterMetaField = {
  type: string
  name: string
  icon: string
  hint: string
  order: number
  pinTo?: PinTarget[]
  parser?: number
  synonyms?: number
  country?: number
  scraper?: number
  rating?: number
  favorite?: number
  color?: number
  measurementUnit?: string | null
  ratingMax?: number
}

type StarterChildField = {
  type: string
  name: string
  icon: string
  hint: string
  order: number
  color?: number
  measurementUnit?: string | null
}

/** Media-level fields for path parser + TMDB/TPDB (no scraper keys — plugins map on Configure). */
const STARTER_META: StarterMetaField[] = [
  {
    type: 'array',
    name: 'Tags',
    icon: 'tag-multiple-outline',
    hint: 'Tags from file paths, folders, and scene scrapers — rename or extend as you like',
    order: 1,
    pinTo: ['video', 'image'],
    parser: 1,
    color: 1,
  },
  {
    type: 'date',
    name: 'Release date',
    icon: 'calendar-outline',
    hint: 'Release or premiere date from scrapers',
    order: 2,
    pinTo: ['video', 'image'],
  },
  {
    type: 'array',
    name: 'Studio',
    icon: 'domain',
    hint: 'Studio or production company',
    order: 3,
    pinTo: ['video', 'image'],
    color: 1,
  },
  {
    type: 'array',
    name: 'Performers',
    icon: 'account-group',
    hint: 'Cast and performers — used by TMDB and TPDB scrapers',
    order: 4,
    pinTo: ['video', 'image'],
    scraper: 1,
    synonyms: 1,
    rating: 1,
    favorite: 1,
    country: 1,
    color: 1,
  },
  {
    type: 'array',
    name: 'Genres',
    icon: 'tag-multiple-outline',
    hint: 'Genres from TMDB and similar scrapers',
    order: 5,
    pinTo: ['video', 'image'],
    color: 1,
  },
]

/** Child fields pinned under Performers (no scraper keys). */
const PERFORMER_CHILD_META: StarterChildField[] = [
  {
    type: 'date',
    name: 'Birthday',
    icon: 'cake-variant',
    hint: 'Date of birth',
    order: 1,
  },
  {
    type: 'date',
    name: 'Deathday',
    icon: 'calendar-remove',
    hint: 'Date of death',
    order: 2,
  },
  {
    type: 'array',
    name: 'Gender',
    icon: 'gender-male-female',
    hint: 'Gender',
    order: 3,
    color: 1,
  },
  {
    type: 'string',
    name: 'Place of birth',
    icon: 'map-marker-outline',
    hint: 'Place of birth',
    order: 4,
  },
  {
    type: 'string',
    name: 'Known for',
    icon: 'briefcase-outline',
    hint: 'Known for department or role',
    order: 5,
  },
  {
    type: 'number',
    name: 'Height',
    icon: 'human-male-height',
    hint: 'Height',
    order: 6,
    measurementUnit: 'cm',
  },
  {
    type: 'number',
    name: 'Weight',
    icon: 'weight',
    hint: 'Weight',
    order: 7,
    measurementUnit: 'kg',
  },
  {
    type: 'array',
    name: 'Eye color',
    icon: 'eye-outline',
    hint: 'Eye color',
    order: 8,
    color: 1,
  },
  {
    type: 'array',
    name: 'Hair colors',
    icon: 'palette-outline',
    hint: 'Hair color',
    order: 9,
    color: 1,
  },
  {
    type: 'string',
    name: 'Tattoos',
    icon: 'brush',
    hint: 'Tattoos',
    order: 10,
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
    synonyms: 'Favorite, Favourite, Fav, Best',
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

type StarterCategoryTag = {
  name: string
  synonyms?: string
  color: string
}

/**
 * Prefill for Gender / Eye color / Hair colors.
 * Globally unique tag names: shared color words use a distinct display name + synonym
 * so scrapers still match "Brown" / "Gray" within the right category.
 */
const STARTER_CATEGORY_TAGS: Record<string, StarterCategoryTag[]> = {
  Gender: [
    {name: 'Female', color: '#e91e63'},
    {name: 'Male', color: '#2196f3'},
  ],
  'Eye color': [
    {name: 'Blue', color: '#1e88e5'},
    {name: 'Green', color: '#43a047'},
    {name: 'Hazel', color: '#8d6e63'},
    {name: 'Amber', color: '#ffb300'},
    {name: 'Brown', color: '#6d4c41'},
    {name: 'Gray', synonyms: 'Grey', color: '#90a4ae'},
  ],
  'Hair colors': [
    {name: 'Blonde', synonyms: 'Blond, Golden', color: '#fbc02d'},
    {name: 'Brunette', color: '#5d4037'},
    {name: 'Brown hair', synonyms: 'Brown', color: '#6d4c41'},
    {name: 'Black', color: '#212121'},
    {name: 'Redhead', synonyms: 'Red, Ginger', color: '#e53935'},
    {name: 'Auburn', color: '#a1887f'},
    {name: 'Gray hair', synonyms: 'Grey, Gray, Silver', color: '#b0bec5'},
    {name: 'White', synonyms: 'Platinum', color: '#eceff1'},
    {name: 'Bald', synonyms: 'Shaved', color: '#78909c'},
  ],
}

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

function pinChildMeta(
  sqlite: Database.Database,
  parentMetaId: number,
  childMetaId: number,
  order: number,
) {
  sqlite.prepare(`
    INSERT INTO pinnedMetas (metaId, pinnedMetaId, scraper, show, "order")
    SELECT ?, ?, NULL, 1, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM pinnedMetas WHERE metaId = ? AND pinnedMetaId = ?
    )
  `).run(parentMetaId, childMetaId, order, parentMetaId, childMetaId)
}

function insertStarterMeta(
  sqlite: Database.Database,
  field: StarterMetaField | StarterChildField,
  timestamp: string,
): number {
  const synonyms = 'synonyms' in field ? (field.synonyms ?? 0) : 0
  const parser = 'parser' in field ? (field.parser ?? 0) : 0
  const country = 'country' in field ? (field.country ?? 0) : 0
  const scraper = 'scraper' in field ? (field.scraper ?? 0) : 0
  const rating = 'rating' in field ? (field.rating ?? 0) : 0
  const favorite = 'favorite' in field ? (field.favorite ?? 1) : 1
  const color = 'color' in field ? (field.color ?? 0) : 0
  const measurementUnit = field.measurementUnit ?? null
  const ratingMax = 'ratingMax' in field ? (field.ratingMax ?? 5) : 5
  const order = field.order

  const result = sqlite.prepare(`
    INSERT INTO meta (
      type, name, icon, hint, "order", synonyms, hidden, nested, marks, bookmark,
      parser, country, career, scraper, rating, favorite, chipVariant, chipLabel, color,
      imageAspectRatio, measurementUnit, isLink, ratingIcon, ratingIconEmpty, ratingIconHalf, ratingMax,
      ratingColor, ratingHalf, sortBy, sortDir, createdAt, updatedAt
    ) VALUES (
      ?, ?, ?, ?, ?, ?, 0, 0, 0, 0,
      ?, ?, 0, ?, ?, ?, 'flat', 0, ?,
      1, ?, 0, 'star', 'star-outline', 'star-half-full', ?,
      '#ffab00', 0, 'createdAt', 'asc', ?, ?
    )
  `).run(
    field.type,
    field.name,
    field.icon,
    field.hint,
    order,
    synonyms,
    parser,
    country,
    scraper,
    rating,
    favorite,
    color,
    measurementUnit,
    ratingMax,
    timestamp,
    timestamp,
  )

  return Number(result.lastInsertRowid)
}

function insertStarterTags(
  sqlite: Database.Database,
  tagsMetaId: number,
  timestamp: string,
  tags: ReadonlyArray<{
    name: string
    synonyms?: string | null
    rating?: number
    favorite?: number
    bookmark?: string | null
    color: string
  }> = STARTER_TAGS,
) {
  const insert = sqlite.prepare(`
    INSERT INTO tags (
      name, synonyms, rating, favorite, bookmark, color, views, metaId, createdAt, updatedAt
    ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
  `)

  for (const tag of tags) {
    insert.run(
      tag.name,
      tag.synonyms ?? null,
      tag.rating ?? 0,
      tag.favorite ?? 0,
      tag.bookmark ?? null,
      tag.color,
      tagsMetaId,
      timestamp,
      timestamp,
    )
  }
}

function insertCategoryStarterTags(
  sqlite: Database.Database,
  metaId: number,
  categoryName: string,
  timestamp: string,
) {
  const tags = STARTER_CATEGORY_TAGS[categoryName]
  if (!tags?.length) return
  insertStarterTags(sqlite, metaId, timestamp, tags)
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
 * Inserts starter saved filters (top-rated views) for the Tags category,
 * Video media type, and Image media type.
 * Each filter has: rating > 4 OR favorite = true, sorted by rating descending.
 * Idempotent — skips if columns don't exist yet or filters already present.
 */
export function seedStarterSavedFilters(sqlite: Database.Database) {
  // Guard: old databases may not have the sortBy column yet.
  // Schema repair runs earlier in postMigrations; we skip silently.
  const hasSortBy = sqlite.prepare(
    "PRAGMA table_info('savedFilters')",
  ).all().some((row: unknown) => (row as {name: string}).name === 'sortBy')

  if (!hasSortBy) return

  const tagsMetaId = findTagsMetaId(sqlite)
  const videoMediaTypeId = findMediaTypeId(sqlite, 'video')
  const imageMediaTypeId = findMediaTypeId(sqlite, 'image')

  if (tagsMetaId == null || videoMediaTypeId == null || imageMediaTypeId == null) return

  const timestamp = nowIso()

  const checkExisting = sqlite.prepare(`
    SELECT COUNT(*) as count FROM savedFilters
    WHERE name = ? AND metaId IS ? AND mediaTypeId IS ? AND tagId IS ?
  `)

  const insertFilterRow = sqlite.prepare(`
    INSERT INTO filterRows (param, type, cond, val, active, note, lock, "order", createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertSavedFilter = sqlite.prepare(`
    INSERT INTO savedFilters (name, metaId, mediaTypeId, tagId, tabId, sortBy, sortDir, filtersJoin, icon, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertLink = sqlite.prepare(`
    INSERT INTO filterRowsInSavedFilters (filterId, rowId)
    VALUES (?, ?)
  `)

  const NAME = 'Top Rated'

  function createOne(
    metaId: number | null,
    mediaTypeId: number | null,
    tagId: number | null,
  ) {
    const existing = checkExisting.get(NAME, metaId, mediaTypeId, tagId) as {count: number}
    if (Number(existing.count) > 0) return

    const ratingRowResult = insertFilterRow.run(
      'rating', 'rating', '>', '4', 1, null, 0, 0, timestamp, timestamp,
    )
    const ratingRowId = Number(ratingRowResult.lastInsertRowid)

    const favoriteRowResult = insertFilterRow.run(
      'favorite', 'boolean', '=', 'true', 1, null, 0, 1, timestamp, timestamp,
    )
    const favoriteRowId = Number(favoriteRowResult.lastInsertRowid)

    const result = insertSavedFilter.run(
      NAME,
      metaId,
      mediaTypeId,
      tagId,
      null,
      'rating',
      'desc',
      'or',
      'star',
      timestamp,
      timestamp,
    )
    const filterId = Number(result.lastInsertRowid)
    insertLink.run(filterId, ratingRowId)
    insertLink.run(filterId, favoriteRowId)
  }

  // Tags category scope
  createOne(tagsMetaId, null, null)
  // Video scope
  createOne(null, videoMediaTypeId, null)
  // Image scope
  createOne(null, imageMediaTypeId, null)
}

/**
 * Seeds media + performer meta for TMDB/TPDB when the meta table is empty.
 * Pins media fields to Videos/Images, pins person children under Performers.
 * Does not set scraper keys — plugins map them on Configure.
 * Idempotent for non-empty libraries; backfills starter tags when Tags exists but has none.
 * Built-in media.rating / media.favorite cover rating and favorites — no duplicate meta fields.
 */
export function seedStarterMeta(sqlite: Database.Database): boolean {
  const row = sqlite.prepare('SELECT COUNT(*) as count FROM meta').get() as {count: number}
  if (Number(row.count) > 0) {
    ensureStarterTagsIfEmpty(sqlite)
    return false
  }

  const timestamp = nowIso()
  const mediaTypeIds: Partial<Record<PinTarget, number>> = {
    video: findMediaTypeId(sqlite, 'video'),
    image: findMediaTypeId(sqlite, 'image'),
  }

  let tagsMetaId: number | null = null
  let performersMetaId: number | null = null

  for (const field of STARTER_META) {
    const metaId = insertStarterMeta(sqlite, field, timestamp)
    if (field.name === 'Tags') tagsMetaId = metaId
    if (field.name === 'Performers') performersMetaId = metaId

    const targets = field.pinTo || ['video', 'image']
    for (const target of targets) {
      const mediaTypeId = mediaTypeIds[target]
      if (mediaTypeId == null) continue
      linkMetaToMediaType(sqlite, metaId, mediaTypeId, field.order)
    }
  }

  if (performersMetaId != null) {
    for (const child of PERFORMER_CHILD_META) {
      const childId = insertStarterMeta(sqlite, child, timestamp)
      pinChildMeta(sqlite, performersMetaId, childId, child.order)
      if (child.type === 'array') {
        insertCategoryStarterTags(sqlite, childId, child.name, timestamp)
      }
    }
  }

  if (tagsMetaId != null) {
    insertStarterTags(sqlite, tagsMetaId, timestamp)
  }

  return true
}

/** @deprecated Use seedStarterMeta */
export const seedDemoMetadata = seedStarterMeta
