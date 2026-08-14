import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {eq} from 'drizzle-orm'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {pinnedMetas} from '../db/schema/pinnedMeta'
import {tags} from '../db/schema/tags'
import {savedFilters} from '../db/schema/savedFilters'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {duplicateTagCategory} from './metaCategoryDuplicate'

function createTestDb(dbPath: string): ApiDb & {dbPath: string} {
  const {sqlite, drizzle, dbPath: sqliteDbPath} = createSharedTestDb('meta-dup')
  return {sqlite, drizzle, path: dbPath, dbPath: sqliteDbPath} as ApiDb & {dbPath: string}
}

describe('duplicateTagCategory', () => {
  let db: ApiDb & {dbPath: string}
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'meta-dup-'))
    db = createTestDb(tmpDir)
  })

  afterEach(() => {
    closeTestDb({sqlite: db.sqlite, dbPath: db.dbPath})
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
