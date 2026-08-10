import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {eq} from 'drizzle-orm'
import {applySqlitePragmas} from '../db/pragmas'
import * as schema from '../db/schema'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {valuesInTags} from '../db/schema/valuesInTag'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {duplicateTag} from './tagDuplicate'

function createTestDb(dbPath: string): ApiDb {
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
    CREATE TABLE valuesInTags (
      tagId INTEGER NOT NULL,
      metaId INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (tagId, metaId)
    );
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT,
      name TEXT,
      icon TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
  `)

  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
    path: dbPath,
  } as ApiDb
}

describe('duplicateTag', () => {
  let db: ApiDb
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tag-dup-'))
    db = createTestDb(tmpDir)
  })

  afterEach(() => {
    db.sqlite.close()
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('duplicates profile fields, values, nested links, and images without media links', () => {
    const source = db.drizzle.insert(tags).values({
      name: 'Alice',
      metaId: 7,
      synonyms: 'Ali',
      rating: 4,
      favorite: true,
      bookmark: 'note',
      country: 'US',
      color: '#ff0000',
      views: 99,
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    const nestedChild = db.drizzle.insert(tags).values({
      name: 'Studio X',
      metaId: 8,
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    const parent = db.drizzle.insert(tags).values({
      name: 'Network',
      metaId: 9,
      createdAt: '2020-01-01',
      updatedAt: '2020-01-01',
    }).returning().get()

    db.drizzle.insert(valuesInTags).values({
      tagId: source.id,
      metaId: 42,
      value: '170',
    }).run()

    db.drizzle.insert(tagsInTags).values([
      {parentTagId: source.id, tagId: nestedChild.id, metaId: 8},
      {parentTagId: parent.id, tagId: source.id, metaId: 9},
    ]).run()

    db.drizzle.insert(tagsInMedia).values({
      mediaId: 1,
      tagId: source.id,
      metaId: 7,
    }).run()

    const metaDir = path.join(tmpDir, 'meta', '7')
    fs.mkdirSync(metaDir, {recursive: true})
    fs.writeFileSync(path.join(metaDir, `${source.id}_main.jpg`), 'main')
    fs.writeFileSync(path.join(metaDir, `${source.id}_avatar.jpg`), 'avatar')

    const result = duplicateTag(db, {id: source.id})

    expect(result.tag.name).toBe('Alice (copy)')
    expect(result.tag.metaId).toBe(7)
    expect(result.tag.synonyms).toBe('Ali')
    expect(result.tag.rating).toBe(4)
    expect(result.tag.favorite).toBe(true)
    expect(result.tag.bookmark).toBe('note')
    expect(result.tag.country).toBe('US')
    expect(result.tag.color).toBe('#ff0000')
    expect(result.tag.views).toBe(0)
    expect(result.copied.values).toBe(1)
    expect(result.copied.nestedLinks).toBe(2)
    expect(result.copied.images).toBe(2)

    const values = db.drizzle.select()
      .from(valuesInTags)
      .where(eq(valuesInTags.tagId, result.tag.id))
      .all()
    expect(values).toEqual([expect.objectContaining({metaId: 42, value: '170'})])

    const nested = db.drizzle.select().from(tagsInTags).all()
    expect(nested).toEqual(expect.arrayContaining([
      {parentTagId: result.tag.id, tagId: nestedChild.id, metaId: 8},
      {parentTagId: parent.id, tagId: result.tag.id, metaId: 9},
    ]))

    const mediaLinks = db.drizzle.select()
      .from(tagsInMedia)
      .where(eq(tagsInMedia.tagId, result.tag.id))
      .all()
    expect(mediaLinks).toHaveLength(0)

    expect(fs.readFileSync(path.join(metaDir, `${result.tag.id}_main.jpg`), 'utf8')).toBe('main')
    expect(fs.readFileSync(path.join(metaDir, `${result.tag.id}_avatar.jpg`), 'utf8')).toBe('avatar')
  })

  it('allocates unique names when (copy) already exists', () => {
    db.drizzle.insert(tags).values([
      {
        name: 'Bob',
        metaId: 1,
        createdAt: '2020-01-01',
        updatedAt: '2020-01-01',
      },
      {
        name: 'Bob (copy)',
        metaId: 1,
        createdAt: '2020-01-01',
        updatedAt: '2020-01-01',
      },
    ]).run()

    const source = db.drizzle.select().from(tags).where(eq(tags.name, 'Bob')).get()!
    const result = duplicateTag(db, {id: source.id})
    expect(result.tag.name).toBe('Bob (copy 2)')
  })

  it('rejects missing tag', () => {
    expect(() => duplicateTag(db, {id: 999})).toThrow(HttpError)
  })
})
