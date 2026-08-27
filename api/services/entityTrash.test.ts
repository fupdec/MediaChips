import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {
  hardDeletePlaylistCascade,
  hardDeleteSavedFilterCascade,
  restoreTrashTags,
  softDeleteMark,
  softDeletePlaylist,
  softDeleteSavedFilter,
  softDeleteTag,
} from './entityTrash'
import {nowIso} from '../db/utils/timestamps'

function makeDb(): ApiDb & {dbPath: string} {
  const {sqlite, drizzle, dbPath} = createTestDb('entity-trash')
  return {sqlite, drizzle, path: '/tmp', dbPath} as ApiDb & {dbPath: string}
}

describe('entityTrash soft-delete', () => {
  let db: ApiDb & {dbPath: string}

  beforeEach(() => {
    db = makeDb()
  })

  afterEach(() => {
    closeTestDb({sqlite: db.sqlite, dbPath: db.dbPath})
  })

  it('soft-deletes tags with name rewrite and restores them', () => {
    const ts = nowIso()
    const tag = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Alice', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}

    expect(softDeleteTag(db, tag.id)).toBe(true)
    const trashed = db.sqlite.prepare('SELECT name, deletedAt, trashOriginalName FROM tags WHERE id = ?')
      .get(tag.id) as {name: string; deletedAt: string; trashOriginalName: string}
    expect(trashed.deletedAt).toBeTruthy()
    expect(trashed.trashOriginalName).toBe('Alice')
    expect(trashed.name).toContain('__mediachips_trash__')

    const restored = restoreTrashTags(db, [tag.id])
    expect(restored).toEqual([tag.id])
    const active = db.sqlite.prepare('SELECT name, deletedAt FROM tags WHERE id = ?')
      .get(tag.id) as {name: string; deletedAt: string | null}
    expect(active.name).toBe('Alice')
    expect(active.deletedAt).toBeNull()
  })

  it('rewrites leftover trashed names so the original name can be reused', () => {
    const ts = nowIso()
    const tag = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Alice', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}

    db.sqlite.prepare(`UPDATE tags SET deletedAt = ? WHERE id = ?`).run(ts, tag.id)
    expect(softDeleteTag(db, tag.id)).toBe(true)

    const trashed = db.sqlite.prepare('SELECT name, trashOriginalName FROM tags WHERE id = ?')
      .get(tag.id) as {name: string; trashOriginalName: string}
    expect(trashed.trashOriginalName).toBe('Alice')
    expect(trashed.name).toContain('__mediachips_trash__')

    const created = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Alice', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}
    expect(created.id).toBeGreaterThan(tag.id)
  })

  it('allows recreating a tag name after a normal soft-delete', () => {
    const ts = nowIso()
    const tag = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Bob', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}

    expect(softDeleteTag(db, tag.id)).toBe(true)

    const created = db.sqlite.prepare(`
      INSERT INTO tags (name, metaId, createdAt, updatedAt)
      VALUES ('Bob', 1, ?, ?)
      RETURNING id
    `).get(ts, ts) as {id: number}
    expect(created.id).toBeGreaterThan(tag.id)
  })

  it('soft-deletes marks, playlists, and saved filters', () => {
    const ts = nowIso()
    const mark = db.sqlite.prepare(`INSERT INTO marks (type, text) VALUES ('bookmark', 'x') RETURNING id`)
      .get() as {id: number}
    const playlist = db.sqlite.prepare(`
      INSERT INTO playlists (name, createdAt, updatedAt) VALUES ('Fav', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    const filter = db.sqlite.prepare(`
      INSERT INTO savedFilters (name, createdAt, updatedAt) VALUES ('Smart', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}

    expect(softDeleteMark(db, mark.id)).toBe(true)
    expect(softDeletePlaylist(db, playlist.id)).toBe(true)
    expect(softDeleteSavedFilter(db, filter.id)).toBe(true)

    expect((db.sqlite.prepare('SELECT deletedAt FROM marks WHERE id = ?').get(mark.id) as {deletedAt: string}).deletedAt).toBeTruthy()
    expect((db.sqlite.prepare('SELECT deletedAt FROM playlists WHERE id = ?').get(playlist.id) as {deletedAt: string}).deletedAt).toBeTruthy()
    expect((db.sqlite.prepare('SELECT deletedAt FROM savedFilters WHERE id = ?').get(filter.id) as {deletedAt: string}).deletedAt).toBeTruthy()
  })

  it('hard purge cascades playlist membership and saved filter rows', () => {
    const ts = nowIso()
    const playlist = db.sqlite.prepare(`
      INSERT INTO playlists (name, createdAt, updatedAt) VALUES ('P', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    db.sqlite.prepare(`INSERT INTO mediaInPlaylists (mediaId, playlistId, "order") VALUES (1, ?, 0)`).run(playlist.id)

    const filter = db.sqlite.prepare(`
      INSERT INTO savedFilters (name, createdAt, updatedAt) VALUES ('F', ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    const row = db.sqlite.prepare(`
      INSERT INTO filterRows (type, "order", createdAt, updatedAt) VALUES ('rating', 0, ?, ?) RETURNING id
    `).get(ts, ts) as {id: number}
    db.sqlite.prepare(`INSERT INTO filterRowsInSavedFilters (filterId, rowId) VALUES (?, ?)`).run(filter.id, row.id)
    db.sqlite.prepare(`INSERT INTO tagsInFilterRows (tagId, rowId, metaId) VALUES (1, ?, 1)`).run(row.id)

    hardDeletePlaylistCascade(db, playlist.id)
    hardDeleteSavedFilterCascade(db, filter.id)

    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM playlists').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM mediaInPlaylists').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM savedFilters').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM filterRows').get() as {c: number}).toEqual({c: 0})
    expect(db.sqlite.prepare('SELECT COUNT(*) AS c FROM tagsInFilterRows').get() as {c: number}).toEqual({c: 0})
  })
})
