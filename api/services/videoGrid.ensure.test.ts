/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'

const runFfmpeg = vi.fn(async () => ({stdout: '', stderr: ''}))

vi.mock('../utils/ffmpeg', () => ({
  runFfmpeg: (...args: unknown[]) => runFfmpeg(...args),
  ffprobe: vi.fn(async () => ({
    format: {duration: 90},
    streams: [{codec_type: 'video', width: 1920, height: 1080}],
  })),
  getVideoStreamDimensions: vi.fn(() => ({aspectRatio: 16 / 9})),
}))

vi.mock('./safeFileReplace', () => ({
  writeFileAtomically: vi.fn(async (outPath: string, write: (temp: string) => Promise<void>) => {
    const fs = await import('fs')
    await write(`${outPath}.tmp`)
    fs.writeFileSync(outPath, 'grid')
  }),
}))

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  ensureVideoGrid,
  resetVideoGridInFlightForTests,
} from './videoGrid'

const tempDirs: string[] = []

afterEach(() => {
  resetVideoGridInFlightForTests()
  vi.clearAllMocks()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true})
  }
})

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-grid-'))
  tempDirs.push(dir)
  return dir
}

describe('ensureVideoGrid', () => {
  it('coalesces concurrent creates for the same output into one ffmpeg job', async () => {
    const dbPath = makeTempDir()
    const input = path.join(dbPath, 'clip.mp4')
    fs.writeFileSync(input, 'fake')

    const opts = {
      input,
      output: '7.jpg',
      cols: 3,
      rows: 3,
      width: 320,
    }

    const [a, b] = await Promise.all([
      ensureVideoGrid(opts, dbPath),
      ensureVideoGrid(opts, dbPath),
    ])

    expect(a).toEqual({output: '7.jpg'})
    expect(b).toEqual({output: '7.jpg'})
    expect(runFfmpeg).toHaveBeenCalledTimes(1)
  })

  it('returns immediately when the grid file already exists', async () => {
    const dbPath = makeTempDir()
    const grids = path.join(dbPath, 'media/videos/grids')
    fs.mkdirSync(grids, {recursive: true})
    fs.writeFileSync(path.join(grids, '3.jpg'), 'already')

    const result = await ensureVideoGrid({
      input: path.join(dbPath, 'missing.mp4'),
      output: '3.jpg',
      cols: 3,
      rows: 3,
      width: 320,
    }, dbPath)

    expect(result).toEqual({output: '3.jpg'})
    expect(runFfmpeg).not.toHaveBeenCalled()
  })
})
