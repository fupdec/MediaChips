/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {
  buildExactDuplicateGroupsSql,
  isVisualDuplicatesMode,
  listMediaDuplicateGroups,
  parseGroupedIdCsv,
} from './mediaDuplicateGroups'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('media-duplicate-groups')
  lastDbPath = dbPath
  sqlite.exec(`
    INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (1, 'video', '2026-01-01', '2026-01-01');
  `)

  return {
    sqlite,
    drizzle,
    path: dbPath,
  } as ApiDb
}

describe('mediaDuplicateGroups', () => {
  let db: ApiDb

  afterEach(() => {
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
  })

  it('detects visual modes', () => {
    expect(isVisualDuplicatesMode('visualHash')).toBe(true)
    expect(isVisualDuplicatesMode('visual')).toBe(true)
    expect(isVisualDuplicatesMode('fingerprint')).toBe(false)
  })

  it('parses grouped id csv', () => {
    expect(parseGroupedIdCsv('3,1,1,2')).toEqual([3, 1, 2])
    expect(parseGroupedIdCsv('')).toEqual([])
  })

  it('builds exact group SQL with media type scope', () => {
    const sql = buildExactDuplicateGroupsSql('fingerprint', true)
    expect(sql).toContain('media.oshash AS dupVal')
    expect(sql).toContain('media.mediaTypeId = :mediaTypeId')
    expect(sql).toContain('HAVING COUNT(*) > 1')
    expect(sql).toContain('GROUP_CONCAT(id)')
  })

  it('builds filesize group SQL without media type', () => {
    const sql = buildExactDuplicateGroupsSql('filesize', false)
    expect(sql).toContain('media.filesize AS dupVal')
    expect(sql).toContain('media.filesize > 0')
    expect(sql).not.toContain('mediaTypeId')
  })

  it('scopes exact groups to mediaIds when provided', () => {
    db = createTestDb()
    const now = '2026-01-01'
    const insert = db.sqlite.prepare(`
      INSERT INTO media (id, path, filesize, oshash, mediaTypeId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `)
    insert.run(1, '/a.mp4', 100, 'hash-a', now, now)
    insert.run(2, '/b.mp4', 100, 'hash-a', now, now)
    insert.run(3, '/c.mp4', 100, 'hash-a', now, now)
    insert.run(4, '/d.mp4', 200, 'hash-b', now, now)

    const scoped = listMediaDuplicateGroups(db, {
      duplicatesBy: 'fingerprint',
      mediaTypeId: 1,
      mediaIds: [1, 2],
    })
    expect(scoped.groups).toHaveLength(1)
    expect(scoped.groups[0].itemIds.sort((a, b) => a - b)).toEqual([1, 2])

    const empty = listMediaDuplicateGroups(db, {
      duplicatesBy: 'fingerprint',
      mediaTypeId: 1,
      mediaIds: [],
    })
    expect(empty.groups).toEqual([])
  })
  it('returns only duplicates of the target item across the whole media type', () => {
    db = createTestDb()
    const now = '2026-01-01'
    db.sqlite.exec(`INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (2, 'image', '2026-01-01', '2026-01-01');`)
    const insert = db.sqlite.prepare(`
      INSERT INTO media (id, path, filesize, oshash, mediaTypeId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    insert.run(1, '/a.mp4', 100, 'hash-a', 1, now, now)
    insert.run(2, '/b.mp4', 100, 'hash-a', 1, now, now)
    insert.run(3, '/c.mp4', 300, 'hash-c', 1, now, now)
    insert.run(4, '/d.mp4', 300, 'hash-c', 1, now, now)
    insert.run(5, '/e.jpg', 100, 'hash-a', 2, now, now)

    const byHash = listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaId: 2})
    expect(byHash.groups).toEqual([{key: 'hash-a', itemIds: [2, 1]}])

    const bySize = listMediaDuplicateGroups(db, {duplicatesBy: 'filesize', targetMediaId: 1, mediaTypeId: 1})
    expect(bySize.groups).toEqual([{key: '100', itemIds: [1, 2]}])

    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'path', targetMediaId: 1}).groups).toEqual([])
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaId: 999}).groups).toEqual([])
  })
  it('finds copies of the target by the maintenance similarity policy', () => {
    db = createTestDb()
    const now = '2026-01-01'
    const insert = db.sqlite.prepare(`
      INSERT INTO media (id, path, filesize, oshash, mediaTypeId, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, 1, ?, ?)
    `)
    insert.run(1, '/a.mp4', 100, 'hash-a', now, now)
    insert.run(2, '/copy/a.mp4', 100, 'hash-a', now, now)
    insert.run(3, '/b.mp4', 100, 'hash-b', now, now)

    const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', targetMediaId: 2})
    expect(groups).toHaveLength(1)
    expect([...groups[0].itemIds].sort()).toEqual([1, 2])
    expect(groups[0].originalId).toBe(groups[0].itemIds[0])
    expect(groups[0].similarity?.every((match) => match.eligible)).toBe(true)
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', targetMediaId: 3}).groups).toEqual([])
  })
})
