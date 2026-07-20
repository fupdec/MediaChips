import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import Database from 'better-sqlite3'
import { bootstrapDatabase } from './migrationRunner'
import { runPostMigrations } from './postMigrations'

describe('postMigrations', () => {
  const tempFiles: string[] = []

  afterEach(() => {
    for (const filePath of tempFiles.splice(0)) {
      fs.rmSync(filePath, {force: true})
    }
  })

  function createTempDbPath(): string {
    const filePath = path.join(os.tmpdir(), `mediachips-post-${Date.now()}-${Math.random()}.sqlite`)
    tempFiles.push(filePath)
    return filePath
  }

  it('bootstraps a fresh database with defaults and demo metadata', async () => {
    const dbPath = createTempDbPath()

    await bootstrapDatabase(dbPath)

    const sqlite = new Database(dbPath)
    try {
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM mediaTypes WHERE custom = 0`).get()).toEqual({count: 4})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM settings`).get()).toMatchObject({count: expect.any(Number)})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: 1})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: 3})
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='media_media_type_id_idx'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='media_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tags_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 11})
    } finally {
      sqlite.close()
    }
  })

  it('is idempotent on an already bootstrapped database', async () => {
    const dbPath = createTempDbPath()
    await bootstrapDatabase(dbPath)

    const before = new Database(dbPath)
    const metaCount = (before.prepare(`SELECT COUNT(*) as count FROM meta`).get() as {count: number}).count
    const settingsCount = (before.prepare(`SELECT COUNT(*) as count FROM settings`).get() as {count: number}).count
    before.close()

    runPostMigrations(dbPath)

    const after = new Database(dbPath)
    try {
      expect(after.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: metaCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM settings`).get()).toEqual({count: settingsCount})
    } finally {
      after.close()
    }
  })
})
