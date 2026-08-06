import type { JimpImage, ProcessAndSaveImageOptions } from '../types/imageMedia'
import fs from 'fs'
import path from 'path'
import exifr from 'exifr'
import { Jimp } from 'jimp'
import {getCenterCropRect, getDisplayDimensions} from './imageGeometry'

const THUMB_HEIGHT = 320
const THUMB_JPEG_QUALITY = 85

async function getSharp() {
  const {default: sharp} = await import('sharp')
  return sharp
}

async function writeThumbWithSharp(input: string | Buffer, outputPath: string): Promise<void> {
  const sharp = await getSharp()
  await sharp(input)
    .rotate()
    .resize({height: THUMB_HEIGHT, withoutEnlargement: true})
    .jpeg({quality: THUMB_JPEG_QUALITY, mozjpeg: true})
    .toFile(outputPath)
}

async function decodeImageBuffer(buffer: Buffer): Promise<JimpImage> {
  try {
    return await Jimp.read(buffer) as unknown as JimpImage
  } catch (jimpError) {
    try {
      const sharp = await getSharp()
      const pngBuffer = await sharp(buffer).png().toBuffer()
      return await Jimp.read(pngBuffer) as unknown as JimpImage
    } catch (sharpError) {
      const jimpMessage = jimpError instanceof Error ? jimpError.message : String(jimpError)
      const sharpMessage = sharpError instanceof Error ? sharpError.message : String(sharpError)
      const error = new Error(`Unable to decode image: ${jimpMessage}; sharp fallback failed: ${sharpMessage}`)
      ;(error as Error & {cause?: unknown}).cause = sharpError
      throw error
    }
  }
}

async function writeJpeg(image: JimpImage, outputPath: string, quality = THUMB_JPEG_QUALITY) {
  const buffer = await image.getBuffer('image/jpeg', {quality})
  await fs.promises.writeFile(outputPath, buffer)
}

async function readExifOrientation(pathToFile: string): Promise<number> {
  try {
    const orientation = await exifr.orientation(pathToFile)
    if (typeof orientation === 'number' && Number.isInteger(orientation) && orientation >= 1 && orientation <= 8) {
      return orientation
    }
  } catch {
    // EXIF is optional; fall back to the default orientation.
  }

  return 1
}

async function applyExifOrientation(image: JimpImage, orientation: number) {
  switch (orientation) {
    case 2:
      await image.flip({horizontal: true, vertical: false})
      break
    case 3:
      await image.rotate(180)
      break
    case 4:
      await image.flip({horizontal: false, vertical: true})
      break
    case 5:
      await image.flip({horizontal: true, vertical: false})
      await image.rotate(90)
      break
    case 6:
      await image.rotate(90)
      break
    case 7:
      await image.flip({horizontal: true, vertical: false})
      await image.rotate(270)
      break
    case 8:
      await image.rotate(270)
      break
    default:
      break
  }

  return image
}

async function readExifOrientationFromBuffer(buffer: Buffer): Promise<number> {
  try {
    const orientation = await exifr.orientation(buffer)
    if (typeof orientation === 'number' && Number.isInteger(orientation) && orientation >= 1 && orientation <= 8) {
      return orientation
    }
  } catch {
    // EXIF is optional; fall back to the default orientation.
  }

  return 1
}

async function readMetadataWithSharp(input: string | Buffer) {
  const sharp = await getSharp()
  const meta = await sharp(input).metadata()
  const width = Number(meta.width) || 0
  const height = Number(meta.height) || 0
  if (width <= 0 || height <= 0) {
    throw new Error('Image metadata missing dimensions')
  }

  const orientation = Number(meta.orientation)
  const resolvedOrientation = (
    Number.isInteger(orientation) && orientation >= 1 && orientation <= 8
  )
    ? orientation
    : (typeof input === 'string'
      ? await readExifOrientation(input)
      : await readExifOrientationFromBuffer(input))

  const display = getDisplayDimensions(width, height, resolvedOrientation)
  return {
    width: display.width,
    height: display.height,
    orientation: resolvedOrientation,
  }
}

async function processAndSaveImageWithSharp({
  buffer,
  outputPath,
  sizes,
}: ProcessAndSaveImageOptions) {
  const sharp = await getSharp()
  // Auto-orient first so crop/resize use display pixels.
  const orientedBuffer = await sharp(buffer).rotate().toBuffer()
  const meta = await sharp(orientedBuffer).metadata()
  let width = Number(meta.width) || 0
  let height = Number(meta.height) || 0
  if (width <= 0 || height <= 0) {
    throw new Error('Oriented image missing dimensions')
  }

  let pipeline = sharp(orientedBuffer)

  if (sizes?.width && sizes?.height) {
    const targetWidth = sizes.width
    const targetHeight = sizes.height
    const aspectRatio = width / height
    const targetAspectRatio = targetWidth / targetHeight

    if (Math.abs(targetAspectRatio - aspectRatio) > 0.01) {
      const crop = getCenterCropRect(width, height, targetAspectRatio)
      pipeline = pipeline.extract({
        left: crop.x,
        top: crop.y,
        width: crop.w,
        height: crop.h,
      })
      width = crop.w
      height = crop.h
    }

    if (targetWidth < width || targetHeight < height) {
      pipeline = pipeline.resize(targetWidth, targetHeight, {fit: 'fill'})
    }
  }

  await pipeline
    .jpeg({quality: THUMB_JPEG_QUALITY, mozjpeg: true})
    .toFile(outputPath)
  return outputPath
}

