import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const mocks = vi.hoisted(() => ({
  ffprobe: vi.fn(),
  resolveDuration: vi.fn(),
  trim: vi.fn(),
  findById: vi.fn(),
  updateById: vi.fn(),
  updateMetadata: vi.fn(),
  unlink: vi.fn(),
  invalidate: vi.fn(),
  assertAllowed: vi.fn(),
}))

vi.mock('./libraryMaintenance', () => ({
  assertLibraryOperationAllowed: mocks.assertAllowed,
  runLibraryOperation: (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('../utils/ffmpeg', () => ({
  ffprobe: mocks.ffprobe,
  resolveFfprobeDuration: mocks.resolveDuration,
  trimVideoFile: mocks.trim,
}))
vi.mock('../db/repositories/media', () => ({
  createMediaRepository: () => ({findById: mocks.findById, updateById: mocks.updateById}),
}))
vi.mock('../db/repositories/videoMetadata', () => ({
  createVideoMetadataRepository: () => ({updateByMediaId: mocks.updateMetadata}),
}))
vi.mock('./mediaCacheInvalidation', () => ({invalidateMediaDerivedCaches: mocks.invalidate}))
vi.mock('./localAssetCleanup', () => ({unlinkResolvedPath: mocks.unlink}))

import {cancelVideoTrim, deleteTrimOriginal, getVideoTrimJob, startVideoTrim} from './videoTrimService'

const db = {drizzle: {}} as never
let dir = ''
let source = ''

function createFile(name: string, content = 'video'): string {
  const file = path.join(dir, name)
  fs.writeFileSync(file, content)
  return file
}

async function finish(id: string) {
  await vi.waitFor(() => {
    const status = getVideoTrimJob(id)?.status
    expect(status === 'done' || status === 'error' || status === 'cancelled').toBe(true)
  })
  return getVideoTrimJob(id)!
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-trim-'))
  source = createFile('clip.mp4')
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.findById.mockImplementation((id: number) => (id === 1 ? {id: 1, path: source} : undefined))
  mocks.ffprobe.mockResolvedValue({format: {duration: '100'}})
  mocks.resolveDuration.mockResolvedValue(100)
  mocks.trim.mockImplementation(async (_src: string, temp: string, options: {onProgress?: (n: number) => void}) => {
    fs.writeFileSync(temp, 'trimmed')
    options.onProgress?.(55)
    return {outputPath: temp, fallback: false}
  })
  mocks.unlink.mockImplementation(async (file: string) => { fs.rmSync(file, {force: true}); return true })
})

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true})
})

describe('startVideoTrim validation', () => {
  it('refuses to start while the library is being replaced', () => {
    mocks.assertAllowed.mockImplementation(() => { throw new Error('Library is busy') })
    expect(() => startVideoTrim(db, {id: 1, path: source, startSeconds: 1, endSeconds: 5})).toThrow('Library is busy')
  })

  it('rejects an unknown media id, a stale path and archive entries', () => {
    expect(() => startVideoTrim(db, {id: 9, path: source, startSeconds: 1, endSeconds: 5})).toThrow('Media 9 not found')
    expect(() => startVideoTrim(db, {id: 1, path: '/elsewhere.mp4', startSeconds: 1, endSeconds: 5})).toThrow('path mismatch')
    mocks.findById.mockReturnValue({id: 1, path: '/a/pack.zip!/inner.mp4'})
    expect(() => startVideoTrim(db, {id: 1, path: '/a/pack.zip!/inner.mp4', startSeconds: 1, endSeconds: 5})).toThrow('ZIP archives')
  })
})

describe('startVideoTrim job', () => {
  it('trims into a "_TRIM" sibling and leaves the original untouched', async () => {
    const job = startVideoTrim(db, {id: 1, path: source, startSeconds: 10, endSeconds: 30})
    expect(job.status === 'queued' || job.status === 'running' || job.status === 'done').toBe(true)
    const done = await finish(job.id)
    expect(done.status).toBe('done')
    expect(done.progress).toBe(100)
    expect(done.outputPath).toBe(path.join(dir, 'clip_TRIM.mp4'))
    expect(fs.readFileSync(done.outputPath!, 'utf8')).toBe('trimmed')
    expect(fs.existsSync(source)).toBe(true)
    expect(mocks.trim).toHaveBeenCalledWith(source, expect.stringContaining('.mc-trim-'), expect.objectContaining({startSeconds: 10, durationSeconds: 20}))
    expect(fs.readdirSync(dir).filter((name) => name.startsWith('.mc-trim-'))).toEqual([])
  })

  it('does not overwrite an earlier trim', async () => {
    createFile('clip_TRIM.mp4', 'earlier')
    const done = await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 10, endSeconds: 30}).id)
    expect(done.outputPath).toBe(path.join(dir, 'clip_TRIM_2.mp4'))
    expect(fs.readFileSync(path.join(dir, 'clip_TRIM.mp4'), 'utf8')).toBe('earlier')
  })

  it('swaps the start and end and clamps them to the video length', async () => {
    const done = await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 500, endSeconds: 40}).id)
    expect(done.status).toBe('done')
    expect(done.startSeconds).toBe(40)
    expect(done.endSeconds).toBe(100)
  })

  it('names the output after the real container when the fallback changed it', async () => {
    mocks.trim.mockImplementation(async (_src: string, temp: string) => {
      const converted = temp.replace(/\.mp4$/, '.mkv')
      fs.writeFileSync(converted, 'converted')
      return {outputPath: converted, fallback: true}
    })
    const done = await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 10, endSeconds: 30}).id)
    expect(done.fallback).toBe(true)
    expect(done.outputPath).toBe(path.join(dir, 'clip_TRIM.mkv'))
  })

  it('fails when the source disappeared, has no duration, or the range is the whole video', async () => {
    fs.rmSync(source)
    expect((await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 1, endSeconds: 5}).id)).error).toBe('Source file not found')

    source = createFile('clip.mp4')
    mocks.findById.mockImplementation(() => ({id: 1, path: source}))
    mocks.resolveDuration.mockResolvedValue(0)
    expect((await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 1, endSeconds: 5}).id)).error).toBe('Source has no usable duration')

    mocks.resolveDuration.mockResolvedValue(100)
    const whole = await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 0, endSeconds: 100}).id)
    expect(whole.status).toBe('error')
    expect(whole.error).toBe('Choose a start and end inside the video')
    expect(mocks.trim).not.toHaveBeenCalled()
  })

  it('removes the temp file and reports the error when ffmpeg fails', async () => {
    mocks.trim.mockImplementation(async (_src: string, temp: string) => {
      fs.writeFileSync(temp, 'partial')
      throw new Error('ffmpeg exploded')
    })
    const done = await finish(startVideoTrim(db, {id: 1, path: source, startSeconds: 10, endSeconds: 30}).id)
    expect(done.status).toBe('error')
    expect(done.error).toBe('ffmpeg exploded')
    expect(fs.readdirSync(dir)).toEqual(['clip.mp4'])
  })
})

