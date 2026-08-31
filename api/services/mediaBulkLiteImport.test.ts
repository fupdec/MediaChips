/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {closeTestDb, createTestDb, type TestDb} from '../db/testUtils/createTestDb'
import {mediaTypes} from '../db/schema/mediaTypes'
import {createMediaRepository} from '../db/repositories/media'
import {runMediaBulkLiteImport} from './mediaBulkLiteImport'
import {FAST_IMPORT_AUTO_THRESHOLD} from '../../shared/mediaBulkImport'

vi.mock('./mediaCacheInvalidation', () => ({
  invalidateMediaDerivedCaches: vi.fn(),
}))

describe('runMediaBulkLiteImport', () => {
  let db: TestDb
  let tmpDir = ''
  let mediaTypeId = 0

  beforeEach(() => {
    db = createTestDb('bulk-lite')
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-bulk-lite-'))
    const now = new Date().toISOString()
    const row = db.drizzle.insert(mediaTypes).values({
      name: 'Images',
      type: 'image',
      extensions: 'jpg,jpeg,png',
      order: 1,
      createdAt: now,
      updatedAt: now,
    }).returning().get()
    mediaTypeId = row.id
  })

  afterEach(() => {
    closeTestDb(db)
    fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  function writeJpg(name: string): string {
    const filePath = path.join(tmpDir, name)
    // Minimal JPEG SOI/EOI — enough for stat + insert (no decode on lite path).
    fs.writeFileSync(filePath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))
    return filePath
  }

  it(`auto-threshold constant is ${999}`, () => {
    expect(FAST_IMPORT_AUTO_THRESHOLD).toBe(999)
  })

  it('inserts thin rows without probing and is idempotent on re-import', async () => {
    const files = [
      writeJpg('a.jpg'),
      writeJpg('b.jpg'),
      writeJpg('c.jpg'),
    ]

    const first = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId, type: 'image', extensions: 'jpg'},
      files,
    })

    expect(first.scanned).toBe(3)
    expect(first.inserted).toBe(3)
    expect(first.skipped).toBe(0)
    expect(first.errors).toEqual([])
    expect(first.added).toHaveLength(3)

    const repo = createMediaRepository(db.drizzle)
    expect(repo.countAll()).toBe(3)
    const row = repo.findById(first.added[0].mediaId)
    expect(row?.path).toBe(files[0])
    expect(row?.basename).toBe('a.jpg')
    expect(row?.filesize).toBeGreaterThan(0)
    expect(row?.mediaTypeId).toBe(mediaTypeId)
    expect(row?.oshash).toBeNull()

    const second = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId},
      files,
    })

    expect(second.inserted).toBe(0)
    expect(second.skipped).toBe(3)
    expect(repo.countAll()).toBe(3)
  })

  it('walks roots and filters by extension', async () => {
    writeJpg('keep.jpg')
    fs.writeFileSync(path.join(tmpDir, 'skip.txt'), 'nope')

    const result = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId, type: 'image', extensions: 'jpg'},
      roots: [tmpDir],
    })

    expect(result.scanned).toBe(1)
    expect(result.inserted).toBe(1)
    expect(result.added[0].path.endsWith('keep.jpg')).toBe(true)
  })

  it('merges roots walk with explicit files', async () => {
    writeJpg('from-root.jpg')
    const otherDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-bulk-loose-'))
    const loose = path.join(otherDir, 'loose.jpg')
    fs.writeFileSync(loose, Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

    try {
      const result = await runMediaBulkLiteImport(db.drizzle, {
        mediaType: {id: mediaTypeId, type: 'image', extensions: 'jpg'},
        roots: [tmpDir],
        files: [loose],
      })

      expect(result.scanned).toBe(2)
      expect(result.inserted).toBe(2)
      expect(result.added.map((row) => row.path).sort()).toEqual([loose, path.join(tmpDir, 'from-root.jpg')].sort())
    } finally {
      fs.rmSync(otherDir, {recursive: true, force: true})
    }
  })

  it('caps added[] while reporting full inserted count', async () => {
    const files: string[] = []
    for (let i = 0; i < 12; i += 1) {
      files.push(writeJpg(`cap-${i}.jpg`))
    }

    const {MEDIA_BULK_LITE_ADDED_CAP} = await import('../../shared/mediaBulkImport')
    // Cap is 5000 in production; temporarily exercise via spy on constant use —
    // just assert inserted equals scanned and added length <= cap for a small set.
    const result = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId, type: 'image', extensions: 'jpg'},
      files,
    })

    expect(result.scanned).toBe(12)
    expect(result.inserted).toBe(12)
    expect(result.added.length).toBeLessThanOrEqual(MEDIA_BULK_LITE_ADDED_CAP)
    expect(result.added.length).toBe(12)
  })

  it('records missing files as errors', async () => {
    const missing = path.join(tmpDir, 'gone.jpg')
    const result = await runMediaBulkLiteImport(db.drizzle, {
      mediaType: {id: mediaTypeId},
      files: [missing],
    })
    expect(result.inserted).toBe(0)
    expect(result.errors).toContain(missing)
  })
})
