import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {eq} from 'drizzle-orm'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {pinnedMetas} from '../db/schema/pinnedMeta'
import {tags} from '../db/schema/tags'
import {savedFilters} from '../db/schema/savedFilters'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {duplicateTagCategory} from './metaCategoryDuplicate'

function createTestDb(dbPath: string): ApiDb {
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
      parser INTEGER DEFAULT 1,
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
    path: dbPath,
  } as ApiDb
}

describe('duplicateTagCategory', () => {
  let db: ApiDb
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-dup-'))
    db = createTestDb(tmpDir)
  })

  afterEach(() => {
    db.sqlite.close()
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('duplicates category settings, pins, and media-type assignments without tags', () => {
    const source = db.drizzle.insert(meta).values({
      type: 'array',
      name: 'Actors',
      icon: 'account',
      nested: true,
      synonyms: true,
      color: true,
      pathRegex: 'Actors/([^/]+)',
      pathRegexEnabled: true,
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    const childField = db.drizzle.insert(meta).values({
      type: 'string',
      name: 'Height',
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    db.drizzle.insert(metaInMediaTypes).values({
      metaId: source.id,
      mediaTypeId: 1,
      scraper: 'adult',
      show: true,
      order: 2,
    }).run()

    db.drizzle.insert(pinnedMetas).values({
      metaId: source.id,
      pinnedMetaId: childField.id,
      show: true,
      order: 1,
    }).run()

    db.drizzle.insert(tags).values({
      name: 'Alice',
      metaId: source.id,
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).run()

    const result = duplicateTagCategory(db, {id: source.id})

    expect(result.meta.name).toBe('Actors (copy)')
    expect(result.meta.type).toBe('array')
    expect(result.meta.icon).toBe('account')
    expect(result.meta.nested).toBe(true)
    expect(result.meta.synonyms).toBe(true)
    expect(result.meta.color).toBe(true)
    expect(result.meta.pathRegex).toBe('Actors/([^/]+)')
    expect(result.meta.pathRegexEnabled).toBe(true)
    expect(result.copied.mediaTypeAssignments).toBe(1)
    expect(result.copied.pinnedFields).toBe(1)

    const assignment = db.drizzle.select()
      .from(metaInMediaTypes)
      .where(eq(metaInMediaTypes.metaId, result.meta.id))
      .get()
    expect(assignment).toMatchObject({
      mediaTypeId: 1,
      scraper: 'adult',
      order: 2,
    })

    const pin = db.drizzle.select()
      .from(pinnedMetas)
      .where(eq(pinnedMetas.metaId, result.meta.id))
      .get()
    expect(pin?.pinnedMetaId).toBe(childField.id)

    const tagsInNew = db.drizzle.select()
      .from(tags)
      .where(eq(tags.metaId, result.meta.id))
      .all()
    expect(tagsInNew).toHaveLength(0)

    const filter = db.drizzle.select()
      .from(savedFilters)
      .where(eq(savedFilters.metaId, result.meta.id))
      .get()
    expect(filter).toBeTruthy()
    expect(fs.existsSync(path.join(tmpDir, 'meta', String(result.meta.id)))).toBe(true)
  })

  it('allocates unique names when (copy) already exists', () => {
    db.drizzle.insert(meta).values([
      {
        type: 'array',
        name: 'Studios',
        createdAt: '2020-01-01',
        updatedAt: '2020-01-01',
      },
      {
        type: 'array',
        name: 'Studios (copy)',
        createdAt: '2020-01-01',
        updatedAt: '2020-01-01',
      },
    ]).run()

    const source = db.drizzle.select().from(meta).where(eq(meta.name, 'Studios')).get()!
    const result = duplicateTagCategory(db, {id: source.id})
    expect(result.meta.name).toBe('Studios (copy 2)')
  })

  it('rejects non-array meta', () => {
    const source = db.drizzle.insert(meta).values({
      type: 'string',
      name: 'Note',
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    expect(() => duplicateTagCategory(db, {id: source.id})).toThrow(HttpError)
  })
})
