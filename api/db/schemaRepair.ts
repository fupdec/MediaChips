import type Database from 'better-sqlite3'
import {
  ensureTagsNameNormalizedUniqueIndex,
  TAGS_NAME_NORMALIZED_UNIQUE_INDEX,
} from './ensureGlobalUniqueTagNames'

type ColumnRepairSpec = {
  table: string
  column: string
  definition: string
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined

  return Boolean(row)
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const columns = sqlite.pragma(`table_info(${tableName})`) as Array<{name: string}>
  return columns.some((column) => column.name === columnName)
}

function addColumnIfMissing(
  sqlite: Database.Database,
  tableName: string,
  columnName: string,
  definition: string,
): boolean {
  if (!hasTable(sqlite, tableName) || hasColumn(sqlite, tableName, columnName)) {
    return false
  }

  sqlite.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${definition}`)
  return true
}

const SCHEMA_REPAIRS: ColumnRepairSpec[] = [
  {table: 'meta', column: 'icon', definition: 'text'},
  {table: 'meta', column: 'hint', definition: 'text'},
  {table: 'meta', column: 'order', definition: 'integer'},
  {table: 'meta', column: 'views', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'oldId', definition: 'text'},
  {table: 'meta', column: 'synonyms', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'hidden', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'nested', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'marks', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'bookmark', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'parser', definition: 'integer DEFAULT 1'},
  {table: 'meta', column: 'pathRegex', definition: 'text'},
  {table: 'meta', column: 'pathRegexReplace', definition: "text DEFAULT '$1'"},
  {table: 'meta', column: 'pathRegexCreateTags', definition: 'integer DEFAULT 1'},
  {table: 'meta', column: 'pathRegexEnabled', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'country', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'career', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'scraper', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'rating', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'favorite', definition: 'integer DEFAULT 1'},
  {table: 'meta', column: 'chipVariant', definition: "text DEFAULT 'flat'"},
  {table: 'meta', column: 'chipLabel', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'color', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'autoColorFromImage', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'imageAspectRatio', definition: 'real DEFAULT 1'},
  {table: 'meta', column: 'tagPageDesign', definition: "text DEFAULT 'profile'"},
  {table: 'meta', column: 'measurementUnit', definition: 'text'},
  {table: 'meta', column: 'isLink', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'ratingIcon', definition: "text DEFAULT 'star'"},
  {table: 'meta', column: 'ratingIconEmpty', definition: "text DEFAULT 'star-outline'"},
  {table: 'meta', column: 'ratingIconHalf', definition: "text DEFAULT 'star-half-full'"},
  {table: 'meta', column: 'ratingMax', definition: 'integer DEFAULT 5'},
  {table: 'meta', column: 'ratingColor', definition: "text DEFAULT '#ffab00'"},
  {table: 'meta', column: 'ratingHalf', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'sortBy', definition: "text DEFAULT 'createdAt'"},
  {table: 'meta', column: 'sortDir', definition: "text DEFAULT 'asc'"},
  {table: 'marks', column: 'icon', definition: 'text'},
  {table: 'media', column: 'basename', definition: 'text'},
  {table: 'media', column: 'name', definition: 'text'},
  {table: 'media', column: 'ext', definition: 'text'},
  {table: 'media', column: 'filesize', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'contentHash', definition: 'text'},
  {table: 'media', column: 'oshash', definition: 'text'},
  {table: 'media', column: 'visualHash', definition: 'text'},
  {table: 'media', column: 'visualHashTiles', definition: 'text'},
  {table: 'media', column: 'rating', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'favorite', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'bookmark', definition: 'text'},
  {table: 'media', column: 'views', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'oldId', definition: 'text'},
  {table: 'media', column: 'viewedAt', definition: 'text'},
  {table: 'media', column: 'mediaCreatedAt', definition: 'text'},
  {table: 'media', column: 'deletedAt', definition: 'text'},
  {table: 'media', column: 'trashOriginalPath', definition: 'text'},
  {table: 'media', column: 'trashPurgeFile', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'mediaTypeId', definition: 'integer'},
  {table: 'tags', column: 'oldId', definition: 'text'},
  {table: 'tags', column: 'synonyms', definition: 'text'},
  {table: 'tags', column: 'rating', definition: 'integer DEFAULT 0'},
  {table: 'tags', column: 'favorite', definition: 'integer DEFAULT 0'},
  {table: 'tags', column: 'bookmark', definition: 'text'},
  {table: 'tags', column: 'country', definition: 'text'},
  {table: 'tags', column: 'color', definition: 'text'},
  {table: 'tags', column: 'views', definition: 'integer DEFAULT 0'},
  {table: 'tags', column: 'viewedAt', definition: 'text'},
  {table: 'tags', column: 'metaId', definition: 'integer'},
  {table: 'tags', column: 'deletedAt', definition: 'text'},
  {table: 'tags', column: 'trashOriginalName', definition: 'text'},
  {table: 'marks', column: 'deletedAt', definition: 'text'},
  {table: 'playlists', column: 'deletedAt', definition: 'text'},
  {table: 'savedFilters', column: 'deletedAt', definition: 'text'},
  {table: 'filterRows', column: 'order', definition: 'integer DEFAULT 0'},
  {table: 'faces', column: 'tagId', definition: 'integer'},
  {table: 'faces', column: 'matchScore', definition: 'real'},
  {table: 'faces', column: 'matchStatus', definition: 'text'},
  {table: 'faces', column: 'embedding', definition: 'text'},
  {table: 'videoMetadata', column: 'title', definition: 'text'},
  {table: 'videoMetadata', column: 'artist', definition: 'text'},
  {table: 'videoMetadata', column: 'album', definition: 'text'},
  {table: 'watchedFolders', column: 'icon', definition: 'text'},
  {table: 'watchedFolders', column: 'excludedPaths', definition: 'text'},
  {table: 'savedFilters', column: 'sortBy', definition: 'text'},
  {table: 'savedFilters', column: 'sortDir', definition: 'text'},
  {table: 'savedFilters', column: 'size', definition: 'integer'},
  {table: 'savedFilters', column: 'view', definition: 'integer'},
  {table: 'savedFilters', column: 'groupBy', definition: 'text'},
  {table: 'savedFilters', column: 'filtersJoin', definition: "text DEFAULT 'and'"},
]

export function repairSchemaColumns(sqlite: Database.Database): string[] {
  const repaired: string[] = []

  for (const spec of SCHEMA_REPAIRS) {
    if (addColumnIfMissing(sqlite, spec.table, spec.column, spec.definition)) {
      repaired.push(`${spec.table}.${spec.column}`)
    }
  }

  if (repaired.includes('meta.pathRegexEnabled') && hasTable(sqlite, 'meta')) {
    sqlite.exec(`
      UPDATE "meta"
      SET "pathRegexEnabled" = 1
      WHERE "pathRegex" IS NOT NULL AND TRIM("pathRegex") != ''
    `)
  }

  return repaired
}

const MISSING_TABLE_DDL: Record<string, string> = {
  imageMetadata: `CREATE TABLE "imageMetadata" (
    "mediaId" integer PRIMARY KEY NOT NULL,
    "width" integer DEFAULT 0,
    "height" integer DEFAULT 0,
    "orientation" integer DEFAULT 1
  )`,
  pinnedMetas: `CREATE TABLE "pinnedMetas" (
    "metaId" integer NOT NULL,
    "pinnedMetaId" integer NOT NULL,
    "scraper" text,
    "show" integer DEFAULT true,
    "order" integer,
    PRIMARY KEY("metaId", "pinnedMetaId")
  )`,
  folderPaths: `CREATE TABLE "folderPaths" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "path" text NOT NULL,
    "createdAt" text NOT NULL,
    "updatedAt" text NOT NULL
  )`,
  tagsInFolders: `CREATE TABLE "tagsInFolders" (
    "folderId" integer NOT NULL,
    "tagId" integer NOT NULL,
    "metaId" integer NOT NULL,
    PRIMARY KEY("folderId", "tagId", "metaId")
  )`,
  faces: `CREATE TABLE "faces" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "mediaId" integer NOT NULL,
    "timestamp" text,
    "score" real DEFAULT 0 NOT NULL,
    "x" real DEFAULT 0 NOT NULL,
    "y" real DEFAULT 0 NOT NULL,
    "width" real DEFAULT 0 NOT NULL,
    "height" real DEFAULT 0 NOT NULL,
    "cropPath" text,
    "embedding" text,
    "tagId" integer,
    "matchScore" real,
    "matchStatus" text,
    "createdAt" text NOT NULL
  )`,
  faceEnrollments: `CREATE TABLE "faceEnrollments" (
    "id" integer PRIMARY KEY AUTOINCREMENT NOT NULL,
    "tagId" integer NOT NULL,
    "metaId" integer NOT NULL,
    "source" text NOT NULL,
    "sourcePath" text,
    "embedding" text NOT NULL,
    "createdAt" text NOT NULL
  )`,
  textContent: `CREATE TABLE "textContent" (
    "mediaId" integer PRIMARY KEY NOT NULL,
    "content" text DEFAULT '',
    "excerpt" text DEFAULT '',
    "truncated" integer DEFAULT 0
  )`,
  mediaClipEmbeddings: `CREATE TABLE "mediaClipEmbeddings" (
    "mediaId" integer PRIMARY KEY NOT NULL,
    "embedding" blob NOT NULL,
    "dims" integer NOT NULL,
    "model" text NOT NULL,
    "updatedAt" text NOT NULL
  )`,
}

function createTableIfMissing(sqlite: Database.Database, tableName: string): boolean {
  if (hasTable(sqlite, tableName)) {
    return false
  }

  const ddl = MISSING_TABLE_DDL[tableName]
  if (!ddl) {
    return false
  }

  sqlite.exec(ddl)
  return true
}

function migrateLegacyPinnedMetaTable(sqlite: Database.Database): boolean {
  if (!hasTable(sqlite, 'pinnedMeta') || !hasTable(sqlite, 'pinnedMetas')) {
    return false
  }

  const result = sqlite.prepare(`
    INSERT OR IGNORE INTO pinnedMetas (metaId, pinnedMetaId, scraper, show, "order")
    SELECT metaId, pinnedMetaId, scraper, show, "order"
    FROM pinnedMeta
    WHERE metaId IS NOT NULL AND pinnedMetaId IS NOT NULL
  `).run()

  return Number(result.changes) > 0
}

export function repairMissingTables(sqlite: Database.Database): string[] {
  const repaired: string[] = []

  for (const tableName of Object.keys(MISSING_TABLE_DDL)) {
    if (createTableIfMissing(sqlite, tableName)) {
      repaired.push(tableName)
    }
  }

  if (migrateLegacyPinnedMetaTable(sqlite)) {
    repaired.push('pinnedMeta→pinnedMetas')
  }

  return repaired
}

function hasIndex(sqlite: Database.Database, indexName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`,
  ).get(indexName) as {name: string} | undefined

  return Boolean(row)
}

