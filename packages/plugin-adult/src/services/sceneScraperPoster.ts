import { createImage } from '@/services/fileService'
import {
  getMediaThumbAspectRatio,
  getVideoThumbOutputPath,
  getVideoThumbSaveSizes,
} from '../utils/sceneScraperPoster'

export async function applyScenePosterToVideoThumb({
  url,
  mediaId,
  mediaPath,
  mediaTypeFolder = 'videos',
  mediaWidth,
  mediaHeight,
}: {
  url: string
  mediaId: number
  mediaPath: string
  mediaTypeFolder?: string
  mediaWidth?: number | null
  mediaHeight?: number | null
}): Promise<{ success: boolean; outputPath: string }> {
  const outputPath = getVideoThumbOutputPath(mediaPath, mediaId, mediaTypeFolder)
  const aspectRatio = getMediaThumbAspectRatio(mediaWidth, mediaHeight)
  const sizes = getVideoThumbSaveSizes(aspectRatio)
  const result = await createImage(url, outputPath, sizes)

  return {
    success: result.status === 201,
    outputPath,
  }
}
