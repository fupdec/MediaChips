import fs from 'fs'
import path from 'path'
import {VIDEO_THUMB_HEIGHT} from '../../shared/videoPreview'

/** Common folder sidecar cover names (Kodi / Jellyfin / Windows Explorer style). */
export const FOLDER_THUMB_CANDIDATES = [
  'folder.jpg',
  'folder.jpeg',
  'folder.png',
  'Folder.jpg',
  'Folder.jpeg',
  'Folder.png',
  'cover.jpg',
  'cover.jpeg',
  'cover.png',
  'poster.jpg',
  'poster.jpeg',
  'poster.png',
] as const

const FOLDER_THUMB_JPEG_QUALITY = 85

/**
 * Look for a folder.jpg (or similar) next to a media file.
 * Returns the absolute path of the first existing candidate, or null.
 */
export function findFolderThumbPath(mediaFilePath: string): string | null {
  const dir = path.dirname(mediaFilePath)
  if (!dir || dir === '.' || dir === path.sep) return null

  for (const name of FOLDER_THUMB_CANDIDATES) {
    const candidate = path.join(dir, name)
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate
      }
    } catch {
      // try next
    }
  }
  return null
}

async function getSharp() {
  const {default: sharp} = await import('sharp')
  return sharp
}

/**
 * Copy/resize a folder cover image into a media thumb output path.
 * Returns true when the thumb was written successfully.
 */
export async function writeFolderThumbTo(
  sourceImagePath: string,
  outputPath: string,
  {
    height = VIDEO_THUMB_HEIGHT,
    jpegQuality = FOLDER_THUMB_JPEG_QUALITY,
  }: {height?: number; jpegQuality?: number} = {},
): Promise<boolean> {
  try {
    const sharp = await getSharp()
    const outDir = path.dirname(outputPath)
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, {recursive: true})
    }
    const quality = Math.max(40, Math.min(95, jpegQuality))

    await sharp(sourceImagePath)
      .rotate()
      .resize({height, withoutEnlargement: true})
      .jpeg({quality, mozjpeg: true})
      .toFile(outputPath)
    return true
  } catch (error: unknown) {
    console.error(
      `Folder thumb failed for ${sourceImagePath}:`,
      error instanceof Error ? error.message : String(error),
    )
    return false
  }
}
