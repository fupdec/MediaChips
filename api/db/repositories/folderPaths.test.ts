/**
 * @vitest-environment node
 */
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schema'
import { createFolderPathsRepository } from './folderPaths'
import { createTagsInFoldersRepository } from './tagsInFolders'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    CREATE TABLE folderPaths (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      path text NOT NULL,
      createdAt text NOT NULL,
      updatedAt text NOT NULL
    );
    CREATE UNIQUE INDEX folder_paths_path_unique_idx ON folderPaths (path);
    CREATE TABLE tagsInFolders (
      folderId integer NOT NULL,
      tagId integer NOT NULL,
      metaId integer NOT NULL,
      PRIMARY KEY(folderId, tagId, metaId)
    );
    CREATE TABLE tags (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text,
      synonyms text,
      rating integer DEFAULT 0,
      favorite integer DEFAULT false,
      bookmark integer DEFAULT false,
      country text,
      color text,
      views integer DEFAULT 0,
      viewedAt text,
      metaId integer,
      createdAt text NOT NULL,
      updatedAt text NOT NULL
    );
    CREATE TABLE meta (
      id integer PRIMARY KEY AUTOINCREMENT NOT NULL,
      name text,
      icon text
    );
  `)

  const db = drizzle(sqlite, {schema})
  return {sqlite, db}
}

describe('folderPaths remap', () => {
  let db: ReturnType<typeof createTestDb>['db']

  beforeEach(() => {
    ;({db} = createTestDb())
  })

  it('remaps path fragment and merges colliding folders', () => {
    const folders = createFolderPathsRepository(db)
    const tags = createTagsInFoldersRepository(db)

    folders.findOrCreateByPath('/media/old/show')
    folders.findOrCreateByPath('/media/new/show')
    tags.findOrCreate({path: '/media/old/show', tagId: 1, metaId: 10})
    tags.findOrCreate({path: '/media/new/show', tagId: 2, metaId: 10})

    const changed = folders.remapPathFragment('/media/old', '/media/new')
    expect(changed).toBe(1)

    const surviving = folders.findByPath('/media/new/show')
    expect(surviving).toBeTruthy()
    expect(folders.findByPath('/media/old/show')).toBeUndefined()

    const links = tags.findAllByPath('/media/new/show')
    const tagIds = links.map((row) => row.tagId).sort()
    expect(tagIds).toEqual([1, 2])
  })

  it('remaps nested prefix paths', () => {
    const folders = createFolderPathsRepository(db)
    folders.findOrCreateByPath('/library/a')
    folders.findOrCreateByPath('/library/a/nested')

    const changed = folders.remapPathPrefix('/library/a', '/library/b')
    expect(changed).toBe(2)
    expect(folders.findByPath('/library/b')?.path).toBe('/library/b')
    expect(folders.findByPath('/library/b/nested')?.path).toBe('/library/b/nested')
  })
})

describe('tagsInFolders list and clear', () => {
  let db: ReturnType<typeof createTestDb>['db']
  let sqlite: ReturnType<typeof createTestDb>['sqlite']

  beforeEach(() => {
    ;({db, sqlite} = createTestDb())
    sqlite.prepare(`INSERT INTO meta (id, name, icon) VALUES (10, 'Genre', 'tag')`).run()
    sqlite.prepare(`
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt)
      VALUES (1, 'Action', 10, 't', 't'), (2, 'Drama', 10, 't', 't')
    `).run()
  })

  it('lists folders with hydrated tags', () => {
    const tagsRepo = createTagsInFoldersRepository(db)
    tagsRepo.findOrCreate({path: '/media/b', tagId: 2, metaId: 10})
    tagsRepo.findOrCreate({path: '/media/a', tagId: 1, metaId: 10})

    const listed = tagsRepo.findAllWithTags()
    expect(listed.map((row) => row.path)).toEqual(['/media/a', '/media/b'])
    expect(listed[0].tags[0].tag?.name).toBe('Action')
    expect(listed[1].tags[0].tag?.name).toBe('Drama')
  })

  it('clears all tags and removes folder row', () => {
    const folders = createFolderPathsRepository(db)
    const tagsRepo = createTagsInFoldersRepository(db)
    tagsRepo.findOrCreate({path: '/media/show', tagId: 1, metaId: 10})
    tagsRepo.findOrCreate({path: '/media/show', tagId: 2, metaId: 10})

    expect(tagsRepo.clearAllByPath('/media/show')).toBe(true)
    expect(tagsRepo.findAllByPath('/media/show')).toEqual([])
    expect(folders.findByPath('/media/show')).toBeUndefined()
    expect(tagsRepo.findAllWithTags()).toEqual([])
  })
})
