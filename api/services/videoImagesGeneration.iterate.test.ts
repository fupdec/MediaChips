/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it, vi} from 'vitest'

const mediaRepo = {
  countByMediaType: vi.fn(),
  findNextByMediaTypeAfterId: vi.fn(),
  findIdsByMediaType: vi.fn(),
}
const mediaTypesRepo = {
  findByType: vi.fn(),
}
const marksRepo = {
  countAll: vi.fn(),
  findNextWithMediaAfterId: vi.fn(),
  findAllIds: vi.fn(),
}

vi.mock('../db/repositories/media', () => ({
  createMediaRepository: () => mediaRepo,
}))
vi.mock('../db/repositories/mediaTypes', () => ({
  createMediaTypesRepository: () => mediaTypesRepo,
}))
vi.mock('../db/repositories/marks', () => ({
  createMarksRepository: () => marksRepo,
}))
vi.mock('./visualHashBackfill', () => ({
  upsertVisualHashForMedia: vi.fn(async () => {}),
}))
vi.mock('./contentHash', () => ({
  resolveExistingPath: vi.fn(async (p: string) => p),
}))
vi.mock('../utils/ffmpeg', () => ({
  extractVideoFrame: vi.fn(async () => {}),
  extractVideoThumbnail: vi.fn(async () => {}),
  combineVideoFrames: vi.fn(async () => {}),
  ffprobe: vi.fn(async () => ({format: {duration: 10}})),
  getVideoStreamDimensions: vi.fn(() => ({aspectRatio: 16 / 9})),
}))
vi.mock('./videoGrid', () => ({
  generateVideoGrid: vi.fn(async () => ({output: '1.jpg'})),
}))

import {iterateVideoImagesGeneration} from './videoImagesGeneration'
import type {ApiDb} from '../types/db'

describe('iterateVideoImagesGeneration', () => {
  const tempDirs: string[] = []
  const db = {drizzle: {}, sqlite: {}, path: '/tmp'} as ApiDb

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true})
    }
    vi.clearAllMocks()
  })

  function makeDbPath() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vid-img-'))
    tempDirs.push(dir)
    fs.mkdirSync(path.join(dir, 'media/videos/thumbs'), {recursive: true})
    return dir
  }

  it('emits error for unknown image type', async () => {
    const events = []
    for await (const event of iterateVideoImagesGeneration(db, makeDbPath(), 'nope' as 'preview')) {
      events.push(event)
    }
    expect(events).toEqual([{type: 'error', message: 'Unknown image type: nope'}])
  })

  it('skips existing previews and stops when shouldStop flips', async () => {
    const dbPath = makeDbPath()
    fs.writeFileSync(path.join(dbPath, 'media/videos/thumbs/1.jpg'), 'x')
    mediaTypesRepo.findByType.mockReturnValue({id: 1})
    mediaRepo.countByMediaType.mockReturnValue(2)
    mediaRepo.findNextByMediaTypeAfterId
      .mockReturnValueOnce({id: 1, path: '/a.mp4'})
      .mockReturnValueOnce({id: 2, path: '/b.mp4'})
      .mockReturnValue(null)

    let stop = false
    const events = []
    for await (const event of iterateVideoImagesGeneration(db, dbPath, 'preview', {
      shouldStop: () => stop,
      force: false,
    })) {
      events.push(event)
      if (event.type === 'progress' && event.processed === 1) stop = true
    }

    expect(events[0]).toMatchObject({type: 'progress', processed: 0, total: 2})
    expect(events.some((e) => e.type === 'progress' && e.lastStatus === 'skipped')).toBe(true)
    expect(events[events.length - 1]).toMatchObject({type: 'complete', skipped: 1, stopped: true})
  })

  it('completes empty when video media type is missing', async () => {
    mediaTypesRepo.findByType.mockReturnValue(null)
    const events = []
    for await (const event of iterateVideoImagesGeneration(db, makeDbPath(), 'preview')) {
      events.push(event)
    }
    expect(events).toEqual([
      {type: 'complete', processed: 0, total: 0, created: 0, skipped: 0, missing: 0, failed: 0},
    ])
  })
})