type JoinUniqueIndexSpec = {
  indexName: string
  table: string
  columns: string[]
}

const JOIN_UNIQUE_INDEXES: JoinUniqueIndexSpec[] = [
  {
    indexName: 'tags_in_tags_unique_idx',
    table: 'tagsInTags',
    columns: ['parentTagId', 'tagId', 'metaId'],
  },
  {
    indexName: 'tags_in_media_unique_idx',
    table: 'tagsInMedia',
    columns: ['mediaId', 'tagId', 'metaId'],
  },
  {
    indexName: 'tags_in_folders_unique_idx',
    table: 'tagsInFolders',
    columns: ['folderId', 'tagId', 'metaId'],
  },
  {
    indexName: 'tags_in_filter_rows_unique_idx',
    table: 'tagsInFilterRows',
    columns: ['tagId', 'rowId', 'metaId'],
  },
  {
    indexName: 'values_in_tags_unique_idx',
    table: 'valuesInTags',
    columns: ['tagId', 'metaId'],
  },
  {
    indexName: 'values_in_media_unique_idx',
    table: 'valuesInMedia',
    columns: ['mediaId', 'metaId'],
  },
  {
    indexName: 'meta_in_media_types_unique_idx',
    table: 'metaInMediaTypes',
    columns: ['metaId', 'mediaTypeId'],
  },
]

