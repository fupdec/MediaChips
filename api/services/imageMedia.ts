import type { JimpImage, ProcessAndSaveImageOptions } from '../types/imageMedia'
import fs from 'fs'
import path from 'path'
import exifr from 'exifr'
import { Jimp } from 'jimp'

const THUMB_HEIGHT = 320
const THUMB_JPEG_QUALITY = 85

async function decodeImageBuffer(buffer: Buffer): Promise<JimpImage> {
  try {
    return await Jimp.read(buffer) as unknown as JimpImage
  } catch (jimpError) {
    try {
      const {default: sharp} = await import('sharp')
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

function getDisplayDimensions(width: number, height: number, orientation: number) {
  if ([5, 6, 7, 8].includes(orientation)) {
    return {width: height, height: width}
  }

  return {width, height}
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

const getImageMetadata = async (pathToFile: string) => {
  try {
    const image = await Jimp.read(pathToFile) as unknown as JimpImage
    const orientation = await readExifOrientation(pathToFile)
    const display = getDisplayDimensions(image.width, image.height, orientation)

    return {
      width: display.width,
      height: display.height,
      orientation,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Image metadata extraction failed for ${pathToFile}:`, message)
    return null
  }
}

const ensureImageThumbDir = (dbPath: string) => {
  const outputDir = path.join(dbPath, 'media/images/thumbs')
  fs.mkdirSync(outputDir, {recursive: true})
  return outputDir
}

const createImageThumb = async (pathToFile: string, id: string | number, dbPath: string) => {
  const outputDir = ensureImageThumbDir(dbPath)
  const outputPath = path.join(outputDir, `${id}.jpg`)
  const orientation = await readExifOrientation(pathToFile)
  const image = await Jimp.read(pathToFile) as unknown as JimpImage

  await applyExifOrientation(image, orientation)

  if (image.height > THUMB_HEIGHT) {
    await image.resize({h: THUMB_HEIGHT})
  }

  await writeJpeg(image, outputPath)
  return outputPath
}

async function processAndSaveImage({buffer, outputPath, sizes}: ProcessAndSaveImageOptions) {
  fs.mkdirSync(path.dirname(outputPath), {recursive: true})
  const image = await decodeImageBuffer(buffer)
  const width = image.width
  const height = image.height
  const aspectRatio = width / height

  if (sizes?.width && sizes?.height) {
    const minWidth = sizes.width
    const minHeight = sizes.height
    const minAspectRatio = minWidth / minHeight

    if (Math.abs(minAspectRatio - aspectRatio) > 0.01) {
      let cropWidth
      let cropHeight
      let x
      let y

      if (minAspectRatio < 1) {
        cropHeight = height
        cropWidth = height * minAspectRatio
        x = Math.max((width - cropWidth) / 2, 0)
        y = 0
      } else {
        cropWidth = width
        cropHeight = width / minAspectRatio
        x = 0
        y = Math.max((height - cropHeight) / 2, 0)
      }

      await image.crop({
        x: Math.floor(x),
        y: Math.floor(y),
        w: Math.floor(cropWidth),
        h: Math.floor(cropHeight),
      })
    }

    if (minWidth < image.width || minHeight < image.height) {
      await image.resize({w: minWidth, h: minHeight})
    }
  }

  await writeJpeg(image, outputPath, THUMB_JPEG_QUALITY)
  return outputPath
}

export {
  getImageMetadata,
  createImageThumb,
  ensureImageThumbDir,
  processAndSaveImage,
  readExifOrientation,
  applyExifOrientation,
  getDisplayDimensions,
}
