import path from 'path-browserify'
import {
  VIDEO_GRID_REFERENCE_ASPECT_RATIO,
  VIDEO_THUMB_HEIGHT,
} from '@shared/videoPreview'
import type { SceneScraperImage } from '../types/sceneScraper'

export function getSceneImagePixelArea(image: SceneScraperImage): number {
  const width = Number(image.width) || 0
  const height = Number(image.height) || 0
  return width > 0 && height > 0 ? width * height : 0
}

export function pickBestSceneImage(images: SceneScraperImage[] = []): SceneScraperImage | null {
  const withUrl = images.filter((image) => String(image.url ?? '').trim())
  if (!withUrl.length) return null

  return withUrl.reduce((best, current) => {
    const bestArea = getSceneImagePixelArea(best)
    const currentArea = getSceneImagePixelArea(current)
    if (currentArea > bestArea) return current
    if (currentArea < bestArea) return best
    return current
  })
}

export function getVideoThumbSaveSizes(aspectRatio = VIDEO_GRID_REFERENCE_ASPECT_RATIO) {
  const height = VIDEO_THUMB_HEIGHT
  const width = Math.max(1, Math.round(height * aspectRatio))
  return { width, height }
}

export function getVideoThumbOutputPath(
  mediaPath: string,
  mediaId: number,
  mediaTypeFolder = 'videos',
) {
  return path.join(mediaPath, mediaTypeFolder, 'thumbs', `${mediaId}.jpg`)
}

export function getMediaThumbAspectRatio(
  width?: number | null,
  height?: number | null,
  fallback = VIDEO_GRID_REFERENCE_ASPECT_RATIO,
): number {
  const normalizedWidth = Number(width) || 0
  const normalizedHeight = Number(height) || 0
  if (normalizedWidth <= 0 || normalizedHeight <= 0) return fallback
  return normalizedWidth / normalizedHeight
}
