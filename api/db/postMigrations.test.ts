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
      // 5 media fields + 10 performer children
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: 15})
      // Tags(3) + Gender(6) + Eye color(6) + Hair colors(9)
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: 24})
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='media_media_type_id_idx'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='index' AND name='tags_name_normalized_unique'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='media_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='tags_fts'`).get()).toBeTruthy()
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM __drizzle_migrations`).get()).toEqual({count: 21})

      const mediaMeta = (
        sqlite.prepare(`
          SELECT m.name, m.type, m.parser, m.scraper, mim.scraper as assignmentScraper
          FROM meta m
          INNER JOIN metaInMediaTypes mim ON mim.metaId = m.id
          WHERE mim.mediaTypeId = (SELECT id FROM mediaTypes WHERE type = 'video' ORDER BY id LIMIT 1)
          ORDER BY mim."order", m.name
        `).all() as Array<{
          name: string
          type: string
          parser: number
          scraper: number
          assignmentScraper: string | null
        }>
      )
      expect(mediaMeta).toEqual([
        {name: 'Tags', type: 'array', parser: 1, scraper: 0, assignmentScraper: null},
        {name: 'Release date', type: 'date', parser: 0, scraper: 0, assignmentScraper: null},
        {name: 'Studio', type: 'array', parser: 0, scraper: 0, assignmentScraper: null},
        {name: 'Performers', type: 'array', parser: 0, scraper: 1, assignmentScraper: null},
        {name: 'Genres', type: 'array', parser: 0, scraper: 0, assignmentScraper: null},
      ])

      // 5 media fields × Videos + Images
      expect(sqlite.prepare(`SELECT COUNT(*) as count FROM metaInMediaTypes`).get()).toEqual({count: 10})

      const pinnedChildren = (
        sqlite.prepare(`
          SELECT c.name, c.type, c.measurementUnit, p.scraper, p."order"
          FROM pinnedMetas p
          INNER JOIN meta c ON c.id = p.pinnedMetaId
          INNER JOIN meta parent ON parent.id = p.metaId
          WHERE parent.name = 'Performers'
          ORDER BY p."order", c.name
        `).all() as Array<{
          name: string
          type: string
          measurementUnit: string | null
          scraper: string | null
          order: number
        }>
      )
      expect(pinnedChildren).toEqual([
        {name: 'Birthday', type: 'date', measurementUnit: null, scraper: null, order: 1},
        {name: 'Deathday', type: 'date', measurementUnit: null, scraper: null, order: 2},
        {name: 'Gender', type: 'array', measurementUnit: null, scraper: null, order: 3},
        {name: 'Place of birth', type: 'string', measurementUnit: null, scraper: null, order: 4},
        {name: 'Known for', type: 'string', measurementUnit: null, scraper: null, order: 5},
        {name: 'Height', type: 'number', measurementUnit: 'cm', scraper: null, order: 6},
        {name: 'Weight', type: 'number', measurementUnit: 'kg', scraper: null, order: 7},
        {name: 'Eye color', type: 'array', measurementUnit: null, scraper: null, order: 8},
        {name: 'Hair colors', type: 'array', measurementUnit: null, scraper: null, order: 9},
        {name: 'Tattoos', type: 'string', measurementUnit: null, scraper: null, order: 10},
      ])

      const tagsByCategory = (
        sqlite.prepare(`
          SELECT m.name as category, t.name as tag
          FROM tags t
          INNER JOIN meta m ON m.id = t.metaId
          WHERE m.name IN ('Tags', 'Gender', 'Eye color', 'Hair colors')
          ORDER BY m.name, t.name
        `).all() as Array<{category: string; tag: string}>
      )
      expect(tagsByCategory.filter((row) => row.category === 'Gender').map((row) => row.tag)).toEqual([
        'Female',
        'Intersex',
        'Male',
        'Non-Binary',
        'Transgender Female',
        'Transgender Male',
      ])
      expect(tagsByCategory.filter((row) => row.category === 'Eye color').map((row) => row.tag)).toEqual([
        'Amber',
        'Blue',
        'Brown',
        'Gray',
        'Green',
        'Hazel',
      ])
      expect(tagsByCategory.filter((row) => row.category === 'Hair colors').map((row) => row.tag)).toEqual([
        'Auburn',
        'Bald',
        'Black',
        'Blonde',
        'Brown hair',
        'Brunette',
        'Gray hair',
        'Redhead',
        'White',
      ])
      expect(tagsByCategory.filter((row) => row.category === 'Tags').map((row) => row.tag)).toEqual([
        'Favorites',
        'Rewatch',
        'Watch later',
      ])

      // Shared color words collide globally — hair uses distinct names + synonyms for scrapers.
      const brownHair = sqlite.prepare(`
        SELECT synonyms FROM tags WHERE name = 'Brown hair'
      `).get() as {synonyms: string}
      expect(brownHair.synonyms).toContain('Brown')
      const grayHair = sqlite.prepare(`
        SELECT synonyms FROM tags WHERE name = 'Gray hair'
      `).get() as {synonyms: string}
      expect(grayHair.synonyms).toMatch(/Gray|Grey/)

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
    const pinnedCount = (before.prepare(`SELECT COUNT(*) as count FROM pinnedMetas`).get() as {count: number}).count
    before.close()

    runPostMigrations(dbPath)

    const after = new Database(dbPath)
    try {
      expect(after.prepare(`SELECT COUNT(*) as count FROM meta`).get()).toEqual({count: metaCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM settings`).get()).toEqual({count: settingsCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM tags`).get()).toEqual({count: tagsCount})
      expect(after.prepare(`SELECT COUNT(*) as count FROM pinnedMetas`).get()).toEqual({count: pinnedCount})
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
