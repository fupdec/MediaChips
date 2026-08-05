import {describe, expect, it} from 'vitest'
import type {FaceBox} from '../types/faceDetector'
import {
  boxLooksLikeFace,
  estimateBlurVariance,
  isLikelySkinPixel,
  type FaceQualityImage,
} from './faceBoxQuality'

function rgba(r: number, g: number, b: number, a = 255): number {
  return ((r & 0xff) << 24) | ((g & 0xff) << 16) | ((b & 0xff) << 8) | (a & 0xff)
}

function makeSolidImage(width: number, height: number, color: number): FaceQualityImage {
  const data = Buffer.alloc(width * height * 4)
  const r = (color >>> 24) & 0xff
  const g = (color >>> 16) & 0xff
  const b = (color >>> 8) & 0xff
  const a = color & 0xff
  for (let i = 0; i < width * height; i++) {
    const o = i * 4
    data[o] = r
    data[o + 1] = g
    data[o + 2] = b
    data[o + 3] = a
  }
  return {
    width,
    height,
    bitmap: {data},
    getPixelColor(x, y) {
      const o = (y * width + x) * 4
      return rgba(data[o], data[o + 1], data[o + 2], data[o + 3])
    },
  }
}

function makeCheckerImage(width: number, height: number): FaceQualityImage {
  const data = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4
      const on = ((x >> 2) + (y >> 2)) % 2 === 0
      const v = on ? 220 : 40
      data[o] = v
      data[o + 1] = v
      data[o + 2] = v
      data[o + 3] = 255
    }
  }
  return {
    width,
    height,
    bitmap: {data},
    getPixelColor(x, y) {
      const o = (y * width + x) * 4
      return rgba(data[o], data[o + 1], data[o + 2], data[o + 3])
    },
  }
}

describe('isLikelySkinPixel', () => {
  it('accepts typical warm skin tones', () => {
    expect(isLikelySkinPixel(180, 120, 90)).toBe(true)
    expect(isLikelySkinPixel(210, 160, 130)).toBe(true)
  })

  it('rejects blue/green or flat gray pixels', () => {
    expect(isLikelySkinPixel(40, 120, 200)).toBe(false)
    expect(isLikelySkinPixel(120, 120, 120)).toBe(false)
    expect(isLikelySkinPixel(20, 20, 20)).toBe(false)
  })
})

describe('estimateBlurVariance', () => {
  const box: FaceBox = {x: 4, y: 4, width: 40, height: 40}

  it('returns 0 for tiny boxes', () => {
    const image = makeSolidImage(20, 20, rgba(180, 120, 90))
    expect(estimateBlurVariance(image, {x: 0, y: 0, width: 4, height: 4})).toBe(0)
  })

  it('scores patterned crops sharper than flat skin', () => {
    const flat = makeSolidImage(64, 64, rgba(180, 120, 90))
    const sharp = makeCheckerImage(64, 64)
    expect(estimateBlurVariance(sharp, box)).toBeGreaterThan(estimateBlurVariance(flat, box))
  })
})

describe('boxLooksLikeFace', () => {
  const box: FaceBox = {x: 2, y: 2, width: 48, height: 48}

  it('rejects tiny boxes', () => {
    const image = makeCheckerImage(32, 32)
    expect(boxLooksLikeFace(image, {x: 0, y: 0, width: 4, height: 4}, 0.5)).toBe(false)
  })

  it('rejects low-contrast flat skin when skin filter is active', () => {
    const image = makeSolidImage(64, 64, rgba(190, 140, 110))
    expect(boxLooksLikeFace(image, box, 0.75)).toBe(false)
  })

  it('accepts high-contrast patterned crops at loose thresholds', () => {
    const image = makeCheckerImage(64, 64)
    expect(boxLooksLikeFace(image, box, 0.5)).toBe(true)
  })
})
