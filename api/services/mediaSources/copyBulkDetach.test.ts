// @vitest-environment node
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {createTestDb, closeTestDb, type TestDb} from '../../db/testUtils/createTestDb'
import {createMediaRepository} from '../../db/repositories/media'
import type {ApiDb} from '../../types/db'
import {copyCandidates} from './copies'
import {applyDetachCopies, pathUnderPrefix, previewDetachCopies} from './copyBulkDetach'

describe('bulk copy detachment by path prefix', () => {
  let fixture: TestDb
  let db: ApiDb
  beforeEach(() => {
    fixture = createTestDb('bulk-detach')
    db = {...fixture}
    fixture.sqlite.exec(`INSERT INTO mediaTypes (id, type, name, createdAt, updatedAt) VALUES (1, 'video', 'Videos', '2026', '2026');`)
  })
  afterEach(() => closeTestDb(fixture))
  const card = (name: string, paths: string[], availability = 'unavailable') => {
    const created = createMediaRepository(db.drizzle).create({path: paths[0], name, mediaTypeId: 1, filesize: 10})
    paths.forEach((p, i) => fixture.sqlite.prepare(`INSERT INTO verifiedMediaCopies (id, mediaId, path, relationship, version, sha256, oshash, verificationMethod, size, contentType, availability, verifiedAt)
      VALUES (?, ?, ?, 'copy', 'v', '', 'abc', 'oshash', 10, 'video/mp4', ?, '2026')`).run(`${created.id}-${i}`, created.id, p, i === 0 ? availability : 'available'))
    return created
  }

  it('matches on directory boundaries and ignores drive-letter case', () => {
    expect(pathUnderPrefix('/Volumes/NAS/media/a.mp4', '/Volumes/NAS/media/')).toBe(true)
    expect(pathUnderPrefix('/Volumes/NAS/media2/a.mp4', '/Volumes/NAS/media')).toBe(false)
    expect(pathUnderPrefix('D:\\Videos\\a.mp4', 'd:/videos')).toBe(true)
    expect(pathUnderPrefix('/a/b', '/')).toBe(false)
  })

  it('previews and detaches matching copies, keeps each last copy, and repoints the card', () => {
    const a = card('A', ['/Volumes/NAS/a.mp4', 'nas://c1/a.mp4'])
    const b = card('B', ['/Volumes/NAS/b.mp4'])
    const c = card('C', ['/other/c.mp4', 'nas://c1/c.mp4'])
    const preview = previewDetachCopies(db, {prefix: '/Volumes/NAS'})
    expect(preview).toMatchObject({totalCards: 1, totalCopies: 1, skippedAllMatch: 1})
    expect(preview.cards[0]).toMatchObject({mediaId: a.id})
    const result = applyDetachCopies(db, {prefix: '/Volumes/NAS', expectedCopies: 1})
    expect(result).toEqual({cards: 1, copies: 1, failed: []})
    expect(copyCandidates(db, a.id).map(copy => copy.path)).toEqual(['nas://c1/a.mp4'])
    expect(createMediaRepository(db.drizzle).findById(a.id)?.path).toBe('nas://c1/a.mp4')
    expect(copyCandidates(db, b.id)).toHaveLength(1)
    expect(copyCandidates(db, c.id)).toHaveLength(2)
  })

  it('can limit to unavailable copies and refuses a stale plan', () => {
    card('A', ['/Volumes/NAS/a.mp4', 'nas://c1/a.mp4'], 'available')
    expect(previewDetachCopies(db, {prefix: '/Volumes/NAS', onlyUnavailable: true}).totalCopies).toBe(0)
    expect(() => applyDetachCopies(db, {prefix: '/Volumes/NAS', expectedCopies: 5})).toThrow('plan_changed')
    expect(() => previewDetachCopies(db, {prefix: '  '})).toThrow('prefix_required')
  })
})
