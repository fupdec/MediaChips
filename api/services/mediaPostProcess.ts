import type {
  MediaId,
  MediaPostProcessorDeps,
  MediaTypeLike,
  ImageMetadataResult,
} from '../types/mediaPostProcess'
import {
  isVideoMediaType,
  isImageMediaType,
  isAudioMediaType,
} from '../utils/mediaType'
import { createVideoMetadataRepository } from '../db/repositories/videoMetadata'
import { createImageMetadataRepository } from '../db/repositories/imageMetadata'

function createMediaPostProcessor({
  db,
  dbPath,
  getVideoMetadata,
  getAudioMetadata,
  getImageMedia,
  createThumbMiddle,
  withTimeout,
}: MediaPostProcessorDeps) {
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const imageMetadataRepo = createImageMetadataRepository(db.drizzle)

  async function processVideoMedia(media: {id?: unknown; path?: unknown}) {
    const videoPath = String(media.path || '')
    const metadata = await getVideoMetadata(videoPath)

    if (metadata) {
      videoMetadataRepo.create({
        mediaId: Number(media.id),
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        fps: metadata.fps,
      })
    }

    try {
      await createThumbMiddle(videoPath, media.id)
    } catch (error: unknown) {
      console.error(`Thumbnail generation failed for ${videoPath}:`, error)
    }
  }

  async function processImageMedia(media: {id?: unknown; path?: unknown}) {
    const imagePath = String(media.path || '')
    const metadata = await withTimeout(
      getImageMedia().getImageMetadata(imagePath),
      60000,
      'image metadata',
    ).catch((error: unknown) => {
      console.error(`Image metadata extraction failed for ${imagePath}:`, error instanceof Error ? error.message : String(error))
      return null
    }) as ImageMetadataResult | null

    if (metadata) {
      imageMetadataRepo.create({
        mediaId: Number(media.id),
        width: metadata.width,
        height: metadata.height,
        orientation: metadata.orientation,
      })
    }

    try {
      await withTimeout(
        getImageMedia().createImageThumb(imagePath, media.id, dbPath),
        120000,
        'image thumbnail',
      )
    } catch (error: unknown) {
      console.error(`Thumbnail generation failed for ${imagePath}:`, error instanceof Error ? error.message : String(error))
    }
  }

  async function processAudioMedia(media: {id?: unknown; path?: unknown}) {
    const audioPath = String(media.path || '')
    const metadata = await getAudioMetadata(audioPath)

    if (metadata) {
      videoMetadataRepo.create({
        mediaId: Number(media.id),
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
      })
    }
  }

  async function processNewMedia(media: {id?: unknown; path?: unknown}, mediaType: MediaTypeLike) {
    if (isVideoMediaType(mediaType)) {
      await processVideoMedia(media)
      return
    }

    if (isImageMediaType(mediaType)) {
      await processImageMedia(media)
      return
    }

    if (isAudioMediaType(mediaType)) {
      await processAudioMedia(media)
    }
  }

  async function refreshVideoMedia(mediaId: MediaId, mediaPath: string) {
    const metadata = await getVideoMetadata(mediaPath)

    if (metadata) {
      videoMetadataRepo.updateByMediaId(Number(mediaId), {
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        width: metadata.width,
        height: metadata.height,
        codec: metadata.codec,
        fps: metadata.fps,
      })
    }
  }

  async function refreshImageMedia(mediaId: MediaId, mediaPath: string) {
    const metadata = await getImageMedia().getImageMetadata(mediaPath)

    if (metadata) {
      imageMetadataRepo.upsert({
        mediaId: Number(mediaId),
        width: metadata.width,
        height: metadata.height,
        orientation: metadata.orientation,
      })
    }

    try {
      await getImageMedia().createImageThumb(mediaPath, mediaId, dbPath)
    } catch (error: unknown) {
      console.error(`Thumbnail regeneration failed for media ${mediaId}:`, error instanceof Error ? error.message : String(error))
    }
  }

  async function refreshAudioMedia(mediaId: MediaId, mediaPath: string) {
    const metadata = await getAudioMetadata(mediaPath)

    if (metadata) {
      videoMetadataRepo.upsert({
        mediaId: Number(mediaId),
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
      })
    }
  }

  async function refreshMediaInfo(media: {id?: unknown; path?: unknown; dataValues?: {path?: string}}, mediaType: MediaTypeLike) {
    const mediaPath = String(media.dataValues?.path ?? media.path ?? '')
    const mediaId = media.id as MediaId

    if (isVideoMediaType(mediaType)) {
      await refreshVideoMedia(mediaId, mediaPath)
      return
    }

    if (isImageMediaType(mediaType)) {
      await refreshImageMedia(mediaId, mediaPath)
      return
    }

    if (isAudioMediaType(mediaType)) {
      await refreshAudioMedia(mediaId, mediaPath)
    }
  }

  return {
    processNewMedia,
    refreshMediaInfo,
  }
}

export { createMediaPostProcessor }
