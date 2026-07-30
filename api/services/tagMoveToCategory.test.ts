import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {eq} from 'drizzle-orm'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {media} from '../db/schema/media'
import {mediaTypes} from '../db/schema/mediaTypes'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {tagsInFilterRows} from '../db/schema/tagsInFilterRows'
import type {ApiDb} from '../types/db'
import {
  findTagNameConflicts,
  moveTagsToCategory,
  normalizeTagName,
  TagMoveToCategoryError,
} from './tagMoveToCategory'

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
      pathRegex TEXT,
      pathRegexReplace TEXT DEFAULT '$1',
      pathRegexCreateTags INTEGER DEFAULT 1,
      pathRegexEnabled INTEGER DEFAULT 0,
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
      measurementUnit TEXT,
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
    CREATE TABLE mediaTypes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      icon TEXT,
      extensions TEXT,
      "order" INTEGER,
      hidden INTEGER DEFAULT 0,
      custom INTEGER DEFAULT 1,
      type TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      basename TEXT,
      name TEXT,
      ext TEXT,
      filesize INTEGER DEFAULT 0,
      contentHash TEXT,
      oshash TEXT,
      rating INTEGER DEFAULT 0,
      favorite INTEGER DEFAULT 0,
      bookmark TEXT,
      views INTEGER DEFAULT 0,
      oldId TEXT UNIQUE,
      viewedAt TEXT,
      mediaTypeId INTEGER,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE metaInMediaTypes (
      metaId INTEGER NOT NULL,
      mediaTypeId INTEGER NOT NULL,
      scraper TEXT,
      show INTEGER DEFAULT 1,
      "order" INTEGER,
      PRIMARY KEY (metaId, mediaTypeId)
    );
    CREATE TABLE tagsInFolders (
      folderId INTEGER NOT NULL,
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      PRIMARY KEY (folderId, tagId, metaId)
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

describe('normalizeTagName', () => {
  it('trims and lowercases', () => {
    expect(normalizeTagName('  Alice ')).toBe('alice')
  })
})

describe('moveTagsToCategory', () => {
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

  function insertCategory(name: string) {
    const now = '2026-01-01T00:00:00.000Z'
    return db.drizzle.insert(meta).values({
      type: 'array',
      name,
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

  function insertMediaType(name: string) {
    const now = '2026-01-01T00:00:00.000Z'
    return db.drizzle.insert(mediaTypes).values({
      name,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
  }

  function insertMedia(id: number, mediaTypeId: number) {
    const now = '2026-01-01T00:00:00.000Z'
    return db.drizzle.insert(media).values({
      id,
      path: `/media/${id}.mp4`,
      mediaTypeId,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
  }

  function assignCategory(metaId: number, mediaTypeId: number) {
    db.drizzle.insert(metaInMediaTypes).values({
      metaId,
      mediaTypeId,
      show: true,
    }).run()
  }

  it('moves tags and remaps category-scoped links', async () => {
    const source = insertCategory('Actors')
    const target = insertCategory('Performers')
    const videos = insertMediaType('Videos')
    const tag = insertTag('Alice', source.id)
    insertMedia(10, videos.id)
    assignCategory(target.id, videos.id)

    db.drizzle.insert(tagsInMedia).values([
      {mediaId: 10, tagId: tag.id, metaId: source.id},
    ]).run()
    db.drizzle.insert(tagsInTags).values([
      {parentTagId: 99, tagId: tag.id, metaId: source.id},
    ]).run()
    db.drizzle.insert(tagsInFilterRows).values([
      {tagId: tag.id, rowId: 5, metaId: source.id},
    ]).run()

    const result = await moveTagsToCategory(db, {
      tagIds: [tag.id],
      targetMetaId: target.id,
      onConflict: 'abort',
    })

    expect(result.movedIds).toEqual([tag.id])
    expect(result.mergedIds).toEqual([])

    const moved = db.drizzle.select().from(tags).where(eq(tags.id, tag.id)).get()
    expect(moved?.metaId).toBe(target.id)

    expect(db.drizzle.select().from(tagsInMedia).all()).toEqual([
      {mediaId: 10, tagId: tag.id, metaId: target.id},
    ])
    expect(db.drizzle.select().from(tagsInTags).all()).toEqual([
      {parentTagId: 99, tagId: tag.id, metaId: target.id},
    ])
    expect(db.drizzle.select().from(tagsInFilterRows).all()).toEqual([
      {tagId: tag.id, rowId: 5, metaId: target.id},
    ])
  })

  it('blocks move when target category is not assigned to linked media types', async () => {
    const source = insertCategory('Actors')
    const target = insertCategory('Performers')
    const videos = insertMediaType('Videos')
    const tag = insertTag('Alice', source.id)
    insertMedia(10, videos.id)

    db.drizzle.insert(tagsInMedia).values([
      {mediaId: 10, tagId: tag.id, metaId: source.id},
    ]).run()

    await expect(moveTagsToCategory(db, {
      tagIds: [tag.id],
      targetMetaId: target.id,
      onConflict: 'abort',
    })).rejects.toMatchObject({
      name: 'TagMoveToCategoryError',
      status: 409,
      code: 'unassigned_media_types',
      unassignedMediaTypes: [{id: videos.id, name: 'Videos'}],
    })

    const stillSource = db.drizzle.select().from(tags).where(eq(tags.id, tag.id)).get()
    expect(stillSource?.metaId).toBe(source.id)
  })

  it('aborts with conflicts when onConflict is abort', async () => {
    const source = insertCategory('Actors')
    const target = insertCategory('Performers')
    const existing = insertTag('Alice', target.id)
    const moving = insertTag('alice', source.id)

    await expect(moveTagsToCategory(db, {
      tagIds: [moving.id],
      targetMetaId: target.id,
      onConflict: 'abort',
    })).rejects.toMatchObject({
      name: 'TagMoveToCategoryError',
      status: 409,
      conflicts: [{
        tagId: moving.id,
        existingTagId: existing.id,
      }],
    })

    const stillSource = db.drizzle.select().from(tags).where(eq(tags.id, moving.id)).get()
    expect(stillSource?.metaId).toBe(source.id)
  })

  it('merges into existing tag when onConflict is merge', async () => {
    const source = insertCategory('Actors')
    const target = insertCategory('Performers')
    const videos = insertMediaType('Videos')
    const existing = insertTag('Alice', target.id, 'Ali')
    const moving = insertTag('alice', source.id, 'AW')
    insertMedia(10, videos.id)
    insertMedia(11, videos.id)
    assignCategory(target.id, videos.id)

    db.drizzle.insert(tagsInMedia).values([
      {mediaId: 10, tagId: moving.id, metaId: source.id},
      {mediaId: 11, tagId: existing.id, metaId: target.id},
    ]).run()

    const result = await moveTagsToCategory(db, {
      tagIds: [moving.id],
      targetMetaId: target.id,
      onConflict: 'merge',
    })

    expect(result.movedIds).toEqual([])
    expect(result.mergedIds).toEqual([moving.id])

    const remaining = db.drizzle.select().from(tags).all()
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(existing.id)
    expect(remaining[0].synonyms).toBe('Ali, AW')

    const mediaLinks = db.drizzle.select().from(tagsInMedia).all()
    expect(mediaLinks).toHaveLength(2)
    expect(mediaLinks.every((row) => row.tagId === existing.id && row.metaId === target.id)).toBe(true)
  })

  it('findTagNameConflicts supports global scope', () => {
    const a = insertCategory('Actors')
    const b = insertCategory('Performers')
    const inA = insertTag('Alice', a.id)
    const inB = insertTag('alice', b.id)

    const conflicts = db.drizzle.transaction((tx) =>
      findTagNameConflicts(tx, {
        candidates: [{tagId: inA.id, name: 'Alice'}],
        excludeTagIds: [inA.id],
        scope: 'global',
      }),
    )

    expect(conflicts).toEqual([{
      tagId: inA.id,
      name: 'Alice',
      existingTagId: inB.id,
    }])
  })

  it('rejects non-array target categories', async () => {
    const source = insertCategory('Actors')
    const stringMeta = db.drizzle.insert(meta).values({
      type: 'string',
      name: 'Title',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }).returning().get()
    const tag = insertTag('Alice', source.id)

    await expect(moveTagsToCategory(db, {
      tagIds: [tag.id],
      targetMetaId: stringMeta.id,
      onConflict: 'abort',
    })).rejects.toBeInstanceOf(TagMoveToCategoryError)
  })
})
