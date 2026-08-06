/**
 * @vitest-environment node
 */
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import Database from 'better-sqlite3'
import {drizzle} from 'drizzle-orm/better-sqlite3'
import {applySqlitePragmas} from '../pragmas'
import * as schema from '../schema'
import {createTagsInMediaRepository} from './tagsInMedia'
import {createTagsInTagRepository} from './tagsInTag'

function createRelationTestDb() {
  const sqlite = new Database(':memory:')
  applySqlitePragmas(sqlite)
  sqlite.exec(`
    CREATE TABLE media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE meta (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      icon TEXT,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
    );
    CREATE TABLE tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT,
      metaId INTEGER,
      createdAt TEXT NOT NULL DEFAULT '2024-01-01',
      updatedAt TEXT NOT NULL DEFAULT '2024-01-01'
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

    INSERT INTO media (id, path) VALUES (1, '/a.mp4');
    INSERT INTO meta (id, name, icon) VALUES
      (10, 'People', 'account'),
      (99, 'Unused', 'ghost');
    INSERT INTO tags (id, name, color, metaId) VALUES
      (100, 'Ada', '#fff', 10),
      (101, 'Unrelated', '#000', 99);
    INSERT INTO tagsInMedia (mediaId, tagId, metaId) VALUES (1, 100, 10);
    INSERT INTO tagsInTags (parentTagId, tagId, metaId) VALUES (50, 100, 10);
  `)
  return {
    sqlite,
    drizzle: drizzle(sqlite, {schema}),
  }
}

describe('relation hydrate scopes tag/meta lookups', () => {
  let sqlite: Database.Database
  let db: ReturnType<typeof createRelationTestDb>['drizzle']

  beforeEach(() => {
    const testDb = createRelationTestDb()
    sqlite = testDb.sqlite
    db = testDb.drizzle
  })

  afterEach(() => {
    sqlite.close()
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
