/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {createImageThumb, createImageThumbFromBuffer} from './imageMedia'

async function writeTestPng(filePath: string) {
  const {default: sharp} = await import('sharp')
  await sharp({
    create: {
      width: 640,
      height: 480,
      channels: 3,
      background: {r: 40, g: 120, b: 200},
    },
  }).png().toFile(filePath)
}

describe('imageMedia thumbs (sharp-first)', () => {
  let tmpDir = ''
  let dbPath = ''
  let samplePng = ''

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-image-thumb-'))
    dbPath = tmpDir
    samplePng = path.join(tmpDir, 'sample.png')
    await writeTestPng(samplePng)
  })

  afterAll(() => {
    if (tmpDir) fs.rmSync(tmpDir, {recursive: true, force: true})
  })

  it('writes a jpeg thumb from a file path', async () => {
    const out = await createImageThumb(samplePng, 101, dbPath)
    expect(out.endsWith(`${path.sep}101.jpg`) || out.endsWith('/101.jpg')).toBe(true)
    expect(fs.existsSync(out)).toBe(true)
    expect(fs.statSync(out).size).toBeGreaterThan(200)

    const {default: sharp} = await import('sharp')
    const meta = await sharp(out).metadata()
    expect(meta.format).toBe('jpeg')
    expect(meta.height).toBeLessThanOrEqual(320)
  })

  it('writes a jpeg thumb from a buffer', async () => {
    const buffer = fs.readFileSync(samplePng)
    const out = await createImageThumbFromBuffer(buffer, 202, dbPath)
    expect(fs.existsSync(out)).toBe(true)
    expect(fs.statSync(out).size).toBeGreaterThan(200)
  })
})
