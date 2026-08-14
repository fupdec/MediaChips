/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {createTestDb, closeTestDb, type TestDb} from '../testUtils/createTestDb'
import {createTagsRepository} from './tags'

describe('tags repository getItemsForMeta', () => {
  let sqlite: Database.Database
  let db: TestDb['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createTestDb('tags-items')
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
    const now = '2024-01-01'
    sqlite.prepare(`
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES
        (1, 'Ada', 17, ?, ?),
        (2, 'Bob', 17, ?, ?),
        (3, 'OtherMeta', 99, ?, ?),
        (10, 'Child', 1, ?, ?)
    `).run(now, now, now, now, now, now, now, now)

    sqlite.prepare(`
      INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES
        (1, 10, 1),
        (2, 10, 1),
        (3, 10, 1)
    `).run()

    sqlite.prepare(`
      INSERT INTO valuesInTags (tagId, value, metaId) VALUES
        (1, 'one', 2),
        (2, 'two', 2),
        (3, 'three', 2)
    `).run()
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('scopes nested aggregates to the requested page ids', () => {
    const repo = createTagsRepository(db, sqlite)
    const rows = repo.getItemsForMeta(17, [1]) as Array<{
      id: number
      name: string
      tag_tags: string | null
      tag_values: string | null
    }>

    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe(1)
    expect(rows[0].tag_tags).toBe('10^1')
    expect(rows[0].tag_values).toBe('one^2')
  })

  it('matches full-meta hydrate for the same rows', () => {
    const repo = createTagsRepository(db, sqlite)
    const page = repo.getItemsForMeta(17, [1, 2]) as Array<{
      id: number
      tag_tags: string | null
      tag_values: string | null
    }>
    const all = repo.getItemsForMeta(17) as Array<{
      id: number
      tag_tags: string | null
      tag_values: string | null
    }>

    const byId = new Map(all.map((row) => [row.id, row]))
    for (const row of page) {
      const full = byId.get(row.id)
      expect(full).toBeTruthy()
      expect(row.tag_tags).toBe(full!.tag_tags)
      expect(row.tag_values).toBe(full!.tag_values)
    }
  })
})
