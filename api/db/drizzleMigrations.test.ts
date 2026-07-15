import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import {
  ensureLegacyDrizzleBaseline,
  runDrizzleMigrations,
} from './drizzleMigrations'

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
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 8})
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
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 8})
    } finally {
      sqlite.close()
    }

    expect(() => runDrizzleMigrations(dbPath)).not.toThrow()

    const reopened = new Database(dbPath)
    try {
      expect(reopened.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 8})
    } finally {
      reopened.close()
    }
  })
})