function dedupeJoinTableRows(sqlite: Database.Database, table: string, columns: string[]): number {
  if (!hasTable(sqlite, table)) return 0

  const quotedCols = columns.map((column) => `"${column}"`).join(', ')
  const result = sqlite.prepare(`
    DELETE FROM "${table}"
    WHERE rowid NOT IN (
      SELECT MIN(rowid) FROM "${table}" GROUP BY ${quotedCols}
    )
  `).run()

  return Number(result.changes ?? 0)
}

/** Idempotent indexes for legacy DBs that skip stamped drizzle migrations. */
export function repairMissingIndexes(sqlite: Database.Database): string[] {
  const repaired: string[] = []

  if (hasTable(sqlite, 'videoMetadata') && !hasIndex(sqlite, 'video_metadata_media_id_idx')) {
    sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS "video_metadata_media_id_idx" ON "videoMetadata" ("mediaId")',
    )
    repaired.push('video_metadata_media_id_idx')
  }

  if (hasTable(sqlite, 'folderPaths') && !hasIndex(sqlite, 'folder_paths_path_unique_idx')) {
    sqlite.exec(
      'CREATE UNIQUE INDEX IF NOT EXISTS "folder_paths_path_unique_idx" ON "folderPaths" ("path")',
    )
    repaired.push('folder_paths_path_unique_idx')
  }

  if (hasTable(sqlite, 'faces') && !hasIndex(sqlite, 'faces_media_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "faces_media_id_idx" ON "faces" ("mediaId")',
    )
    repaired.push('faces_media_id_idx')
  }

  if (hasTable(sqlite, 'faces') && !hasIndex(sqlite, 'faces_tag_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "faces_tag_id_idx" ON "faces" ("tagId")',
    )
    repaired.push('faces_tag_id_idx')
  }

  if (hasTable(sqlite, 'faceEnrollments') && !hasIndex(sqlite, 'face_enrollments_tag_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "face_enrollments_tag_id_idx" ON "faceEnrollments" ("tagId")',
    )
    repaired.push('face_enrollments_tag_id_idx')
  }

  if (hasTable(sqlite, 'faceEnrollments') && !hasIndex(sqlite, 'face_enrollments_meta_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "face_enrollments_meta_id_idx" ON "faceEnrollments" ("metaId")',
    )
    repaired.push('face_enrollments_meta_id_idx')
  }

  if (hasTable(sqlite, 'media') && !hasIndex(sqlite, 'media_media_type_id_visual_hash_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "media_media_type_id_visual_hash_idx" ON "media" ("mediaTypeId", "visualHash")',
    )
    repaired.push('media_media_type_id_visual_hash_idx')
  }

  if (hasTable(sqlite, 'media') && !hasIndex(sqlite, 'media_favorite_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "media_favorite_id_idx" ON "media" ("favorite", "id")',
    )
    repaired.push('media_favorite_id_idx')
  }

  if (hasTable(sqlite, 'tagsInFolders') && !hasIndex(sqlite, 'tags_in_folders_meta_tag_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_in_folders_meta_tag_idx" ON "tagsInFolders" ("metaId", "tagId")',
    )
    repaired.push('tags_in_folders_meta_tag_idx')
  }

  if (hasTable(sqlite, 'tagsInMedia') && !hasIndex(sqlite, 'tags_in_media_meta_media_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_in_media_meta_media_idx" ON "tagsInMedia" ("metaId", "mediaId")',
    )
    repaired.push('tags_in_media_meta_media_idx')
  }

  if (hasTable(sqlite, 'tagsInMedia') && !hasIndex(sqlite, 'tags_in_media_tag_meta_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_in_media_tag_meta_idx" ON "tagsInMedia" ("tagId", "metaId")',
    )
    repaired.push('tags_in_media_tag_meta_idx')
  }

  if (hasTable(sqlite, 'tagsInMedia') && !hasIndex(sqlite, 'tags_in_media_media_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_in_media_media_id_idx" ON "tagsInMedia" ("mediaId")',
    )
    repaired.push('tags_in_media_media_id_idx')
  }

  if (hasTable(sqlite, 'tagsInTags') && !hasIndex(sqlite, 'tags_in_tags_tag_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_in_tags_tag_id_idx" ON "tagsInTags" ("tagId")',
    )
    repaired.push('tags_in_tags_tag_id_idx')
  }

  if (ensureTagsNameNormalizedUniqueIndex(sqlite)) {
    repaired.push(TAGS_NAME_NORMALIZED_UNIQUE_INDEX)
  }

  for (const spec of JOIN_UNIQUE_INDEXES) {
    if (!hasTable(sqlite, spec.table) || hasIndex(sqlite, spec.indexName)) continue

    const removed = dedupeJoinTableRows(sqlite, spec.table, spec.columns)
    const quotedCols = spec.columns.map((column) => `"${column}"`).join(', ')
    sqlite.exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${spec.indexName}" ON "${spec.table}" (${quotedCols})`,
    )
    repaired.push(removed > 0 ? `${spec.indexName} (deduped ${removed})` : spec.indexName)
  }

  return repaired
}

