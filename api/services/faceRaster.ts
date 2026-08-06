/**
 * Sharp-backed RGBA rasters for the face pipeline.
 * Matches the {width, height, bitmap.data, getPixelColor} surface Jimp used.
 */

import type {AlignSampleImage} from './faceAlignMath'
import type {FaceQualityImage} from './faceBoxQuality'

export type FaceRasterImage = AlignSampleImage & FaceQualityImage

function jimpStylePixelColor(
  data: Buffer | Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const ix = Math.max(0, Math.min(width - 1, Math.floor(x)))
  const iy = Math.max(0, Math.min(height - 1, Math.floor(y)))
  const idx = (iy * width + ix) * 4
  const r = data[idx] ?? 0
  const g = data[idx + 1] ?? 0
  const b = data[idx + 2] ?? 0
  const a = data[idx + 3] ?? 255
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0
}

function wrapRaster(
  data: Buffer,
  width: number,
  height: number,
): FaceRasterImage {
  return {
    width,
    height,
    bitmap: {data},
    getPixelColor(x: number, y: number) {
      return jimpStylePixelColor(data, width, height, x, y)
    },
  }
}

async function getSharp() {
  const {default: sharp} = await import('sharp')
  return sharp
}

/** Decode image file to RGBA (auto-orients via sharp). */
export async function readFaceRaster(imagePath: string): Promise<FaceRasterImage> {
  const sharp = await getSharp()
  const {data, info} = await sharp(imagePath)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true})
  return wrapRaster(data, info.width, info.height)
}

/** Fast width/height without full pixel decode when possible. */
export async function readFaceRasterSize(
  imagePath: string,
): Promise<{width: number; height: number}> {
  const sharp = await getSharp()
  const meta = await sharp(imagePath).rotate().metadata()
  const width = Number(meta.width) || 0
  const height = Number(meta.height) || 0
  if (width > 0 && height > 0) return {width, height}
  const raster = await readFaceRaster(imagePath)
  return {width: raster.width, height: raster.height}
}

export async function resizeFaceRaster(
  image: FaceRasterImage,
  width: number,
  height: number,
): Promise<FaceRasterImage> {
  const sharp = await getSharp()
  const {data, info} = await sharp(Buffer.from(image.bitmap.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .resize(width, height, {fit: 'fill'})
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true})
  return wrapRaster(data, info.width, info.height)
}

/** Letterbox into a square (black pad) — parity with Jimp.contain for embed fallback. */
export async function containFaceRaster(
  imagePath: string,
  size: number,
): Promise<FaceRasterImage> {
  const sharp = await getSharp()
  const {data, info} = await sharp(imagePath)
    .rotate()
    .resize(size, size, {
      fit: 'contain',
      background: {r: 0, g: 0, b: 0, alpha: 1},
    })
    .ensureAlpha()
    .raw()
    .toBuffer({resolveWithObject: true})
  return wrapRaster(data, info.width, info.height)
}

export async function writeFaceRasterJpeg(
  image: FaceRasterImage,
  outputPath: string,
  quality = 90,
): Promise<void> {
  const sharp = await getSharp()
  await sharp(Buffer.from(image.bitmap.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .jpeg({quality, mozjpeg: true})
    .toFile(outputPath)
}

export async function cropFaceRasterToJpeg(
  image: FaceRasterImage,
  rect: {left: number; top: number; width: number; height: number},
  outputPath: string,
  quality = 90,
): Promise<void> {
  const sharp = await getSharp()
  await sharp(Buffer.from(image.bitmap.data), {
    raw: {
      width: image.width,
      height: image.height,
      channels: 4,
    },
  })
    .extract({
      left: Math.max(0, Math.floor(rect.left)),
      top: Math.max(0, Math.floor(rect.top)),
      width: Math.max(1, Math.floor(rect.width)),
      height: Math.max(1, Math.floor(rect.height)),
    })
    .jpeg({quality, mozjpeg: true})
    .toFile(outputPath)
}

export async function containPathToJpeg(
  imagePath: string,
  size: number,
  outputPath: string,
  quality = 90,
): Promise<void> {
  const sharp = await getSharp()
  await sharp(imagePath)
    .rotate()
    .resize(size, size, {
      fit: 'contain',
      background: {r: 0, g: 0, b: 0, alpha: 1},
    })
    .jpeg({quality, mozjpeg: true})
    .toFile(outputPath)
}