async function processAndSaveImageWithJimp({buffer, outputPath, sizes}: ProcessAndSaveImageOptions) {
  const image = await decodeImageBuffer(buffer)
  const width = image.width
  const height = image.height
  const aspectRatio = width / height

  if (sizes?.width && sizes?.height) {
    const targetWidth = sizes.width
    const targetHeight = sizes.height
    const targetAspectRatio = targetWidth / targetHeight

    if (Math.abs(targetAspectRatio - aspectRatio) > 0.01) {
      const crop = getCenterCropRect(width, height, targetAspectRatio)
      await image.crop(crop)
    }

    if (targetWidth < image.width || targetHeight < image.height) {
      await image.resize({w: targetWidth, h: targetHeight})
    }
  }

  await writeJpeg(image, outputPath, THUMB_JPEG_QUALITY)
  return outputPath
}

const getImageMetadataFromBuffer = async (buffer: Buffer) => {
  try {
    return await readMetadataWithSharp(buffer)
  } catch (error: unknown) {
    try {
      const image = await decodeImageBuffer(buffer)
      const orientation = await readExifOrientationFromBuffer(buffer)
      const display = getDisplayDimensions(image.width, image.height, orientation)
      return {
        width: display.width,
        height: display.height,
        orientation,
      }
    } catch (fallbackError: unknown) {
      const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      console.error('Image metadata extraction failed for buffer:', message)
      return null
    }
  }
}

const getImageMetadata = async (pathToFile: string) => {
  try {
    const { isVirtualZipPath, readZipEntryBuffer } = await import('./zipGallery')
    if (isVirtualZipPath(pathToFile)) {
      const entry = await readZipEntryBuffer(pathToFile)
      if (!entry) return null
      return getImageMetadataFromBuffer(entry.buffer)
    }

    return await readMetadataWithSharp(pathToFile)
  } catch (error: unknown) {
    try {
      const image = await Jimp.read(pathToFile) as unknown as JimpImage
      const orientation = await readExifOrientation(pathToFile)
      const display = getDisplayDimensions(image.width, image.height, orientation)
      return {
        width: display.width,
        height: display.height,
        orientation,
      }
    } catch (fallbackError: unknown) {
      const message = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      console.error(`Image metadata extraction failed for ${pathToFile}:`, message)
      return null
    }
  }
}

const ensureImageThumbDir = (dbPath: string) => {
  const outputDir = path.join(dbPath, 'media/images/thumbs')
  fs.mkdirSync(outputDir, {recursive: true})
  return outputDir
}

const createImageThumbFromBufferWithJimp = async (
  buffer: Buffer,
  outputPath: string,
) => {
  const orientation = await readExifOrientationFromBuffer(buffer)
  const image = await decodeImageBuffer(buffer)

  await applyExifOrientation(image, orientation)

  if (image.height > THUMB_HEIGHT) {
    await image.resize({h: THUMB_HEIGHT})
  }

  await writeJpeg(image, outputPath)
  return outputPath
}

const createImageThumbFromBuffer = async (buffer: Buffer, id: string | number, dbPath: string) => {
  const outputDir = ensureImageThumbDir(dbPath)
  const outputPath = path.join(outputDir, `${id}.jpg`)

  try {
    await writeThumbWithSharp(buffer, outputPath)
    return outputPath
  } catch {
    return createImageThumbFromBufferWithJimp(buffer, outputPath)
  }
}

const createImageThumb = async (pathToFile: string, id: string | number, dbPath: string) => {
  const { isVirtualZipPath, readZipEntryBuffer } = await import('./zipGallery')
  if (isVirtualZipPath(pathToFile)) {
    const entry = await readZipEntryBuffer(pathToFile)
    if (!entry) {
      throw new Error(`ZIP entry not found: ${pathToFile}`)
    }
    return createImageThumbFromBuffer(entry.buffer, id, dbPath)
  }

  const outputDir = ensureImageThumbDir(dbPath)
  const outputPath = path.join(outputDir, `${id}.jpg`)

  try {
    await writeThumbWithSharp(pathToFile, outputPath)
    return outputPath
  } catch {
    const orientation = await readExifOrientation(pathToFile)
    const image = await Jimp.read(pathToFile) as unknown as JimpImage

    await applyExifOrientation(image, orientation)

    if (image.height > THUMB_HEIGHT) {
      await image.resize({h: THUMB_HEIGHT})
    }

    await writeJpeg(image, outputPath)
    return outputPath
  }
}

async function processAndSaveImage(options: ProcessAndSaveImageOptions) {
  fs.mkdirSync(path.dirname(options.outputPath), {recursive: true})
  try {
    return await processAndSaveImageWithSharp(options)
  } catch {
    return processAndSaveImageWithJimp(options)
  }
}

export {
  getImageMetadata,
  getImageMetadataFromBuffer,
  createImageThumb,
  createImageThumbFromBuffer,
  ensureImageThumbDir,
  getCenterCropRect,
  processAndSaveImage,
  readExifOrientation,
  applyExifOrientation,
  getDisplayDimensions,
}
