/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {
  createImageThumb,
  getImageMetadata,
  isHeicLikePath,
  resizeImageToMaxEdge,
} from './imageMedia'

const SAMPLE_HEIC = '/Users/vit/Downloads/IMG_5340.HEIC'
const hasSampleHeic = fs.existsSync(SAMPLE_HEIC)

describe('isHeicLikePath', () => {
  it('detects heic/heif extensions', () => {
    expect(isHeicLikePath('/a/b.HEIC')).toBe(true)
    expect(isHeicLikePath('x.heif')).toBe(true)
    expect(isHeicLikePath('/a/b.jpg')).toBe(false)
  })
})

describe.runIf(hasSampleHeic && process.platform === 'darwin')('HEIC via sips fallback', () => {
  let tmpDir = ''
  let dbPath = ''

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-heic-thumb-'))
    dbPath = tmpDir
  })

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('reads HEIC metadata', async () => {
    const meta = await getImageMetadata(SAMPLE_HEIC)
    expect(meta).not.toBeNull()
    expect(Number(meta?.width)).toBeGreaterThan(100)
    expect(Number(meta?.height)).toBeGreaterThan(100)
  })

  it('creates a jpeg library thumb from HEIC', async () => {
    const out = await createImageThumb(SAMPLE_HEIC, 4242, dbPath)
    expect(fs.existsSync(out)).toBe(true)
    expect(fs.statSync(out).size).toBeGreaterThan(500)

    const {default: sharp} = await import('sharp')
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.height).toBeLessThanOrEqual(320)
  })

  it('viewer resize always returns jpeg for HEIC', async () => {
    const resized = await resizeImageToMaxEdge(SAMPLE_HEIC, 2048)
    expect(resized).not.toBeNull()
    expect(resized!.buffer.length).toBeGreaterThan(500)
    expect(resized!.width).toBeLessThanOrEqual(2048)
    expect(resized!.height).toBeLessThanOrEqual(2048)

    const {default: sharp} = await import('sharp')
    const meta = await sharp(resized!.buffer).metadata()
    expect(meta.format).toBe('jpeg')
  })
})
