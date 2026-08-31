/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {createTestDb as createSharedTestDb, closeTestDb} from '../testUtils/createTestDb'
import {createTagsInMediaRepository} from './tagsInMedia'
import {createTagsInTagRepository} from './tagsInTag'

function createRelationTestDb() {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('tags-relation')
  sqlite.exec(`
    INSERT INTO media (id, path, createdAt, updatedAt) VALUES (1, '/a.mp4', '2024-01-01', '2024-01-01');
    INSERT INTO meta (id, name, icon, createdAt, updatedAt) VALUES
      (10, 'People', 'account', '2024-01-01', '2024-01-01'),
      (99, 'Unused', 'ghost', '2024-01-01', '2024-01-01');
    INSERT INTO tags (id, name, color, metaId, createdAt, updatedAt) VALUES
      (100, 'Ada', '#fff', 10, '2024-01-01', '2024-01-01'),
      (101, 'Unrelated', '#000', 99, '2024-01-01', '2024-01-01');
    INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (1, 100, 10);
    INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES (50, 100, 10);
  `)
  return {sqlite, drizzle, dbPath}
}

describe('relation hydrate scopes tag/meta lookups', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createRelationTestDb>['drizzle']
  let dbPath: string

  beforeEach(() => {
    const testDb = createRelationTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
    dbPath = testDb.dbPath
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('hydrates tagsInMedia without loading unrelated tags', () => {
    const repo = createTagsInMediaRepository(db)
    const rows = repo.findAllByMediaId(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].tag).toMatchObject({
      id: 100,
      name: 'Ada',
      meta: {id: 10, name: 'People', icon: 'account'},
    })
  })

  it('hydrates tagsInTag without loading unrelated tags', () => {
    const repo = createTagsInTagRepository(db)
    const rows = repo.findAllByParentTagId(50)
    expect(rows).toHaveLength(1)
    expect(rows[0].tag).toMatchObject({
      id: 100,
      name: 'Ada',
      meta: {id: 10, name: 'People'},
    })
  })
})
