/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it} from 'vitest'
import type {ApiDb} from '../types/db'
import {createTestDb as createSharedTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import {queryAll} from '../db/utils/rawQuery'
import {getMediaFromClause, resolveMediaFilterQuery} from './mediaFilterSql'
import {findVisualNearDuplicateIds} from './visualHashBackfill'

let lastDbPath: string | undefined

function createTestDb(): ApiDb {
  const {sqlite, drizzle, dbPath} = createSharedTestDb('scoped-duplicates')
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

function insertMedia(
  db: ApiDb,
  row: {
    id: number
    path: string
    oshash?: string | null
    visualHash?: string | null
    filesize?: number
  },
) {
  const now = '2026-01-01'
  db.sqlite.prepare(`
    INSERT INTO media (id, path, filesize, oshash, visualHash, mediaTypeId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `).run(
    row.id,
    row.path,
    row.filesize ?? 1000,
    row.oshash ?? null,
    row.visualHash ?? null,
    now,
    now,
  )
}

function loadDuplicateIds(db: ApiDb, options: Parameters<typeof resolveMediaFilterQuery>[0]) {
  const filterQuery = resolveMediaFilterQuery(options)
  expect(filterQuery.ok).toBe(true)
  if (!filterQuery.ok) return [] as number[]

  const fromClause = getMediaFromClause(false, filterQuery.joinSql)
  const rows = queryAll<{id: number}>(db, `
    SELECT DISTINCT media.id AS id
    ${fromClause}
    WHERE ${filterQuery.whereSql}
    ORDER BY media.id
  `, filterQuery.replacements)
  return rows.map((row) => Number(row.id))
}

describe('scoped duplicate search', () => {
  let db: ApiDb

  afterEach(() => {
    if (db?.sqlite && lastDbPath) closeTestDb({sqlite: db.sqlite, dbPath: lastDbPath})
  })

  it('finds oshash duplicates only among tag-scoped candidates', () => {
    db = createTestDb()
    insertMedia(db, {id: 1, path: '/in-tag/a.mp4', oshash: 'same-hash'})
    insertMedia(db, {id: 2, path: '/in-tag/b.mp4', oshash: 'same-hash'})
    insertMedia(db, {id: 3, path: '/outside/c.mp4', oshash: 'same-hash'})

    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(1, 1050, 17)
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(2, 1050, 17)

    const unscoped = loadDuplicateIds(db, {
      mediaTypeId: 1,
      find_duplicates: true,
      duplicates_by: 'fingerprint',
      filters: [],
    })
    expect(unscoped).toEqual([1, 2, 3])

    const scoped = loadDuplicateIds(db, {
      mediaTypeId: 1,
      find_duplicates: true,
      duplicates_by: 'fingerprint',
      filters: [
        {active: true, param: 17, type: 'array', cond: 'in', val: [1050]},
      ],
    })
    expect(scoped).toEqual([1, 2])
  })

  it('does not treat cross-filter pairs as scoped duplicates', () => {
    db = createTestDb()
    // Only one tagged item shares the hash with an outside item → no scoped group.
    insertMedia(db, {id: 1, path: '/in-tag/a.mp4', oshash: 'pair-hash'})
    insertMedia(db, {id: 2, path: '/outside/b.mp4', oshash: 'pair-hash'})
    db.sqlite.prepare('INSERT INTO tagsInMedia VALUES (?, ?, ?)').run(1, 1050, 17)

    const scoped = loadDuplicateIds(db, {
      mediaTypeId: 1,
      find_duplicates: true,
      duplicates_by: 'fingerprint',
      filters: [
        {active: true, param: 17, type: 'array', cond: 'in', val: [1050]},
      ],
    })
    expect(scoped).toEqual([])

    const unscoped = loadDuplicateIds(db, {
      mediaTypeId: 1,
      find_duplicates: true,
      duplicates_by: 'fingerprint',
      filters: [],
    })
    expect(unscoped).toEqual([1, 2])
  })

  it('clusters visual near-duplicates only within candidateIds', () => {
    db = createTestDb()
    insertMedia(db, {id: 1, path: '/a.mp4', visualHash: 'ffffffffffffffff'})
    insertMedia(db, {id: 2, path: '/b.mp4', visualHash: 'fffffffffffffffe'})
    insertMedia(db, {id: 3, path: '/c.mp4', visualHash: 'fffffffffffffffd'})

    const all = findVisualNearDuplicateIds(db, 1, {
      maxGridDistance: 2,
    })
    expect(all.sort((a, b) => a - b)).toEqual([1, 2, 3])

    const scoped = findVisualNearDuplicateIds(db, 1, {
      maxGridDistance: 2,
      candidateIds: [1, 3],
    })
    // 1 and 3 are still similar within distance 2, but without 2 bridging.
    // With hashes ffff…f, ffff…e, ffff…d: distance(1,3)=2 so still a cluster.
    expect(scoped.sort((a, b) => a - b)).toEqual([1, 3])

    const noPair = findVisualNearDuplicateIds(db, 1, {
      maxGridDistance: 2,
      candidateIds: [1],
    })
    expect(noPair).toEqual([])
  })
})
