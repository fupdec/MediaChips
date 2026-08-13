/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../pragmas'
import * as schema from '../schema'
import {createTagsRepository} from './tags'

describe('tags repository countAssignments', () => {
  let sqlite: Database.Database
  let repo: ReturnType<typeof createTagsRepository>

  beforeEach(() => {
    sqlite = new Database(':memory:')
    applySqlitePragmas(sqlite)
    sqlite.exec(`
      CREATE TABLE tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
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
    `)
    const db = drizzle(sqlite, {schema})
    repo = createTagsRepository(db, sqlite)

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
    sqlite.close()
  })

  it('counts media and nested-on-tag assignments separately', () => {
    expect(repo.countAssignments(1)).toEqual({media: 3, tags: 2})
    expect(repo.countAssignments(2)).toEqual({media: 0, tags: 0})
    expect(repo.countAssignments(999)).toEqual({media: 0, tags: 0})
  })
})
