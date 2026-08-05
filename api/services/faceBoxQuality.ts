import type {FaceBox} from '../types/faceDetector'
import {qualityGatesForScore} from './faceDetectorMath'

/** Minimal image surface used by box quality heuristics (Jimp-compatible). */
export type FaceQualityImage = {
  width: number
  height: number
  getPixelColor(x: number, y: number): number
  bitmap: {data: Uint8Array | Buffer}
}

/** Rough Laplacian variance on the face crop — higher means sharper. */
export function estimateBlurVariance(image: FaceQualityImage, box: FaceBox): number {
  const left = Math.max(0, Math.floor(box.x))
  const top = Math.max(0, Math.floor(box.y))
  const right = Math.min(image.width, Math.ceil(box.x + box.width))
  const bottom = Math.min(image.height, Math.ceil(box.y + box.height))
  const width = right - left
  const height = bottom - top
  if (width < 8 || height < 8) return 0

  const stepX = Math.max(1, Math.floor(width / 32))
  const stepY = Math.max(1, Math.floor(height / 32))
  const {data} = image.bitmap
  const lumaAt = (x: number, y: number) => {
    const idx = (y * image.width + x) * 4
    return 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]
  }

  const values: number[] = []
  for (let y = top + stepY; y < bottom - stepY; y += stepY) {
    for (let x = left + stepX; x < right - stepX; x += stepX) {
      const c = lumaAt(x, y)
      const lap = (
        lumaAt(x, y - stepY)
        + lumaAt(x - stepX, y)
        + lumaAt(x + stepX, y)
        + lumaAt(x, y + stepY)
        - 4 * c
      )
      values.push(lap)
    }
  }
  if (values.length < 4) return 0
  let mean = 0
  for (const v of values) mean += v
  mean /= values.length
  let varSum = 0
  for (const v of values) {
    const d = v - mean
    varSum += d * d
  }
  return varSum / values.length
}

/** Reject flat skin / body blobs that detectors sometimes score as faces. */
export function isLikelySkinPixel(r: number, g: number, b: number): boolean {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  // Broad RGB skin heuristic — catches body FPs without needing HSV.
  return (
    r > 60
    && g > 30
    && b > 15
    && r >= g
    && r > b
    && (r - g) >= 8
    && (max - min) >= 12
  )
}

export function boxLooksLikeFace(
  image: FaceQualityImage,
  box: FaceBox,
  minScore = 0.5,
): boolean {
  const gates = qualityGatesForScore(minScore)
  const left = Math.max(0, Math.floor(box.x))
  const top = Math.max(0, Math.floor(box.y))
  const right = Math.min(image.width, Math.ceil(box.x + box.width))
  const bottom = Math.min(image.height, Math.ceil(box.y + box.height))
  const width = right - left
  const height = bottom - top
  if (width < 8 || height < 8) return false

  const stepX = Math.max(1, Math.floor(width / 28))
  const stepY = Math.max(1, Math.floor(height / 28))
  const samples: number[] = []
  let skinCount = 0
  let upperDark = 0
  let upperCount = 0
  let lowerCount = 0
  let upperSum = 0
  let lowerSum = 0
  const upperCut = top + height * 0.4
  const midY = top + height * 0.5

  for (let y = top; y < bottom; y += stepY) {
    for (let x = left; x < right; x += stepX) {
      const rgba = image.getPixelColor(x, y) >>> 0
      const r = (rgba >> 24) & 0xff
      const g = (rgba >> 16) & 0xff
      const b = (rgba >> 8) & 0xff
      const luma = 0.299 * r + 0.587 * g + 0.114 * b
      samples.push(luma)
      if (isLikelySkinPixel(r, g, b)) skinCount += 1
      if (y < midY) {
        upperSum += luma
        upperCount += 1
      } else {
        lowerSum += luma
        lowerCount += 1
      }
      if (y < upperCut && luma < 90) upperDark += 1
    }
  }

  const count = samples.length
  if (count < 16) return false

  let sum = 0
  for (const luma of samples) sum += luma
  const mean = sum / count
  let sumSq = 0
  for (const luma of samples) sumSq += (luma - mean) * (luma - mean)
  const std = Math.sqrt(sumSq / count)
  if (std < gates.minLumaStd) return false

  if (!gates.applySkinFilter) return true

  const skinRatio = skinCount / count
  const upperSamples = Math.max(1, Math.ceil(count * 0.4))
  const upperDarkRatio = upperDark / upperSamples

  if (skinRatio >= gates.maxSkinRatio && upperDarkRatio < gates.minUpperDarkRatio * 2) {
    return false
  }
  if (skinRatio >= 0.92) return false
  if (upperDarkRatio < gates.minUpperDarkRatio && skinRatio >= 0.55) return false

  if (upperCount > 0 && lowerCount > 0) {
    const upperMean = upperSum / upperCount
    const lowerMean = lowerSum / lowerCount
    const verticalGap = Math.abs(upperMean - lowerMean)
    if (verticalGap < 5 && std < 24 && skinRatio >= 0.5) return false
  }

  return true
}
