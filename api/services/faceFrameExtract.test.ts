import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterEach, describe, expect, it} from 'vitest'
import {cleanupDir} from './faceCropStore'
import {
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
  it('returns empty frames when the media path is missing', async () => {
    const result = await extractFramesForMedia({id: 1, path: '/no/such/video.mp4'})
    tmpRoots.push(result.tmpDir)
    expect(result.frames).toEqual([])
    expect(fs.existsSync(result.tmpDir)).toBe(true)
  })
})
