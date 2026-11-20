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

  describe('bulk check of several target items', () => {
    function seed(): void {
      db = createTestDb()
      const now = '2026-01-01'
      db.sqlite.exec(`INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (2, 'image', '2026-01-01', '2026-01-01');`)
      const insert = db.sqlite.prepare(`
        INSERT INTO media (id, path, filesize, oshash, mediaTypeId, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      insert.run(1, '/a.mp4', 100, 'hash-a', 1, now, now)
      insert.run(2, '/copy/a.mp4', 100, 'hash-a', 1, now, now)
      insert.run(3, '/c.mp4', 300, 'hash-c', 1, now, now)
      insert.run(4, '/copy/c.mp4', 300, 'hash-c', 1, now, now)
      insert.run(5, '/c3.mp4', 300, 'hash-c', 1, now, now)
      insert.run(6, '/alone.mp4', 999, 'hash-x', 1, now, now)
      insert.run(7, '/e.jpg', 100, 'hash-a', 2, now, now)
    }

    it('returns one group per target with the first selected card of each group leading', () => {
      seed()
      const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaIds: [2, 3, 6]})
      expect(groups).toEqual([
        {key: 'hash-a', itemIds: [2, 1]},
        {key: 'hash-c', itemIds: [3, 4, 5]},
      ])
    })

    it('does not repeat a group when several selected cards belong to it', () => {
      seed()
      const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaIds: [4, 3, 5, 1]})
      expect(groups).toEqual([
        {key: 'hash-c', itemIds: [4, 3, 5]},
        {key: 'hash-a', itemIds: [1, 2]},
      ])
      const all = groups.flatMap((group) => group.itemIds)
      expect(new Set(all).size).toBe(all.length)
    })

    it('keeps media types apart and ignores missing, duplicate and invalid ids', () => {
      seed()
      const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'filesize', targetMediaIds: [7, 1, 1, 999, -5, 0]})
      // 7 is an image: its size 100 matches nothing in its own media type, so only the video group remains.
      expect(groups).toEqual([{key: '100', itemIds: [1, 2]}])
    })

    it('returns nothing for an empty or fully unknown selection', () => {
      seed()
      expect(listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaIds: []}).groups).toEqual([])
      expect(listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaIds: [998, 999]}).groups).toEqual([])
      expect(listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', targetMediaIds: [998, 999]}).groups).toEqual([])
    })

    it('a single selected card behaves like the single-target check', () => {
      seed()
      const bulk = listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaIds: [2]})
      const single = listMediaDuplicateGroups(db, {duplicatesBy: 'fingerprint', targetMediaId: 2})
      expect(bulk).toEqual(single)
    })

    it('finds copies of every selected card by the similarity policy, without shared cards between groups', () => {
      seed()
      const {groups} = listMediaDuplicateGroups(db, {duplicatesBy: 'similarity', targetMediaIds: [2, 4, 6, 3]})
      const sorted = groups.map((group) => [...group.itemIds].sort((a, b) => a - b)).sort((a, b) => a[0] - b[0])
      expect(sorted).toEqual([[1, 2], [3, 4, 5]])
      for (const group of groups) {
        expect(group.originalId).toBe(group.itemIds[0])
        expect(group.similarity?.every((match) => match.eligible)).toBe(true)
      }
      const all = groups.flatMap((group) => group.itemIds)
      expect(new Set(all).size).toBe(all.length)
    })

    it('runs the visual mode for a selection without errors when nothing is indexed', () => {
      seed()
      expect(listMediaDuplicateGroups(db, {duplicatesBy: 'visualHash', targetMediaIds: [1, 3, 7]}).groups).toEqual([])
    })
  })
})
