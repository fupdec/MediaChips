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

  it('bootstraps a fresh database with defaults and starter metadata', async () => {
    const dbPath = createTempDbPath()

    await bootstrapDatabase(dbPath)

    const sqlite = new Database(dbPath)
    try {
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM mediaTypes WHERE custom = 0`).get()).toEqual({count: 4})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM settings`).get()).toMatchObject({count: expect.any(Number)})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: 3})
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: 3})
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='media_media_type_id_idx'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='tags_name_normalized_unique'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='media_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tags_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 18})

      const metaNames = (
        sqlite.prepare(`SELECT name, type, parser FROM meta ORDER BY "order", name`).all() as Array<{
          name: string
          type: string
          parser: number
        }>
      )
      expect(metaNames).toEqual([
        {name: 'Tags', type: 'array', parser: 1},
        {name: 'Rating', type: 'rating', parser: 0},
        {name: 'Favorite', type: 'boolean', parser: 0},
      ])

      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM metaInMediaTypes`).get()).toEqual({count: 6})
      const tagNames = (
        sqlite.prepare(`SELECT name FROM tags ORDER BY name`).all() as Array<{name: string}>
      ).map((row) => row.name)
      expect(tagNames).toEqual(['Favorites', 'Rewatch', 'Watch later'])
      expect(
        sqlite.prepare(`SELECT value FROM settings WHERE option = 'ratingAndFavoriteInCard'`).get(),
      ).toEqual({value: '1'})
      expect(
        sqlite.prepare(`SELECT value FROM settings WHERE option = 'show_quick_action_button'`).get(),
      ).toEqual({value: '0'})
      expect(
        sqlite.prepare(`SELECT value FROM settings WHERE option = 'showPlaylistsInNavigation'`).get(),
      ).toEqual({value: '1'})
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
    const tagsCount = (before.prepare(`SELECT COUNT(*) as count FROM tags`).get() as {count: number}).count
    before.close()

    runPostMigrations(dbPath)

    const after = new Database(dbPath)
    try {
      expect(after.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: metaCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM settings`).get()).toEqual({count: settingsCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: tagsCount})
    } finally {
      after.close()
    }
  })

  it('backfills starter tags when Tags category exists but is empty', async () => {
    const dbPath = createTempDbPath()
    await bootstrapDatabase(dbPath)

    const sqlite = new Database(dbPath)
    try {
      sqlite.prepare('DELETE FROM tags').run()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: 0})
    } finally {
      sqlite.close()
    }

    runPostMigrations(dbPath)

    const after = new Database(dbPath)
    try {
      const tagNames = (
        after.prepare(`SELECT name FROM tags ORDER BY name`).all() as Array<{name: string}>
      ).map((row) => row.name)
      expect(tagNames).toEqual(['Favorites', 'Rewatch', 'Watch later'])
    } finally {
      after.close()
    }
  })
})
