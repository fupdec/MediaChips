import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {cleanupDir} from './faceCropStore'

const {extractVideoFrame, ffprobe} = vi.hoisted(() => ({
  extractVideoFrame: vi.fn(),
  ffprobe: vi.fn(async () => ({format: {duration: 10}})),
}))

vi.mock('../utils/ffmpeg', () => ({
  extractVideoFrame,
  ffprobe,
}))

vi.mock('./faceDetectorMath', async () => {
  const actual = await vi.importActual<typeof import('./faceDetectorMath')>('./faceDetectorMath')
  return {
    ...actual,
    getFrameTimestamps: () => ['0', '1', '2', '3'],
    computeOversampledFrameCount: () => ({targetCount: 2, candidateCount: 4}),
    pickDiverseFrames: (
      candidates: Array<{framePath: string; timestamp: string; fingerprint: string}>,
    ) => candidates.slice(0, 2),
  }
})

import {
  FACE_FRAME_EXTRACT_CONCURRENCY,
  collectLumaValuesFromRgba,
  extractFramesForMedia,
  frameFingerprint,
  unlinkUnselectedFrameFiles,
} from './faceFrameExtract'

const tmpRoots: string[] = []

afterEach(() => {
  for (const root of tmpRoots.splice(0)) cleanupDir(root)
})

describe('collectLumaValuesFromRgba', () => {
  it('reads the R channel from RGBA pixels', () => {
    const data = new Uint8Array([
      10, 0, 0, 255,
      20, 0, 0, 255,
      30, 0, 0, 255,
      40, 0, 0, 255,
    ])
    expect(collectLumaValuesFromRgba(data, 2, 2)).toEqual([10, 20, 30, 40])
  })
})

describe('unlinkUnselectedFrameFiles', () => {
  it('deletes candidates that were not selected', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-frame-extract-'))
    tmpRoots.push(root)
    const keep = path.join(root, 'keep.jpg')
    const drop = path.join(root, 'drop.jpg')
    fs.writeFileSync(keep, 'k')
    fs.writeFileSync(drop, 'd')
    unlinkUnselectedFrameFiles(
      [{framePath: keep}, {framePath: drop}],
      [{framePath: keep}],
    )
    expect(fs.existsSync(keep)).toBe(true)
    expect(fs.existsSync(drop)).toBe(false)
  })
})

describe('frameFingerprint', () => {
  it('returns a 64-bit aHash for a sharp-generated image', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mediachips-frame-fp-'))
    tmpRoots.push(root)
    const filePath = path.join(root, 'frame.png')
    const {default: sharp} = await import('sharp')
    await sharp({
      create: {
        width: 64,
        height: 64,
        channels: 3,
        background: {r: 10, g: 10, b: 10},
      },
    }).png().toFile(filePath)

    const hash = await frameFingerprint(filePath)
    expect(hash).toMatch(/^[01]{64}$/)
  })
})

describe('extractFramesForMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ffprobe.mockResolvedValue({format: {duration: 10}})
  })

  it('returns empty frames when the media path is missing', async () => {
    const result = await extractFramesForMedia({id: 1, path: '/no/such/video.mp4'})
    tmpRoots.push(result.tmpDir)
    expect(result.frames).toEqual([])
    expect(fs.existsSync(result.tmpDir)).toBe(true)
  })

  it('extracts candidates with bounded concurrency and preserves timestamp order', async () => {
    const videoPath = path.join(os.tmpdir(), `mediachips-video-${Date.now()}.mp4`)
    fs.writeFileSync(videoPath, 'fake')
    tmpRoots.push(videoPath)

    let inFlight = 0
    let maxInFlight = 0
    const finishOrder: string[] = []

    extractVideoFrame.mockImplementation(async ({output, timestamp}) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, Number(timestamp) === 0 ? 15 : 1))
      const {default: sharp} = await import('sharp')
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: {r: 20, g: 20, b: 20},
        },
      }).jpeg().toFile(output)
      finishOrder.push(String(timestamp))
      inFlight -= 1
    })

    const result = await extractFramesForMedia(
      {id: 7, path: videoPath},
      {extractConcurrency: 2},
    )
    tmpRoots.push(result.tmpDir)

    expect(FACE_FRAME_EXTRACT_CONCURRENCY).toBeGreaterThan(1)
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(1)
    expect(result.frames.map((frame) => frame.timestamp)).toEqual(['0', '1'])
    expect(extractVideoFrame).toHaveBeenCalledTimes(4)
  })

  it('stops scheduling later batches when shouldStop flips', async () => {
    const videoPath = path.join(os.tmpdir(), `mediachips-video-stop-${Date.now()}.mp4`)
    fs.writeFileSync(videoPath, 'fake')
    tmpRoots.push(videoPath)

    let started = 0
    extractVideoFrame.mockImplementation(async ({output}) => {
      started += 1
      const {default: sharp} = await import('sharp')
      await sharp({
        create: {
          width: 8,
          height: 8,
          channels: 3,
          background: {r: 20, g: 20, b: 20},
        },
      }).jpeg().toFile(output)
    })

    const result = await extractFramesForMedia(
      {id: 8, path: videoPath},
      {
        extractConcurrency: 2,
        shouldStop: () => started >= 2,
      },
    )
    tmpRoots.push(result.tmpDir)

    expect(started).toBeLessThan(4)
    expect(result.frames).toEqual([])
  })
})
