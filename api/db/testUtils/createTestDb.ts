import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import {migrate} from 'drizzle-orm/better-sqlite3/migrator'
import {projectPath} from '../../../shared/projectRoot'
import { applySqlitePragmas } from '../pragmas'
import { runDrizzleMigrations } from '../drizzleMigrations'
import { repairSchemaColumns, repairMissingTables, repairMissingIndexes } from '../schemaRepair'
import * as schema from '../schema'

export type TestDb = {
  sqlite: Database.Database
  drizzle: ReturnType<typeof drizzle<typeof schema>>
  dbPath: string
}

/**
 * Builds a throwaway sqlite db through the real migration + schema-repair
 * path (unseeded), so unit tests always see the current production schema
 * instead of a hand-rolled CREATE TABLE that can silently drift from it.
 * Callers own cleanup: `sqlite.close()` then `fs.rmSync(dbPath, {force: true})`.
 */
export function createTestDb(prefix = 'test', throughMigration?: string): TestDb {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-${prefix}-${Date.now()}-${Math.random()}.sqlite`,
  )
  if (throughMigration) {
    // Build the actual historical schema; deleting journal entries from today's
    // schema leaves future columns behind and does not simulate an upgrade.
    const source = projectPath('api', 'db', 'migrations-drizzle')
    const journal = JSON.parse(fs.readFileSync(path.join(source, 'meta/_journal.json'), 'utf8')) as {entries: Array<{tag: string}>}
    const last = journal.entries.findIndex(entry => entry.tag === throughMigration)
    if (last < 0) throw new Error(`Unknown test migration: ${throughMigration}`)
    const futureColumns = journal.entries.slice(last + 1).flatMap(({tag}) => [...fs.readFileSync(path.join(source, `${tag}.sql`), 'utf8')
      .matchAll(/ALTER\s+TABLE\s+["`]?([\w]+)["`]?\s+ADD(?:\s+COLUMN)?\s+["`]?([\w]+)["`]?/gi)]
      .map(match => ({table: match[1], column: match[2]})))
    const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-historical-migrations-'))
    const historical = new Database(dbPath)
    try {
      journal.entries = journal.entries.slice(0, last + 1)
      fs.mkdirSync(path.join(folder, 'meta'))
      fs.writeFileSync(path.join(folder, 'meta/_journal.json'), JSON.stringify(journal))
      for (const {tag} of journal.entries) fs.copyFileSync(path.join(source, `${tag}.sql`), path.join(folder, `${tag}.sql`))
      applySqlitePragmas(historical)
      migrate(drizzle(historical), {migrationsFolder: folder})
      // Legacy application columns (e.g. Trash) were maintained outside Drizzle.
      // Retain those repairs, but never introduce a future migration's columns.
      repairSchemaColumns(historical)
      for (const {table, column} of futureColumns) {
        const columns = historical.pragma(`table_info("${table}")`) as Array<{name: string}>
        if (columns.some(entry => entry.name === column)) historical.exec(`ALTER TABLE "${table}" DROP COLUMN "${column}"`)
      }
    } finally { historical.close(); fs.rmSync(folder, {recursive: true, force: true}) }
  } else runDrizzleMigrations(dbPath)

  const sqlite = new Database(dbPath)
  applySqlitePragmas(sqlite)
  if (!throughMigration) {
    repairSchemaColumns(sqlite)
    repairMissingTables(sqlite)
    repairMissingIndexes(sqlite)
  }

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
    dbPath,
  }
}

export function closeTestDb(db: Pick<TestDb, 'sqlite' | 'dbPath'>) {
  db.sqlite.close()
  fs.rmSync(db.dbPath, {force: true})
}
