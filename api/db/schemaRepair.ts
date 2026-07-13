import type Database from 'better-sqlite3'

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
  {table: 'meta', column: 'parser', definition: 'integer DEFAULT 0'},
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
  {table: 'meta', column: 'isLink', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'ratingIcon', definition: "text DEFAULT 'star'"},
  {table: 'meta', column: 'ratingIconEmpty', definition: "text DEFAULT 'star-outline'"},
  {table: 'meta', column: 'ratingIconHalf', definition: "text DEFAULT 'star-half-full'"},
  {table: 'meta', column: 'ratingMax', definition: 'integer DEFAULT 5'},
  {table: 'meta', column: 'ratingColor', definition: "text DEFAULT '#ffab00'"},
  {table: 'meta', column: 'ratingHalf', definition: 'integer DEFAULT 0'},
  {table: 'meta', column: 'sortBy', definition: "text DEFAULT 'createdAt'"},
  {table: 'meta', column: 'sortDir', definition: "text DEFAULT 'asc'"},
  {table: 'media', column: 'basename', definition: 'text'},
  {table: 'media', column: 'name', definition: 'text'},
  {table: 'media', column: 'ext', definition: 'text'},
  {table: 'media', column: 'filesize', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'contentHash', definition: 'text'},
  {table: 'media', column: 'oshash', definition: 'text'},
  {table: 'media', column: 'rating', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'favorite', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'bookmark', definition: 'text'},
  {table: 'media', column: 'views', definition: 'integer DEFAULT 0'},
  {table: 'media', column: 'oldId', definition: 'text'},
  {table: 'media', column: 'viewedAt', definition: 'text'},
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
]

export function repairSchemaColumns(sqlite: Database.Database): string[] {
  const repaired: string[] = []

  for (const spec of SCHEMA_REPAIRS) {
    if (addColumnIfMissing(sqlite, spec.table, spec.column, spec.definition)) {
      repaired.push(`${spec.table}.${spec.column}`)
    }
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

