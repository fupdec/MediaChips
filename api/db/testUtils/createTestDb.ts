import fs from 'fs'
import os from 'os'
import path from 'path'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
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
export function createTestDb(prefix = 'test'): TestDb {
  const dbPath = path.join(
    os.tmpdir(),
    `mediachips-${prefix}-${Date.now()}-${Math.random()}.sqlite`,
  )
  runDrizzleMigrations(dbPath)

  const sqlite = new Database(dbPath)
  applySqlitePragmas(sqlite)
  repairSchemaColumns(sqlite)
  repairMissingTables(sqlite)
  repairMissingIndexes(sqlite)

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
