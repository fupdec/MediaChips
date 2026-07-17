import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {eq} from 'drizzle-orm'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {tagsInFilterRows} from '../db/schema/tagsInFilterRows'
import {valuesInTags} from '../db/schema/valuesInTag'
import {marks} from '../db/schema/marks'
import {tabs} from '../db/schema/tabs'
import {savedFilters} from '../db/schema/savedFilters'
import {pageSettings} from '../db/schema/pageSettings'
import type {ApiDb} from '../types/db'
import {mergeSynonymLists, mergeTagsInCategory, TagMergeError} from './tagMerge'

function createTestDb() {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
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
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('mergeSynonymLists', () => {
  it('merges names and synonyms case-insensitively and drops survivor name', () => {
    const result = mergeSynonymLists('Alice', 'Ali, AW', [
      {name: 'alice', synonyms: 'AW, Angela'},
      {name: 'Alicia', synonyms: null},
    ])
    expect(result).toBe('Ali, AW, Angela, Alicia')
  })
})

describe('mergeTagsInCategory', () => {
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

  it('merges links, values, marks and deletes source tags', async () => {
    const survivor = insertTag('Alice', 1, 'Ali')
    const sourceA = insertTag('alice', 1, 'AW')
    const sourceB = insertTag('Alicia', 1, null)

    db.drizzle.insert(tagsInMedia).values([
      {mediaId: 10, tagId: survivor.id, metaId: 1},
      {mediaId: 10, tagId: sourceA.id, metaId: 1},
      {mediaId: 11, tagId: sourceA.id, metaId: 1},
      {mediaId: 12, tagId: sourceB.id, metaId: 1},
    ]).run()

    db.drizzle.insert(tagsInTags).values([
      {parentTagId: 99, tagId: sourceA.id, metaId: 2},
      {parentTagId: sourceB.id, tagId: 77, metaId: 2},
      {parentTagId: sourceA.id, tagId: survivor.id, metaId: 2},
    ]).run()

    db.drizzle.insert(tagsInFilterRows).values([
      {tagId: sourceA.id, rowId: 5, metaId: 1},
      {tagId: survivor.id, rowId: 5, metaId: 1},
    ]).run()

    db.drizzle.insert(valuesInTags).values([
      {tagId: survivor.id, metaId: 20, value: 'keep-me'},
      {tagId: sourceA.id, metaId: 20, value: 'overwrite-me'},
      {tagId: sourceA.id, metaId: 21, value: 'move-me'},
    ]).run()

    db.drizzle.insert(marks).values([
      {type: 'meta', tagId: sourceA.id, mediaId: 10, time: 1},
    ]).run()

    db.drizzle.insert(tabs).values({
      name: 'Tab',
      tagId: sourceB.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).run()

    db.drizzle.insert(savedFilters).values({
      name: 'Filter',
      tagId: sourceA.id,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).run()

    db.drizzle.insert(pageSettings).values({
      page: 1,
      tagId: sourceB.id,
    }).run()

    const result = await mergeTagsInCategory(db, {
      metaId: 1,
      survivorId: survivor.id,
      sourceIds: [sourceA.id, sourceB.id],
    })

    expect(result.deletedIds).toEqual([sourceA.id, sourceB.id])
    expect(result.survivor.name).toBe('Alice')
    expect(result.survivor.synonyms).toBe('Ali, AW, Alicia')

    const mediaLinks = db.drizzle.select().from(tagsInMedia).all()
    expect(mediaLinks).toHaveLength(3)
    expect(mediaLinks.every((row) => row.tagId === survivor.id)).toBe(true)

    const nested = db.drizzle.select().from(tagsInTags).all()
    expect(nested).toEqual(expect.arrayContaining([
      {parentTagId: 99, tagId: survivor.id, metaId: 2},
      {parentTagId: survivor.id, tagId: 77, metaId: 2},
    ]))
    expect(nested.some((row) => row.parentTagId === survivor.id && row.tagId === survivor.id)).toBe(false)

    const filterRows = db.drizzle.select().from(tagsInFilterRows).all()
    expect(filterRows).toEqual([{tagId: survivor.id, rowId: 5, metaId: 1}])

    const values = db.drizzle.select().from(valuesInTags).all()
    expect(values).toEqual(expect.arrayContaining([
      {tagId: survivor.id, metaId: 20, value: 'keep-me'},
      {tagId: survivor.id, metaId: 21, value: 'move-me'},
    ]))
    expect(values).toHaveLength(2)

    expect(db.drizzle.select().from(marks).where(eq(marks.tagId, survivor.id)).all()).toHaveLength(1)
    expect(db.drizzle.select().from(tabs).get()?.tagId).toBe(survivor.id)
    expect(db.drizzle.select().from(savedFilters).get()?.tagId).toBe(survivor.id)
    expect(db.drizzle.select().from(pageSettings).get()?.tagId).toBe(survivor.id)

    expect(db.drizzle.select().from(tags).all()).toHaveLength(1)
  })

  it('dedupes nested same-name children after merging parent tags', async () => {
    const survivor = insertTag('Aleksandra', 12)
    const source = insertTag('Aleksandra Mink', 12)
    const realKeep = insertTag('Real', 20)
    const realDup = insertTag('real', 20)
    const blue = insertTag('Blue', 21)
    const blueDup = insertTag('Blue', 21)

    db.drizzle.insert(tagsInTags).values([
      {parentTagId: survivor.id, tagId: realKeep.id, metaId: 20},
      {parentTagId: survivor.id, tagId: blue.id, metaId: 21},
      {parentTagId: source.id, tagId: realDup.id, metaId: 20},
      {parentTagId: source.id, tagId: blueDup.id, metaId: 21},
      {parentTagId: source.id, tagId: blue.id, metaId: 21},
    ]).run()

    const result = await mergeTagsInCategory(db, {
      metaId: 12,
      survivorId: survivor.id,
      sourceIds: [source.id],
    })

    expect(result.migrated.nestedNameDeduped).toBe(2)

    const nested = db.drizzle.select().from(tagsInTags).all()
    expect(nested).toEqual(expect.arrayContaining([
      {parentTagId: survivor.id, tagId: realKeep.id, metaId: 20},
      {parentTagId: survivor.id, tagId: blue.id, metaId: 21},
    ]))
    expect(nested).toHaveLength(2)
    expect(nested.some((row) => row.tagId === realDup.id)).toBe(false)
    expect(nested.some((row) => row.tagId === blueDup.id)).toBe(false)
  })

  it('collapses exact duplicate nested rows without a unique index', async () => {
    // Legacy DBs have no PK on tagsInTags — recreate without one for this case
    sqlite.exec(`
      DROP TABLE tagsInTags;
      CREATE TABLE tagsInTags (
        parentTagId INTEGER NOT NULL,
        tagId INTEGER NOT NULL,
        metaId INTEGER NOT NULL
      );
    `)

    const survivor = insertTag('Aleksandra', 12)
    const source = insertTag('Aleksandra Dup', 12)
    const real = insertTag('Real', 20)

    sqlite.prepare(
      'INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)',
    ).run(survivor.id, real.id, 20, survivor.id, real.id, 20, source.id, real.id, 20)

    const result = await mergeTagsInCategory(db, {
      metaId: 12,
      survivorId: survivor.id,
      sourceIds: [source.id],
    })

    expect(result.migrated.nestedNameDeduped).toBeGreaterThanOrEqual(2)
    const nested = db.drizzle.select().from(tagsInTags).all()
    expect(nested).toEqual([
      {parentTagId: survivor.id, tagId: real.id, metaId: 20},
    ])
  })

  it('rejects tags from another category', async () => {
    const survivor = insertTag('A', 1)
    const other = insertTag('B', 2)

    await expect(mergeTagsInCategory(db, {
      metaId: 1,
      survivorId: survivor.id,
      sourceIds: [other.id],
    })).rejects.toBeInstanceOf(TagMergeError)
  })

  it('rejects empty source list', async () => {
    const survivor = insertTag('A', 1)

    await expect(mergeTagsInCategory(db, {
      metaId: 1,
      survivorId: survivor.id,
      sourceIds: [survivor.id],
    })).rejects.toThrow(/source tag/i)
  })
})
