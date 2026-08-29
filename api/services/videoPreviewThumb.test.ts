import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../db/repositories/media', () => ({
  createMediaRepository: vi.fn(() => ({
    findById: vi.fn(() => null),
  })),
}))

vi.mock('../utils/ffmpeg', () => ({
  extractVideoThumbnail: vi.fn(async () => {
    throw new Error('ffmpeg should not run in these unit tests')
  }),
}))

import {
  getVideoThumbPath,
  isUsableVideoThumbFile,
  isVideoThumbRequest,
  MIN_USABLE_VIDEO_THUMB_BYTES,
  parseVideoThumbMediaId,
  resolveVideoThumbFilePath,
} from './videoPreviewThumb'

const tempDirs: string[] = []

afterEach(() => {
  vi.clearAllMocks()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, {recursive: true, force: true})
  }
})

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-video-thumb-'))
  tempDirs.push(dir)
  return dir
}

/** Minimal JPEG: SOI + padding to clear the size floor. */
function writeValidJpegStub(filePath: string, size = MIN_USABLE_VIDEO_THUMB_BYTES): void {
  const buffer = Buffer.alloc(size, 0)
  buffer[0] = 0xff
  buffer[1] = 0xd8
  fs.mkdirSync(path.dirname(filePath), {recursive: true})
  fs.writeFileSync(filePath, buffer)
}

describe('videoPreviewThumb', () => {
  it('parses media id from thumb paths', () => {
    expect(parseVideoThumbMediaId('/db/media/videos/thumbs/42.jpg')).toBe(42)
    expect(parseVideoThumbMediaId('C:\\db\\media\\videos\\thumbs\\7.jpg')).toBe(7)
    expect(parseVideoThumbMediaId('/db/media/videos/grids/42.jpg')).toBeNull()
    expect(parseVideoThumbMediaId('/db/media/images/thumbs/42.jpg')).toBeNull()
  })

  it('detects video thumb requests', () => {
    expect(isVideoThumbRequest('/db/media/videos/thumbs/1.jpg')).toBe(true)
    expect(isVideoThumbRequest('/db/media/videos/grids/1.jpg')).toBe(false)
  })

  it('builds thumb output path', () => {
    expect(getVideoThumbPath('/tmp/db', 15)).toBe(
      path.join('/tmp/db', 'media/videos/thumbs/15.jpg'),
    )
  })

  describe('isUsableVideoThumbFile', () => {
    it('rejects missing, empty, tiny, and non-JPEG files', () => {
      const dir = makeTempDir()
      const missing = path.join(dir, 'missing.jpg')
      const empty = path.join(dir, 'empty.jpg')
      const tiny = path.join(dir, 'tiny.jpg')
      const junk = path.join(dir, 'junk.jpg')

      fs.writeFileSync(empty, '')
      fs.writeFileSync(tiny, Buffer.from([0xff, 0xd8, 0x00]))
      fs.writeFileSync(junk, Buffer.alloc(MIN_USABLE_VIDEO_THUMB_BYTES, 0x41))

      expect(isUsableVideoThumbFile(missing)).toBe(false)
      expect(isUsableVideoThumbFile(empty)).toBe(false)
      expect(isUsableVideoThumbFile(tiny)).toBe(false)
      expect(isUsableVideoThumbFile(junk)).toBe(false)
    })

    it('accepts a large enough JPEG SOI file', () => {
      const dir = makeTempDir()
      const file = path.join(dir, 'ok.jpg')
      writeValidJpegStub(file)
      expect(isUsableVideoThumbFile(file)).toBe(true)
    })
  })

  describe('resolveVideoThumbFilePath', () => {
    it('returns usable existing thumbs without regenerating', async () => {
      const dir = makeTempDir()
      const thumbPath = path.join(dir, 'media/videos/thumbs/9.jpg')
      writeValidJpegStub(thumbPath)

      const {extractVideoThumbnail} = await import('../utils/ffmpeg')

      const resolved = await resolveVideoThumbFilePath(
        thumbPath,
        {path: dir, drizzle: {}} as never,
        (filePath) => (filePath === thumbPath ? thumbPath : null),
      )

      expect(resolved).toBe(thumbPath)
      expect(extractVideoThumbnail).not.toHaveBeenCalled()
    })

    it('deletes unusable thumbs and skips ffmpeg when media is missing', async () => {
      const dir = makeTempDir()
      const thumbPath = path.join(dir, 'media/videos/thumbs/11.jpg')
      fs.mkdirSync(path.dirname(thumbPath), {recursive: true})
      fs.writeFileSync(thumbPath, '')

      const {extractVideoThumbnail} = await import('../utils/ffmpeg')

      const resolved = await resolveVideoThumbFilePath(
        thumbPath,
        {path: dir, drizzle: {}} as never,
        (filePath) => (filePath === thumbPath ? thumbPath : null),
      )

      expect(fs.existsSync(thumbPath)).toBe(false)
      expect(resolved).toBeNull()
      expect(extractVideoThumbnail).not.toHaveBeenCalled()
    })

    it('passes through non-thumb resolved files unchanged', async () => {
      const dir = makeTempDir()
      const videoPath = path.join(dir, 'clip.mp4')
      fs.writeFileSync(videoPath, 'not-a-thumb')

      const resolved = await resolveVideoThumbFilePath(
        videoPath,
        {path: dir, drizzle: {}} as never,
        (filePath) => (filePath === videoPath ? videoPath : null),
      )

      expect(resolved).toBe(videoPath)
      expect(fs.existsSync(videoPath)).toBe(true)
    })
  })
})
