import type Database from 'better-sqlite3'

const FTS_BACKFILL_BATCH_SIZE = 2000
const LEGACY_FTS_MARKER = 'contentless_delete=1'

const MEDIA_FTS_TRIGGERS = [
  'media_fts_insert',
  'media_fts_delete',
  'media_fts_update',
] as const

const TAGS_FTS_TRIGGERS = [
  'tags_fts_insert',
  'tags_fts_delete',
  'tags_fts_update',
] as const

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined

  return Boolean(row)
}

function getFtsTableSql(sqlite: Database.Database, tableName: string): string {
  const row = sqlite.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {sql?: string} | undefined

  return row?.sql ?? ''
}

function isModernFtsTable(sqlite: Database.Database, tableName: string): boolean {
  if (!hasTable(sqlite, tableName)) return false
  return getFtsTableSql(sqlite, tableName).includes(LEGACY_FTS_MARKER)
}

function dropFtsTriggers(sqlite: Database.Database, triggerNames: readonly string[]) {
  for (const triggerName of triggerNames) {
    sqlite.exec(`DROP TRIGGER IF EXISTS ${triggerName}`)
  }
}

function dropSearchFtsTables(sqlite: Database.Database) {
  dropFtsTriggers(sqlite, MEDIA_FTS_TRIGGERS)
  dropFtsTriggers(sqlite, TAGS_FTS_TRIGGERS)
  sqlite.exec(`
    DROP TABLE IF EXISTS media_fts;
    DROP TABLE IF EXISTS tags_fts;
  `)
}

function backfillMediaFts(sqlite: Database.Database) {
  const insert = sqlite.prepare(`INSERT INTO media_fts(rowid, name) VALUES (?, ?)`)
  const selectBatch = sqlite.prepare(`
    SELECT id, COALESCE(name, '') AS name
    FROM media
    WHERE id > ?
    ORDER BY id
    LIMIT ?
  `)

  let lastId = 0
  while (true) {
    const rows = selectBatch.all(lastId, FTS_BACKFILL_BATCH_SIZE) as Array<{id: number; name: string}>
    if (!rows.length) break

    const backfill = sqlite.transaction((batch: Array<{id: number; name: string}>) => {
      for (const row of batch) {
        insert.run(row.id, row.name)
      }
    })
    backfill(rows)
    lastId = rows[rows.length - 1].id
  }
}

function backfillTagsFts(sqlite: Database.Database) {
  const insert = sqlite.prepare(`INSERT INTO tags_fts(rowid, name, synonyms) VALUES (?, ?, ?)`)
  const selectBatch = sqlite.prepare(`
    SELECT id, COALESCE(name, '') AS name, COALESCE(synonyms, '') AS synonyms
    FROM tags
    WHERE id > ?
    ORDER BY id
    LIMIT ?
  `)

  let lastId = 0
  while (true) {
    const rows = selectBatch.all(lastId, FTS_BACKFILL_BATCH_SIZE) as Array<{
      id: number
      name: string
      synonyms: string
    }>
    if (!rows.length) break

    const backfill = sqlite.transaction((batch: Array<{id: number; name: string; synonyms: string}>) => {
      for (const row of batch) {
        insert.run(row.id, row.name, row.synonyms)
      }
    })
    backfill(rows)
    lastId = rows[rows.length - 1].id
  }
}

function createMediaFts(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE media_fts USING fts5(
      name,
      content='',
      contentless_delete=1,
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER media_fts_insert AFTER INSERT ON media BEGIN
      INSERT INTO media_fts(rowid, name) VALUES (new.id, COALESCE(new.name, ''));
    END;

    CREATE TRIGGER media_fts_delete AFTER DELETE ON media BEGIN
      DELETE FROM media_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER media_fts_update AFTER UPDATE OF name ON media BEGIN
      DELETE FROM media_fts WHERE rowid = old.id;
      INSERT INTO media_fts(rowid, name) VALUES (new.id, COALESCE(new.name, ''));
    END;
  `)
  backfillMediaFts(sqlite)
}

function createTagsFts(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE VIRTUAL TABLE tags_fts USING fts5(
      name,
      synonyms,
      content='',
      contentless_delete=1,
      tokenize='unicode61 remove_diacritics 2'
    );

    CREATE TRIGGER tags_fts_insert AFTER INSERT ON tags BEGIN
      INSERT INTO tags_fts(rowid, name, synonyms)
      VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.synonyms, ''));
    END;

    CREATE TRIGGER tags_fts_delete AFTER DELETE ON tags BEGIN
      DELETE FROM tags_fts WHERE rowid = old.id;
    END;

    CREATE TRIGGER tags_fts_update AFTER UPDATE OF name, synonyms ON tags BEGIN
      DELETE FROM tags_fts WHERE rowid = old.id;
      INSERT INTO tags_fts(rowid, name, synonyms)
      VALUES (new.id, COALESCE(new.name, ''), COALESCE(new.synonyms, ''));
    END;
  `)
  backfillTagsFts(sqlite)
}

function recreateSearchFtsIndex(sqlite: Database.Database): string[] {
  dropSearchFtsTables(sqlite)
  createMediaFts(sqlite)
  createTagsFts(sqlite)
  return ['media_fts', 'tags_fts']
}

export function ensureSearchFtsIndex(sqlite: Database.Database): string[] {
  const hasMediaFts = hasTable(sqlite, 'media_fts')
  const hasTagsFts = hasTable(sqlite, 'tags_fts')

  if (!hasMediaFts && !hasTagsFts) {
    return recreateSearchFtsIndex(sqlite)
  }

  const needsMigration = (hasMediaFts && !isModernFtsTable(sqlite, 'media_fts'))
    || (hasTagsFts && !isModernFtsTable(sqlite, 'tags_fts'))

  if (needsMigration) {
    return recreateSearchFtsIndex(sqlite)
  }

  return []
}

export function hasSearchFtsIndex(sqlite: Database.Database): boolean {
  return isModernFtsTable(sqlite, 'media_fts') && isModernFtsTable(sqlite, 'tags_fts')
}
