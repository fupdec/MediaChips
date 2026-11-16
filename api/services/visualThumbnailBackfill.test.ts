/** @vitest-environment node */
import {afterEach, describe, expect, it} from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import {createTestDb, closeTestDb, type TestDb} from '../db/testUtils/createTestDb'
import type {ApiDb} from '../types/db'
import {getVisualHashBackfillStatus, iterateVisualHashBackfill, upsertVisualHashForMedia} from './visualHashBackfill'
import {listMediaDuplicateGroups} from './mediaDuplicateGroups'

let fixture: TestDb | undefined
let root: string | undefined
afterEach(() => {
  if (fixture) closeTestDb(fixture)
  if (root) fs.rmSync(root, {recursive: true, force: true})
  fixture = undefined
  root = undefined
})
function setup() {
  fixture = createTestDb('thumbnail-backfill')
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-visual-previews-'))
  fixture.sqlite.exec(`
    INSERT INTO mediaTypes (id, type, createdAt, updatedAt) VALUES (1, 'video', '2026-01-01', '2026-01-01');
    INSERT INTO media (id, path, mediaTypeId, createdAt, updatedAt) VALUES
      (1, '/1.mp4', 1, '2026-01-01', '2026-01-01'),
      (2, '/2.mp4', 1, '2026-01-01', '2026-01-01');
  `)
  return {...fixture, path: root} as ApiDb
}
async function image(folder: string, id: number) {
  const destination = path.join(root!, 'media/videos', folder)
  fs.mkdirSync(destination, {recursive: true})
  await sharp({create: {width: 96, height: 96, channels: 3, background: 'white'}}).jpeg().toFile(path.join(destination, `${id}.jpg`))
}

describe('thumbnail backfill and result metadata', () => {
  it('hashes thumbnail-only videos and returns possible pairs with reasons and scope', async () => {
    const db = setup()
    await image('thumbs', 1)
    await image('thumbs', 2)
    expect(await getVisualHashBackfillStatus(db)).toMatchObject({total: 2, pending: 2, hashed: 0, videosWithoutGrid: 2})
    const events = []
    for await (const event of iterateVisualHashBackfill(db)) events.push(event)
    expect(events[events.length - 1]).toMatchObject({processed: 2, total: 2, hashed: 2, failed: 0})
    expect(await getVisualHashBackfillStatus(db)).toMatchObject({pending: 0, hashed: 2})
    const groups = listMediaDuplicateGroups(db, {duplicatesBy: 'visual', mediaTypeId: 1}).groups
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({confidence: 'possible', matches: [{reason: 'thumbnails'}]})
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'visual', mediaIds: [1]}).groups).toEqual([])
  })

  it('fills missing thumbnails on videos already hashed by grid, without retrying complete grid-only videos', async () => {
    const db = setup()
    await image('grids', 1)
    await image('grids', 2)
    await upsertVisualHashForMedia(db, 1)
    await upsertVisualHashForMedia(db, 2)
    expect(await getVisualHashBackfillStatus(db)).toMatchObject({pending: 0, hashed: 2})
    await image('thumbs', 1)
    expect(await getVisualHashBackfillStatus(db)).toMatchObject({pending: 1, hashed: 1})
    const events = []
    for await (const event of iterateVisualHashBackfill(db)) events.push(event)
    expect(events[events.length - 1]).toMatchObject({processed: 1, total: 1, hashed: 1})
    expect(await getVisualHashBackfillStatus(db)).toMatchObject({pending: 0, hashed: 2})
    expect(listMediaDuplicateGroups(db, {duplicatesBy: 'visual'}).groups[0]).toMatchObject({confidence: 'confident', matches: [{reason: 'grid'}]})
  })
})
