import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  ensureLegacyDrizzleBaseline,
  runDrizzleMigrations,
  stampSatisfiedAddColumnMigrations,
} from './drizzleMigrations'
import {projectPath} from '../../shared/projectRoot'

const MIGRATIONS_DIR = projectPath('api', 'db', 'migrations-drizzle')

function getMigrationCount(): number {
  return fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith('.sql')).length
}

describe('drizzleMigrations', () => {
  const tempFiles: string[] = []

  afterEach(() => {
    for (const filePath of tempFiles.splice(0)) {
      fs.rmSync(filePath, {force: true})
    }
  })

  function createTempDbPath(): string {
    const filePath = path.join(os.tmpdir(), `mediachips-drizzle-${Date.now()}-${Math.random()}.sqlite`)
    tempFiles.push(filePath)
    return filePath
  }

  it('creates schema on a fresh database', () => {
    const dbPath = createTempDbPath()

    runDrizzleMigrations(dbPath)

    const sqlite = new Database(dbPath)
    try {
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='media'`).get()).toBeTruthy()
      expect(sqlite.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name='media_favorite_id_idx'`,
      ).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: getMigrationCount()})
    } finally {
      sqlite.close()
    }
  })

  it('baselines umzug databases without re-running drizzle migrations', () => {
    const dbPath = createTempDbPath()
    runDrizzleMigrations(dbPath)

    const sqlite = new Database(dbPath)
    try {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS SequelizeMeta (name TEXT PRIMARY KEY)`)
      sqlite.exec(`INSERT INTO SequelizeMeta (name) VALUES ('00_initial.js')`)
      sqlite.exec(`DELETE FROM __drizzle_migrations`)
      ensureLegacyDrizzleBaseline(sqlite)
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: getMigrationCount()})
    } finally {
      sqlite.close()
    }

    expect(() => runDrizzleMigrations(dbPath)).not.toThrow()

    const reopened = new Database(dbPath)
    try {
      expect(reopened.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: getMigrationCount()})
    } finally {
      reopened.close()
    }
  })

  it('does not stamp new journal entries on already-baselined Sequelize databases', () => {
    const dbPath = createTempDbPath()
    runDrizzleMigrations(dbPath)

    const sqlite = new Database(dbPath)
    try {
      sqlite.exec(`CREATE TABLE IF NOT EXISTS SequelizeMeta (name TEXT PRIMARY KEY)`)
      sqlite.exec(`INSERT OR IGNORE INTO SequelizeMeta (name) VALUES ('00_initial.js')`)

      // Simulate a previously baselined DB that is missing a newer column.
      sqlite.exec(`DELETE FROM __drizzle_migrations WHERE created_at >= 1782832800000`)
      try {
        sqlite.exec(`ALTER TABLE watchedFolders DROP COLUMN icon`)
      } catch {
        // SQLite < 3.35 may not support DROP COLUMN; ignore.
      }
      try {
        sqlite.exec(`ALTER TABLE watchedFolders DROP COLUMN excludedPaths`)
      } catch {
        // ignore
      }

      const before = sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get() as {count: number}
      ensureLegacyDrizzleBaseline(sqlite)
      const after = sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get() as {count: number}
      expect(after.count).toBe(before.count)
    } finally {
      sqlite.close()
    }
  })

  it('stamps ADD COLUMN migrations when schemaRepair already added the columns', () => {
    const dbPath = createTempDbPath()
    runDrizzleMigrations(dbPath)

    const sqlite = new Database(dbPath)
    try {
      sqlite.exec(`DELETE FROM __drizzle_migrations WHERE created_at >= 1782836400000`)
      const stamped = stampSatisfiedAddColumnMigrations(sqlite)
      expect(stamped).toContain('0024_saved_filters_join')
      expect(() => runDrizzleMigrations(dbPath)).not.toThrow()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({
        count: getMigrationCount(),
      })
    } finally {
      sqlite.close()
    }
  })

  it('stamps CREATE TABLE migrations when schemaRepair already created the table', () => {
    const dbPath = createTempDbPath()
    runDrizzleMigrations(dbPath)

    const sqlite = new Database(dbPath)
    try {
      sqlite.exec(`DELETE FROM __drizzle_migrations WHERE created_at >= 1782822000000`)
      const stamped = stampSatisfiedAddColumnMigrations(sqlite)
      expect(stamped).toContain('0020_media_clip_embeddings')
      expect(() => runDrizzleMigrations(dbPath)).not.toThrow()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({
        count: getMigrationCount(),
      })
    } finally {
      sqlite.close()
    }
  })
})
