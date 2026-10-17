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
  {table: 'sourceConnections', column: 'provider', definition: "text NOT NULL DEFAULT 'nas'"},
  {table: 'mediaLocations', column: 'availability', definition: "text NOT NULL DEFAULT 'unknown'"},
  {table: 'mediaLocations', column: 'lastVerifiedAt', definition: 'text'},
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
  {table: 'tags', column: 'parentTagId', definition: 'integer'},
  {table: 'meta', column: 'parentMetaId', definition: 'integer'},
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
  {table: 'savedFilters', column: 'icon', definition: 'text'},
]

/** Drop join rows left behind after a watched folder or media type was deleted. */
export function repairOrphanedWatchedFolderLinks(sqlite: Database.Database): number {
  if (!hasTable(sqlite, 'mediaTypesInWatchedFolders')) return 0

  const conditions: string[] = []
  if (hasTable(sqlite, 'watchedFolders')) {
    conditions.push('"folderId" NOT IN (SELECT "id" FROM "watchedFolders")')
  }
  if (hasTable(sqlite, 'mediaTypes')) {
    conditions.push('"mediaTypeId" NOT IN (SELECT "id" FROM "mediaTypes")')
  }
  if (!conditions.length) return 0

  const result = sqlite.prepare(`
    DELETE FROM "mediaTypesInWatchedFolders"
    WHERE ${conditions.join(' OR ')}
  `).run()

  return Number(result.changes ?? 0)
}

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
  originalOperationJobs: `CREATE TABLE "originalOperationJobs" ("id" text PRIMARY KEY NOT NULL, "payload" text NOT NULL)`,
  sourceCatalogRoots: `CREATE TABLE "sourceCatalogRoots" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL DEFAULT '',
  "connectionId" text NOT NULL REFERENCES "sourceConnections"("id"),
  "rootKey" text NOT NULL,
  "intervalMinutes" integer NOT NULL DEFAULT 0,
  "nextRunAt" integer,
  "lastCompletedAt" text,
  "lastResult" text,
  "lastError" text

  )`,
  sourceCatalogEntries: `CREATE TABLE "sourceCatalogEntries" (
  "rootId" text NOT NULL REFERENCES "sourceCatalogRoots"("id") ON DELETE CASCADE,
  "resourceKey" text NOT NULL,
  "version" text NOT NULL,
  "name" text NOT NULL

  )`,
  offlineCopies: `CREATE TABLE "offlineCopies" (
  "locationId" text PRIMARY KEY NOT NULL REFERENCES "mediaLocations"("id") ON DELETE CASCADE,
  "version" text NOT NULL,
  "size" integer NOT NULL,
  "fileName" text NOT NULL,
  "invalidated" integer NOT NULL DEFAULT 0,
  "contentType" text NOT NULL

  )`,
  sourceCacheSettings: `CREATE TABLE "sourceCacheSettings" (
  "id" integer PRIMARY KEY NOT NULL,
  "limitBytes" integer NOT NULL DEFAULT 5368709120

  )`,
  sourceConnections: `CREATE TABLE "sourceConnections" (
    "id" text PRIMARY KEY NOT NULL, "config" text NOT NULL,
    "credentialRef" text NOT NULL, "createdAt" text NOT NULL, "provider" text NOT NULL DEFAULT 'nas'
  )`,
  mediaLocations: `CREATE TABLE "mediaLocations" (
    "id" text PRIMARY KEY NOT NULL,
    "mediaId" integer NOT NULL REFERENCES "media"("id") ON DELETE CASCADE,
    "connectionId" text NOT NULL REFERENCES "sourceConnections"("id"),
    "resourceKey" text NOT NULL, "version" text NOT NULL,
    "availability" text NOT NULL DEFAULT 'unknown', "lastVerifiedAt" text
  )`,
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

  const ensureIndex = (
    table: string,
    indexName: string,
    createSql: string,
    options?: {requireColumns?: string[]},
  ) => {
    if (!hasTable(sqlite, table)) return
    if (options?.requireColumns?.some((column) => !hasColumn(sqlite, table, column))) return
    if (hasIndex(sqlite, indexName)) return
    sqlite.exec(createSql)
    repaired.push(indexName)
  }

  ensureIndex('sourceCatalogRoots', 'source_catalog_root_idx',
    'CREATE UNIQUE INDEX IF NOT EXISTS "source_catalog_root_idx" ON "sourceCatalogRoots" ("connectionId", "rootKey")')
  ensureIndex('sourceCatalogEntries', 'source_catalog_entry_idx',
    'CREATE UNIQUE INDEX IF NOT EXISTS "source_catalog_entry_idx" ON "sourceCatalogEntries" ("rootId", "resourceKey")')
  ensureIndex('mediaLocations', 'media_locations_resource_idx',
    'CREATE UNIQUE INDEX IF NOT EXISTS "media_locations_resource_idx" ON "mediaLocations" ("connectionId", "resourceKey", "version")')
  ensureIndex('mediaLocations', 'media_locations_media_idx',
    'CREATE INDEX IF NOT EXISTS "media_locations_media_idx" ON "mediaLocations" ("mediaId")')

  // 0001 performance / list-sort suite
  ensureIndex(
    'media',
    'media_content_hash_idx',
    'CREATE INDEX IF NOT EXISTS "media_content_hash_idx" ON "media" ("contentHash")',
    {requireColumns: ['contentHash']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_idx" ON "media" ("mediaTypeId")',
    {requireColumns: ['mediaTypeId']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_id_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_id_idx" ON "media" ("mediaTypeId", "id")',
    {requireColumns: ['mediaTypeId', 'id']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_created_at_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_created_at_idx" ON "media" ("mediaTypeId", "createdAt")',
    {requireColumns: ['mediaTypeId', 'createdAt']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_updated_at_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_updated_at_idx" ON "media" ("mediaTypeId", "updatedAt")',
    {requireColumns: ['mediaTypeId', 'updatedAt']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_rating_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_rating_idx" ON "media" ("mediaTypeId", "rating")',
    {requireColumns: ['mediaTypeId', 'rating']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_viewed_at_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_viewed_at_idx" ON "media" ("mediaTypeId", "viewedAt")',
    {requireColumns: ['mediaTypeId', 'viewedAt']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_views_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_views_idx" ON "media" ("mediaTypeId", "views")',
    {requireColumns: ['mediaTypeId', 'views']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_favorite_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_favorite_idx" ON "media" ("mediaTypeId", "favorite")',
    {requireColumns: ['mediaTypeId', 'favorite']},
  )
  ensureIndex(
    'valuesInMedia',
    'values_in_media_media_id_idx',
    'CREATE INDEX IF NOT EXISTS "values_in_media_media_id_idx" ON "valuesInMedia" ("mediaId")',
    {requireColumns: ['mediaId']},
  )
  ensureIndex(
    'valuesInMedia',
    'values_in_media_meta_media_idx',
    'CREATE INDEX IF NOT EXISTS "values_in_media_meta_media_idx" ON "valuesInMedia" ("metaId", "mediaId")',
    {requireColumns: ['metaId', 'mediaId']},
  )
  ensureIndex(
    'mediaInPlaylists',
    'media_in_playlists_playlist_id_idx',
    'CREATE INDEX IF NOT EXISTS "media_in_playlists_playlist_id_idx" ON "mediaInPlaylists" ("playlistId")',
    {requireColumns: ['playlistId']},
  )
  ensureIndex(
    'filterRowsInSavedFilters',
    'filter_rows_in_saved_filter_filter_id_idx',
    'CREATE INDEX IF NOT EXISTS "filter_rows_in_saved_filter_filter_id_idx" ON "filterRowsInSavedFilters" ("filterId")',
    {requireColumns: ['filterId']},
  )
  ensureIndex(
    'tagsInFilterRows',
    'tags_in_filter_row_row_id_idx',
    'CREATE INDEX IF NOT EXISTS "tags_in_filter_row_row_id_idx" ON "tagsInFilterRows" ("rowId")',
    {requireColumns: ['rowId']},
  )

  // 0031 list-path sorts / tag category lists
  ensureIndex(
    'media',
    'media_media_type_id_name_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_name_idx" ON "media" ("mediaTypeId", "name")',
    {requireColumns: ['mediaTypeId', 'name']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_path_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_path_idx" ON "media" ("mediaTypeId", "path")',
    {requireColumns: ['mediaTypeId', 'path']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_ext_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_ext_idx" ON "media" ("mediaTypeId", "ext")',
    {requireColumns: ['mediaTypeId', 'ext']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_media_created_at_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_media_created_at_idx" ON "media" ("mediaTypeId", "mediaCreatedAt")',
    {requireColumns: ['mediaTypeId', 'mediaCreatedAt']},
  )
  ensureIndex(
    'videoMetadata',
    'video_metadata_duration_idx',
    'CREATE INDEX IF NOT EXISTS "video_metadata_duration_idx" ON "videoMetadata" ("duration")',
    {requireColumns: ['duration']},
  )
  ensureIndex(
    'tags',
    'tags_meta_id_id_idx',
    'CREATE INDEX IF NOT EXISTS "tags_meta_id_id_idx" ON "tags" ("metaId", "id")',
    {requireColumns: ['metaId', 'id']},
  )
  ensureIndex(
    'tags',
    'tags_meta_id_name_idx',
    'CREATE INDEX IF NOT EXISTS "tags_meta_id_name_idx" ON "tags" ("metaId", "name")',
    {requireColumns: ['metaId', 'name']},
  )
  ensureIndex(
    'tags',
    'tags_meta_id_created_at_idx',
    'CREATE INDEX IF NOT EXISTS "tags_meta_id_created_at_idx" ON "tags" ("metaId", "createdAt")',
    {requireColumns: ['metaId', 'createdAt']},
  )
  ensureIndex(
    'tags',
    'tags_meta_id_rating_idx',
    'CREATE INDEX IF NOT EXISTS "tags_meta_id_rating_idx" ON "tags" ("metaId", "rating")',
    {requireColumns: ['metaId', 'rating']},
  )
  ensureIndex(
    'tags',
    'tags_meta_id_favorite_idx',
    'CREATE INDEX IF NOT EXISTS "tags_meta_id_favorite_idx" ON "tags" ("metaId", "favorite")',
    {requireColumns: ['metaId', 'favorite']},
  )

  // 0004 / 0007 — duplicate-scan helpers (migrations exist; repair for legacy DBs)
  ensureIndex(
    'media',
    'media_media_type_id_basename_filesize_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_basename_filesize_idx" ON "media" ("mediaTypeId", "basename", "filesize")',
    {requireColumns: ['mediaTypeId', 'basename', 'filesize']},
  )
  ensureIndex(
    'media',
    'media_media_type_id_oshash_idx',
    'CREATE INDEX IF NOT EXISTS "media_media_type_id_oshash_idx" ON "media" ("mediaTypeId", "oshash")',
    {requireColumns: ['mediaTypeId', 'oshash']},
  )

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

  if (
    hasTable(sqlite, 'media')
    && hasColumn(sqlite, 'media', 'visualHash')
    && !hasIndex(sqlite, 'media_media_type_id_visual_hash_idx')
  ) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "media_media_type_id_visual_hash_idx" ON "media" ("mediaTypeId", "visualHash")',
    )
    repaired.push('media_media_type_id_visual_hash_idx')
  }

  if (
    hasTable(sqlite, 'media')
    && hasColumn(sqlite, 'media', 'favorite')
    && !hasIndex(sqlite, 'media_favorite_id_idx')
  ) {
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

  if (hasTable(sqlite, 'tags') && hasColumn(sqlite, 'tags', 'parentTagId') && !hasIndex(sqlite, 'tags_parent_tag_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "tags_parent_tag_id_idx" ON "tags" ("parentTagId")',
    )
    repaired.push('tags_parent_tag_id_idx')
  }

  if (hasTable(sqlite, 'meta') && hasColumn(sqlite, 'meta', 'parentMetaId') && !hasIndex(sqlite, 'meta_parent_meta_id_idx')) {
    sqlite.exec(
      'CREATE INDEX IF NOT EXISTS "meta_parent_meta_id_idx" ON "meta" ("parentMetaId")',
    )
    repaired.push('meta_parent_meta_id_idx')
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

