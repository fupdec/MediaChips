import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {eq} from 'drizzle-orm'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {meta} from '../db/schema/meta'
import {metaSettings} from '../db/schema/metaSettings'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {pinnedMetas} from '../db/schema/pinnedMeta'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {filterRows} from '../db/schema/filterRows'
import {savedFilters} from '../db/schema/savedFilters'
import type {ApiDb} from '../types/db'
import {mergeTagCategories, MetaCategoryMergeError} from './metaCategoryMerge'

function createTestDb() {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      name TEXT,
      icon TEXT,
      hint TEXT,
      "order" INTEGER,
      views INTEGER DEFAULT 0,
      oldId TEXT,
      synonyms INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      nested INTEGER DEFAULT 0,
      marks INTEGER DEFAULT 0,
      bookmark INTEGER DEFAULT 0,
      parser INTEGER DEFAULT 0,
      country INTEGER DEFAULT 0,
      career INTEGER DEFAULT 0,
      scraper INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 1,
      chipVariant TEXT DEFAULT 'flat',
      chipLabel INTEGER DEFAULT 0,
      color INTEGER DEFAULT 0,
      autoColorFromImage INTEGER DEFAULT 0,
      imageAspectRatio REAL DEFAULT 1,
      tagPageDesign TEXT DEFAULT 'profile',
      isLink INTEGER DEFAULT 0,
      ratingIcon TEXT DEFAULT 'star',
      ratingIconEmpty TEXT DEFAULT 'star-outline',
      ratingIconHalf TEXT DEFAULT 'star-half-full',
      ratingMax INTEGER DEFAULT 5,
      ratingColor TEXT DEFAULT '#ffab00',
      ratingHalf INTEGER DEFAULT 0,
      sortBy TEXT DEFAULT 'createdAt',
      sortDir TEXT DEFAULT 'asc',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE metaSettings (
      metaId INTEGER PRIMARY KEY,
      synonyms INTEGER DEFAULT 0,
      hidden INTEGER DEFAULT 0,
      nested INTEGER DEFAULT 0,
      marks INTEGER DEFAULT 0,
      bookmark INTEGER DEFAULT 0,
      parser INTEGER DEFAULT 0,
      country INTEGER DEFAULT 0,
      career INTEGER DEFAULT 0,
      scraper INTEGER DEFAULT 0,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 1,
      chipOutlined INTEGER DEFAULT 0,
      chipLabel INTEGER DEFAULT 0,
      color INTEGER DEFAULT 0,
      imageAspectRatio REAL DEFAULT 1,
      isLink INTEGER DEFAULT 0,
      ratingIcon TEXT DEFAULT 'star',
      ratingIconEmpty TEXT DEFAULT 'star-outline',
      ratingIconHalf TEXT DEFAULT 'star-half-full',
      ratingMax INTEGER DEFAULT 5,
      ratingColor TEXT DEFAULT '#ffab00',
      ratingHalf INTEGER DEFAULT 0,
      sortBy TEXT DEFAULT 'createdAt',
      sortDir TEXT DEFAULT 'asc'
    );
    CREATE TABLE metaInMediaTypes (
      metaId INTEGER NOT NULL,
      mediaTypeId INTEGER NOT NULL,
      scraper TEXT,
      show INTEGER DEFAULT 1,
      "order" INTEGER,
      PRIMARY KEY (metaId, mediaTypeId)
    );
    CREATE TABLE pinnedMetas (
      metaId INTEGER NOT NULL,
      pinnedMetaId INTEGER NOT NULL,
      scraper TEXT,
      show INTEGER DEFAULT 1,
      "order" INTEGER,
      PRIMARY KEY (metaId, pinnedMetaId)
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      oldId TEXT UNIQUE,
      name TEXT NOT NULL,
      synonyms TEXT,
      rating INTEGER DEFAULT 0 NOT NULL,
      favorite INTEGER DEFAULT 0 NOT NULL,
      bookmark TEXT,
      country TEXT,
      color TEXT,
      views INTEGER DEFAULT 0,
      viewedAt TEXT,
      metaId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE tagsInMedia (
      mediaId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (mediaId, tagId, metaId)
    );
    CREATE TABLE tagsInTags (
      parentTagId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (parentTagId, tagId, metaId)
    );
    CREATE TABLE tagsInFilterRows (
      tagId INTEGER NOT NULL,
      rowId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (tagId, rowId, metaId)
    );
    CREATE TABLE valuesInTags (
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (tagId, metaId)
    );
    CREATE TABLE marks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      text TEXT,
      time INTEGER,
      end INTEGER,
      tagId INTEGER,
      mediaId INTEGER
    );
    CREATE TABLE tabs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      icon TEXT,
      url TEXT,
      "order" INTEGER DEFAULT 0,
      metaId INTEGER,
      mediaTypeId INTEGER,
      tagId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE savedFilters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      metaId INTEGER,
      mediaTypeId INTEGER,
      tagId INTEGER,
      tabId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE pageSettings (
      page INTEGER DEFAULT 1,
      size INTEGER DEFAULT 3,
      view INTEGER DEFAULT 1,
      "limit" INTEGER DEFAULT 101,
      sortBy TEXT DEFAULT 'createdAt',
      sortDir TEXT DEFAULT 'asc',
      firstChar TEXT,
      colors TEXT,
      metaId INTEGER,
      mediaTypeId INTEGER,
      tagId INTEGER,
      filterId INTEGER,
      tabId INTEGER
    );
    CREATE TABLE filterRows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      param TEXT,
      type TEXT,
      cond TEXT,
      val TEXT,
      active INTEGER,
      note TEXT,
      lock INTEGER,
      "union" TEXT,
      metaId INTEGER,
      "order" INTEGER DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('mergeTagCategories', () => {
  let sqlite: Database.Database
  let db: ApiDb

  beforeEach(() => {
    const testDb = createTestDb()
    sqlite = testDb.sqlite
    db = {
      drizzle: testDb.drizzle,
      sqlite,
    }
  })

  afterEach(() => {
    sqlite.close()
  })

  function insertCategory(name: string, flags: Partial<{nested: boolean; synonyms: boolean}> = {}) {
    const now = '2026-01-01T00:00:00.000Z'
    return db.drizzle.insert(meta).values({
      type: 'array',
      name,
      nested: flags.nested ?? false,
      synonyms: flags.synonyms ?? false,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
  }

  function insertTag(name: string, metaId: number, synonyms: string | null = null) {
    const now = '2026-01-01T00:00:00.000Z'
    return db.drizzle.insert(tags).values({
      name,
      metaId,
      synonyms,
      rating: 0,
      favorite: false,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
  }

  it('moves tags and links into survivor, ORs flags, deletes sources', async () => {
    const survivor = insertCategory('Genres', {synonyms: false, nested: false})
    const source = insertCategory('Genre', {synonyms: true, nested: true})

    db.drizzle.insert(metaSettings).values([
      {metaId: survivor.id, synonyms: false, nested: false},
      {metaId: source.id, synonyms: true, nested: true},
    ]).run()

    const actionKeep = insertTag('Action', survivor.id)
    const actionDup = insertTag('action', source.id, 'Act')
    const comedy = insertTag('Comedy', source.id)

    db.drizzle.insert(tagsInMedia).values([
      {mediaId: 1, tagId: actionKeep.id, metaId: survivor.id},
      {mediaId: 2, tagId: actionDup.id, metaId: source.id},
      {mediaId: 3, tagId: comedy.id, metaId: source.id},
    ]).run()

    db.drizzle.insert(tagsInTags).values([
      {parentTagId: 99, tagId: comedy.id, metaId: source.id},
    ]).run()

    db.drizzle.insert(filterRows).values({
      param: 'tags',
      type: 'array',
      metaId: source.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).run()

    db.drizzle.insert(savedFilters).values({
      name: null,
      metaId: source.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).run()

    db.drizzle.insert(metaInMediaTypes).values([
      {metaId: survivor.id, mediaTypeId: 1, order: 0},
      {metaId: source.id, mediaTypeId: 1, order: 1},
      {metaId: source.id, mediaTypeId: 2, order: 0},
    ]).run()

    db.drizzle.insert(pinnedMetas).values([
      {metaId: survivor.id, pinnedMetaId: 50, order: 0},
      {metaId: source.id, pinnedMetaId: 50, order: 1},
      {metaId: source.id, pinnedMetaId: 51, order: 0},
    ]).run()

    const result = await mergeTagCategories(db, {
      survivorId: survivor.id,
      sourceIds: [source.id],
    })

    expect(result.deletedIds).toEqual([source.id])
    expect(result.survivor.name).toBe('Genres')
    expect(result.survivor.synonyms).toBe(true)
    expect(result.survivor.nested).toBe(true)
    expect(result.migrated.autoMergedTagPairs).toBe(1)
    expect(result.autoMergedTagIds).toEqual([actionDup.id])

    expect(db.drizzle.select().from(meta).all()).toHaveLength(1)
    expect(db.drizzle.select().from(metaSettings).where(eq(metaSettings.metaId, survivor.id)).get()?.nested).toBe(true)

    const remainingTags = db.drizzle.select().from(tags).all()
    expect(remainingTags).toHaveLength(2)
    expect(remainingTags.every((row) => row.metaId === survivor.id)).toBe(true)

    const action = remainingTags.find((row) => row.id === actionKeep.id)!
    expect(action.synonyms).toBe('Act')

    const mediaLinks = db.drizzle.select().from(tagsInMedia).all()
    expect(mediaLinks).toHaveLength(3)
    expect(mediaLinks.every((row) => row.metaId === survivor.id)).toBe(true)
    expect(mediaLinks.filter((row) => row.tagId === actionKeep.id)).toHaveLength(2)

    expect(db.drizzle.select().from(tagsInTags).all()).toEqual([
      {parentTagId: 99, tagId: comedy.id, metaId: survivor.id},
    ])

    expect(db.drizzle.select().from(filterRows).get()?.metaId).toBe(survivor.id)
    expect(db.drizzle.select().from(savedFilters).get()?.metaId).toBe(survivor.id)

    const assignments = db.drizzle.select().from(metaInMediaTypes).all()
    expect(assignments).toHaveLength(2)
    expect(assignments.every((row) => row.metaId === survivor.id)).toBe(true)

    const pins = db.drizzle.select().from(pinnedMetas).all()
    expect(pins).toHaveLength(2)
    expect(pins.every((row) => row.metaId === survivor.id)).toBe(true)
  })

  it('rejects non-array meta', async () => {
    const survivor = insertCategory('Tags')
    const now = '2026-01-01T00:00:00.000Z'
    const field = db.drizzle.insert(meta).values({
      type: 'string',
      name: 'Title',
      createdAt: now,
      updatedAt: now,
    }).returning().get()

    await expect(mergeTagCategories(db, {
      survivorId: survivor.id,
      sourceIds: [field.id],
    })).rejects.toBeInstanceOf(MetaCategoryMergeError)
  })

  it('rejects empty source list', async () => {
    const survivor = insertCategory('Tags')
    await expect(mergeTagCategories(db, {
      survivorId: survivor.id,
      sourceIds: [survivor.id],
    })).rejects.toThrow(/source category/i)
  })
})
