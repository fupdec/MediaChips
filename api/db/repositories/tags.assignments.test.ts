/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {createTestDb, closeTestDb} from '../testUtils/createTestDb'
import {createTagsRepository} from './tags'

describe('tags repository countAssignments', () => {
  let sqlite: Database.Database
  let dbPath: string
  let repo: ReturnType<typeof createTagsRepository>

  beforeEach(() => {
    const testDb = createTestDb('tags-assignments')
    sqlite = testDb.sqlite
    dbPath = testDb.dbPath
    repo = createTagsRepository(testDb.drizzle, sqlite)

    sqlite.exec(`
      INSERT INTO tags (id, name, createdAt, updatedAt) VALUES
        (1, 'Ada', '2024-01-01', '2024-01-01'),
        (2, 'Parent', '2024-01-01', '2024-01-01');
      INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES
        (10, 1, 17),
        (11, 1, 17),
        (12, 1, 18);
      INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES
        (2, 1, 17),
        (2, 1, 18);
    `)
  })

  afterEach(() => {
    closeTestDb({sqlite, dbPath})
  })

  it('counts media and nested-on-tag assignments separately', () => {
    expect(repo.countAssignments(1)).toEqual({media: 3, tags: 2})
    expect(repo.countAssignments(2)).toEqual({media: 0, tags: 0})
    expect(repo.countAssignments(999)).toEqual({media: 0, tags: 0})
  })
})
