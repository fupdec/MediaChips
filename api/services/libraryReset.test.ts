import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {createTestDb, closeTestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {nowIso} from '../db/utils/timestamps'
import {iterateLibraryResetMedia, iterateLibraryResetTags, getLibraryResetCounts} from './libraryReset'
import type {LibraryResetStreamEvent} from '@shared/api/payloads'

function makeDb(): ApiDb & {dbPath: string; dataDir: string} {
  const {sqlite, drizzle, dbPath} = createTestDb('library-reset')
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-library-reset-data-'))
  return {sqlite, drizzle, path: dataDir, dbPath, dataDir} as ApiDb & {dbPath: string; dataDir: string}
}

async function collect(gen: AsyncIterable<LibraryResetStreamEvent>) {
  const events: LibraryResetStreamEvent[] = []
  for await (const event of gen) events.push(event)
  return events
}

describe('libraryReset', () => {
  let db: ApiDb & {dbPath: string; dataDir: string}
  const ts = nowIso()

  beforeEach(() => {
    db = makeDb()
    db.sqlite.exec(`
      INSERT INTO mediaTypes (id, name, type, createdAt, updatedAt) VALUES
        (1, 'Videos', 'video', '${ts}', '${ts}'),
        (2, 'Images', 'image', '${ts}', '${ts}');
      INSERT INTO media (id, path, basename, name, mediaTypeId, createdAt, updatedAt) VALUES
        (10, '/v/a.mp4', 'a.mp4', 'A', 1, '${ts}', '${ts}'),
        (11, '/v/b.mp4', 'b.mp4', 'B', 1, '${ts}', '${ts}'),
        (20, '/i/c.jpg', 'c.jpg', 'C', 2, '${ts}', '${ts}');
      INSERT INTO meta (id, name, type, createdAt, updatedAt) VALUES
        (1, 'Actors', 'array', '${ts}', '${ts}'),
        (2, 'Studios', 'array', '${ts}', '${ts}'),
        (3, 'Title', 'string', '${ts}', '${ts}');
      INSERT INTO tags (id, name, metaId, createdAt, updatedAt) VALUES
        (100, 'Alice', 1, '${ts}', '${ts}'),
        (101, 'Bob', 1, '${ts}', '${ts}'),
        (200, 'Studio X', 2, '${ts}', '${ts}');
      INSERT INTO metaInMediaTypes (metaId, mediaTypeId, "show", "order") VALUES
        (1, 1, 1, 0),
        (3, 1, 1, 1);
      INSERT INTO pinnedMetas (metaId, pinnedMetaId, "show", "order") VALUES
        (3, 1, 1, 0),
        (3, 3, 1, 1);
    `)
  })

  afterEach(() => {
    closeTestDb({sqlite: db.sqlite, dbPath: db.dbPath})
    fs.rmSync(db.dataDir, {recursive: true, force: true})
  })

  it('soft-deletes media of one type and leaves other types', async () => {
    const events = await collect(iterateLibraryResetMedia(db, {mediaTypeId: 1}))
    const complete = events.at(-1)
    expect(complete?.type).toBe('complete')
    expect(complete?.mediaDeleted).toBe(2)
    expect(complete?.stopped).toBe(false)

    const videos = db.sqlite.prepare(
      `SELECT id, deletedAt FROM media WHERE mediaTypeId = 1 ORDER BY id`,
    ).all() as Array<{id: number; deletedAt: string | null}>
    expect(videos.every((row) => Boolean(row.deletedAt))).toBe(true)

    const image = db.sqlite.prepare(`SELECT deletedAt FROM media WHERE id = 20`)
      .get() as {deletedAt: string | null}
    expect(image.deletedAt).toBeNull()
  })

  it('permanently deletes all media and keeps media types', async () => {
    const events = await collect(iterateLibraryResetMedia(db, {
      mediaTypeId: 'all',
      permanent: true,
    }))
    expect(events.at(-1)?.mediaDeleted).toBe(3)
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM media`).get())
      .toEqual({count: 0})
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM mediaTypes`).get())
      .toEqual({count: 2})
  })

  it('skips already-trashed media unless permanent', async () => {
    db.sqlite.prepare(`UPDATE media SET deletedAt = ? WHERE id = 10`).run(ts)
    const soft = await collect(iterateLibraryResetMedia(db, {mediaTypeId: 1}))
    expect(soft.at(-1)?.mediaDeleted).toBe(1)

    const permanent = await collect(iterateLibraryResetMedia(db, {
      mediaTypeId: 1,
      permanent: true,
    }))
    expect(permanent.at(-1)?.mediaDeleted).toBe(2)
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM media WHERE mediaTypeId = 1`).get())
      .toEqual({count: 0})
  })

  it('soft-deletes tags of one category then removes that meta', async () => {
    const metaDir = path.join(db.dataDir, 'meta', '1')
    fs.mkdirSync(metaDir, {recursive: true})
    fs.writeFileSync(path.join(metaDir, '100_main.jpg'), 'x')

    const events = await collect(iterateLibraryResetTags(db, {metaId: 1}))
    const complete = events.at(-1)
    expect(complete?.tagsDeleted).toBe(2)
    expect(complete?.metaDeleted).toBe(1)

    const alice = db.sqlite.prepare(`SELECT deletedAt, name FROM tags WHERE id = 100`)
      .get() as {deletedAt: string | null; name: string}
    expect(alice.deletedAt).toBeTruthy()
    expect(alice.name).toContain('__mediachips_trash__')

    expect(db.sqlite.prepare(`SELECT id FROM meta WHERE id = 1`).get()).toBeUndefined()
    expect(db.sqlite.prepare(`SELECT id FROM meta WHERE id = 2`).get()).toBeTruthy()
    expect(db.sqlite.prepare(`SELECT id FROM meta WHERE id = 3`).get()).toBeTruthy()
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM mediaTypes`).get())
      .toEqual({count: 2})
    expect(db.sqlite.prepare(
      `SELECT COUNT(*) AS count FROM metaInMediaTypes WHERE metaId = 3`,
    ).get()).toEqual({count: 1})
    expect(db.sqlite.prepare(
      `SELECT COUNT(*) AS count FROM pinnedMetas WHERE metaId = 3 AND pinnedMetaId = 3`,
    ).get()).toEqual({count: 1})
    expect(db.sqlite.prepare(
      `SELECT COUNT(*) AS count FROM pinnedMetas WHERE pinnedMetaId = 1`,
    ).get()).toEqual({count: 0})
    expect(fs.existsSync(metaDir)).toBe(false)
  })

  it('deletes all tags and categories but leaves media types and non-category meta', async () => {
    const events = await collect(iterateLibraryResetTags(db, {
      metaId: 'all',
      permanent: true,
    }))
    expect(events.at(-1)?.tagsDeleted).toBe(3)
    expect(events.at(-1)?.metaDeleted).toBe(2)
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM tags`).get())
      .toEqual({count: 0})
    expect(db.sqlite.prepare(`SELECT id, type FROM meta ORDER BY id`).all())
      .toEqual([{id: 3, type: 'string'}])
    expect(db.sqlite.prepare(`SELECT COUNT(*) AS count FROM mediaTypes`).get())
      .toEqual({count: 2})
    expect(db.sqlite.prepare(`SELECT metaId, pinnedMetaId FROM pinnedMetas`).all())
      .toEqual([{metaId: 3, pinnedMetaId: 3}])
    expect(db.sqlite.prepare(`SELECT metaId FROM metaInMediaTypes`).all())
      .toEqual([{metaId: 3}])
  })

  it('stops without deleting remaining items', async () => {
    let processed = 0
    const events = await collect(iterateLibraryResetMedia(db, {mediaTypeId: 'all'}, () => {
      processed += 1
      return processed > 2
    }))
    const complete = events.at(-1)
    expect(complete?.stopped).toBe(true)
    expect(complete?.mediaDeleted).toBeLessThan(3)
    const remaining = db.sqlite.prepare(
      `SELECT COUNT(*) AS count FROM media WHERE deletedAt IS NULL OR deletedAt = ''`,
    ).get() as {count: number}
    expect(remaining.count).toBeGreaterThan(0)
  })

  it('rejects unknown media types and non-category meta', async () => {
    await expect(collect(iterateLibraryResetMedia(db, {mediaTypeId: 99})))
      .rejects.toThrow('Media type not found.')
    await expect(collect(iterateLibraryResetTags(db, {metaId: 3})))
      .rejects.toThrow('Tag category not found.')
  })

  it('counts active media by type and tags by category', () => {
    db.sqlite.prepare(`UPDATE media SET deletedAt = ? WHERE id = 11`).run(ts)
    expect(getLibraryResetCounts(db)).toEqual({
      mediaByType: {1: 1, 2: 1},
      mediaTotal: 2,
      tagsByMeta: {1: 2, 2: 1},
      tagsTotal: 3,
    })
  })
})
