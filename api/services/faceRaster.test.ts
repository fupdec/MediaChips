/**
 * @vitest-environment node
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import sharp from 'sharp'
import {afterEach, describe, expect, it} from 'vitest'
import {
  containFaceRaster,
  cropFaceRasterToJpeg,
  readFaceRaster,
  readFaceRasterSize,
  resizeFaceRaster,
} from './faceRaster'

const tmpFiles: string[] = []

afterEach(() => {
  for (const file of tmpFiles.splice(0)) {
    try { fs.unlinkSync(file) } catch { /* ignore */ }
  }
})

async function writeFixture(name: string): Promise<string> {
  const file = path.join(os.tmpdir(), `face-raster-${name}-${Date.now()}.png`)
  tmpFiles.push(file)
  await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 3,
      background: {r: 200, g: 100, b: 50},
    },
  }).png().toFile(file)
  return file
}

describe('faceRaster', () => {
  it('reads RGBA dimensions and pixel colors', async () => {
    const file = await writeFixture('read')
    const image = await readFaceRaster(file)
    expect(image.width).toBe(40)
    expect(image.height).toBe(20)
    expect(image.bitmap.data.length).toBe(40 * 20 * 4)
    const color = image.getPixelColor(0, 0) >>> 0
    expect((color >> 24) & 0xff).toBe(200)
    expect((color >> 16) & 0xff).toBe(100)
    expect((color >> 8) & 0xff).toBe(50)
  })

  it('reads size via metadata', async () => {
    const file = await writeFixture('size')
    await expect(readFaceRasterSize(file)).resolves.toEqual({width: 40, height: 20})
  })

  it('resizes and letterboxes', async () => {
    const file = await writeFixture('resize')
    const image = await readFaceRaster(file)
    const resized = await resizeFaceRaster(image, 10, 5)
    expect(resized.width).toBe(10)
    expect(resized.height).toBe(5)

    const contained = await containFaceRaster(file, 16)
    expect(contained.width).toBe(16)
    expect(contained.height).toBe(16)
  })

  it('crops to jpeg', async () => {
    const file = await writeFixture('crop')
    const image = await readFaceRaster(file)
    const out = path.join(os.tmpdir(), `face-raster-crop-${Date.now()}.jpg`)
    tmpFiles.push(out)
    await cropFaceRasterToJpeg(image, {left: 5, top: 2, width: 10, height: 10}, out, 90)
    const meta = await sharp(out).metadata()
    expect(meta.width).toBe(10)
    expect(meta.height).toBe(10)
  })
})
