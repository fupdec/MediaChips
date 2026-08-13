import fs from 'fs'
import {projectPath} from '../../shared/projectRoot'
import path from 'path'
import crypto from 'crypto'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { applySqlitePragmas } from './pragmas'
import { renameDuplicateTagNames } from './ensureGlobalUniqueTagNames'

const MIGRATIONS_FOLDER = projectPath('api', 'db', 'migrations-drizzle')
const JOURNAL_PATH = path.join(MIGRATIONS_FOLDER, 'meta/_journal.json')

type JournalEntry = {
  idx: number
  when: number
  tag: string
}

type DrizzleJournal = {
  entries: JournalEntry[]
}

function readJournal(): DrizzleJournal {
  return JSON.parse(fs.readFileSync(JOURNAL_PATH, 'utf8')) as DrizzleJournal
}

function migrationSqlPath(tag: string): string {
  return path.join(MIGRATIONS_FOLDER, `${tag}.sql`)
}

function hashMigrationSql(sql: string): string {
  return crypto.createHash('sha256').update(sql).digest('hex')
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined

  return Boolean(row)
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  if (!hasTable(sqlite, tableName)) {
    return false
  }

  const columns = sqlite.pragma(`table_info(${tableName})`) as Array<{name: string}>
  return columns.some((column) => column.name === columnName)
}

function ensureDrizzleMigrationsTable(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at numeric
    )
  `)
}

function stampMigrationIfMissing(sqlite: Database.Database, entry: JournalEntry) {
  const sql = fs.readFileSync(migrationSqlPath(entry.tag), 'utf8')
  const hash = hashMigrationSql(sql)
  const exists = sqlite.prepare(
    'SELECT 1 FROM __drizzle_migrations WHERE hash = ? LIMIT 1',
  ).get(hash)

  if (!exists) {
    sqlite.prepare(
      'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
    ).run(hash, entry.when)
  }
}

function addColumnCaptureRegex(): RegExp {
  return /ALTER\s+TABLE\s+[`"]?(\w+)[`"]?\s+ADD\s+COLUMN\s+[`"]?(\w+)[`"]?/gi
}

function addColumnStatementRegex(): RegExp {
  return /ALTER\s+TABLE\s+[`"]?\w+[`"]?\s+ADD\s+COLUMN\s+[^;]+;?/gi
}

/**
 * When schemaRepair (or a prior partial boot) already added columns, stamp the
 * matching ADD COLUMN drizzle migrations so migrate() does not fail with
 * "duplicate column name".
 */
export function stampSatisfiedAddColumnMigrations(sqlite: Database.Database): string[] {
  if (!hasTable(sqlite, '__drizzle_migrations')) {
    return []
  }

  const stamped: string[] = []
  const journal = readJournal()

  for (const entry of journal.entries) {
    const sql = fs.readFileSync(migrationSqlPath(entry.tag), 'utf8')
    const hash = hashMigrationSql(sql)
    const exists = sqlite.prepare(
      'SELECT 1 FROM __drizzle_migrations WHERE hash = ? LIMIT 1',
    ).get(hash)
    if (exists) {
      continue
    }

    const matches = [...sql.matchAll(addColumnCaptureRegex())]
    if (matches.length === 0) {
      continue
    }

    // Only auto-stamp pure ADD COLUMN migrations (ignore CREATE INDEX / etc.).
    const withoutBreakpoints = sql.replace(/-->\s*statement-breakpoint/g, '')
    const withoutAddColumns = withoutBreakpoints.replace(addColumnStatementRegex(), '').trim()
    if (withoutAddColumns.length > 0) {
      continue
    }

    const allPresent = matches.every((match) => {
      const table = match[1]
      const column = match[2]
      return Boolean(table && column && hasColumn(sqlite, table, column))
    })
    if (!allPresent) {
      continue
    }

    stampMigrationIfMissing(sqlite, entry)
    stamped.push(entry.tag)
  }

  return stamped
}

export function ensureLegacyDrizzleBaseline(sqlite: Database.Database) {
  if (!hasTable(sqlite, 'media')) {
    return
  }

  ensureDrizzleMigrationsTable(sqlite)
  const journal = readJournal()

  const appliedCount = sqlite.prepare(
    'SELECT COUNT(*) as count FROM __drizzle_migrations',
  ).get() as {count: number}

  // Already tracked by drizzle — never stamp newer journal entries here.
  // Stamping on every boot caused new migrations (e.g. watchedFolders.icon)
  // to be marked applied without running their SQL on Sequelize-era DBs.
  if (Number(appliedCount.count) > 0) {
    return
  }

  if (hasTable(sqlite, 'SequelizeMeta')) {
    const umzugCount = sqlite.prepare(
      'SELECT COUNT(*) as count FROM SequelizeMeta',
    ).get() as {count: number}

    if (Number(umzugCount.count) > 0) {
      for (const entry of journal.entries) {
        stampMigrationIfMissing(sqlite, entry)
      }
      return
    }
  }

  const initialEntry = journal.entries[0]
  if (!initialEntry) {
    return
  }

  stampMigrationIfMissing(sqlite, initialEntry)
}

export function dropAllSqliteTables(sqlite: Database.Database) {
  sqlite.pragma('foreign_keys = OFF')

  const tables = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
  ).all() as Array<{name: string}>

  for (const {name} of tables) {
    sqlite.exec(`DROP TABLE IF EXISTS "${name}"`)
  }

  sqlite.pragma('foreign_keys = ON')
}

export function runDrizzleMigrations(dbPath: string) {
  const sqlite = new Database(dbPath)

  try {
    applySqlitePragmas(sqlite)
    ensureLegacyDrizzleBaseline(sqlite)
    // Must run before unique index migration so CREATE UNIQUE INDEX succeeds.
    const renamed = renameDuplicateTagNames(sqlite)
    if (renamed > 0) {
      console.log('\x1b[33m%s\x1b[0m', `⚙️ Renamed ${renamed} duplicate tag name(s) for global uniqueness`)
    }

    const stamped = stampSatisfiedAddColumnMigrations(sqlite)
    if (stamped.length > 0) {
      console.log(
        '\x1b[33m%s\x1b[0m',
        `⚙️ Stamped already-applied column migrations: ${stamped.join(', ')}`,
      )
    }

    const db = drizzle(sqlite)
    migrate(db, {migrationsFolder: MIGRATIONS_FOLDER})
  } finally {
    sqlite.close()
  }
}

export function resetSqliteDatabase(dbPath: string) {
  const sqlite = new Database(dbPath)

  try {
    dropAllSqliteTables(sqlite)
  } finally {
    sqlite.close()
  }
}