describe('cancelVideoTrim', () => {
  it('aborts a running trim and reports it as cancelled', async () => {
    mocks.trim.mockImplementation((_src: string, _temp: string, options: {signal: AbortSignal}) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new Error('Conversion cancelled')))
    }))
    const job = startVideoTrim(db, {id: 1, path: source, startSeconds: 10, endSeconds: 30})
    await vi.waitFor(() => expect(mocks.trim).toHaveBeenCalled())
    expect(cancelVideoTrim(job.id)).toBe(true)
    const done = await finish(job.id)
    expect(done.status).toBe('cancelled')
    expect(done.error).toBe('Trim cancelled')
    expect(cancelVideoTrim(job.id)).toBe(false)
  })

  it('returns false for unknown jobs, and unknown jobs cannot be read', () => {
    expect(cancelVideoTrim('nope')).toBe(false)
    expect(getVideoTrimJob('nope')).toBeNull()
  })
})

describe('deleteTrimOriginal', () => {
  let trimmed = ''

  beforeEach(() => {
    trimmed = createFile('clip_TRIM.mp4', 'trimmed-bytes')
    mocks.resolveDuration.mockResolvedValue(20)
  })

  it('swaps the card to the trimmed file, drops the original and resets content hashes', async () => {
    const result = await deleteTrimOriginal(db, {id: 1, originalPath: source, trimmedPath: trimmed})
    expect(fs.existsSync(source)).toBe(false)
    expect(result).toMatchObject({id: 1, path: trimmed, basename: 'clip_TRIM.mp4', name: 'clip_TRIM', ext: '.mp4', duration: 20, filesize: 13})
    expect(mocks.updateById).toHaveBeenCalledWith(1, expect.objectContaining({
      path: trimmed, filesize: 13, contentHash: '', oshash: '', visualHash: '', visualHashTiles: '',
    }))
    expect(mocks.updateMetadata).toHaveBeenCalledWith(1, {duration: 20})
    expect(mocks.invalidate).toHaveBeenCalled()
  })

  it('still works when the card already points at the trimmed file', async () => {
    mocks.findById.mockReturnValue({id: 1, path: trimmed})
    await expect(deleteTrimOriginal(db, {id: 1, originalPath: source, trimmedPath: trimmed})).resolves.toMatchObject({path: trimmed})
  })

  it('skips the duration update when it cannot be read', async () => {
    mocks.resolveDuration.mockResolvedValue(0)
    const result = await deleteTrimOriginal(db, {id: 1, originalPath: source, trimmedPath: trimmed})
    expect(mocks.updateMetadata).not.toHaveBeenCalled()
    expect(result.duration).toBeUndefined()
  })

  it('refuses unknown media, a missing trimmed file and an unrelated card path', async () => {
    await expect(deleteTrimOriginal(db, {id: 9, originalPath: source, trimmedPath: trimmed})).rejects.toThrow('Media 9 not found')
    await expect(deleteTrimOriginal(db, {id: 1, originalPath: source, trimmedPath: path.join(dir, 'nope.mp4')})).rejects.toThrow('Trimmed file not found')
    await expect(deleteTrimOriginal(db, {id: 1, originalPath: '/other/a.mp4', trimmedPath: trimmed})).rejects.toThrow('path mismatch')
    expect(mocks.updateById).not.toHaveBeenCalled()
    expect(fs.existsSync(source)).toBe(true)
  })

  it('keeps the card unchanged when the original cannot be deleted', async () => {
    mocks.unlink.mockResolvedValue(false)
    await expect(deleteTrimOriginal(db, {id: 1, originalPath: source, trimmedPath: trimmed})).rejects.toThrow('Original file could not be deleted')
    expect(mocks.updateById).not.toHaveBeenCalled()
    expect(mocks.invalidate).not.toHaveBeenCalled()
  })
})
