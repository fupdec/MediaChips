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
  isTextMediaType,
} from '../utils/mediaType'
import { createVideoMetadataRepository } from '../db/repositories/videoMetadata'
import { createImageMetadataRepository } from '../db/repositories/imageMetadata'
import { createTextContentRepository } from '../db/repositories/textContent'
import { createMediaRepository } from '../db/repositories/media'
import { extractTextIndexFromPath } from './textContentIndex'
import {
  resolveMediaCreatedAt,
  type MediaCreatedKind,
} from './mediaSystemDates'

function createMediaPostProcessor({
  db,
  dbPath,
  getVideoMetadata,
  getAudioMetadata,
  getImageMedia,
  createThumbMiddle,
  createAudioThumb,
  withTimeout,
}: MediaPostProcessorDeps) {
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const imageMetadataRepo = createImageMetadataRepository(db.drizzle)
  const textContentRepo = createTextContentRepository(db.drizzle)
  const mediaRepo = createMediaRepository(db.drizzle)

  async function applyMediaCreatedAt(
    mediaId: unknown,
    mediaPath: string,
    kind: MediaCreatedKind,
  ) {
    if (mediaId == null || !mediaPath) return
    try {
      const mediaCreatedAt = await resolveMediaCreatedAt(mediaPath, kind)
      if (!mediaCreatedAt) return
      mediaRepo.updateById(Number(mediaId), {mediaCreatedAt})
    } catch (error: unknown) {
      console.error(
        `Media created date extraction failed for ${mediaPath}:`,
        error instanceof Error ? error.message : String(error),
      )
    }
  }

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

    await applyMediaCreatedAt(media.id, videoPath, 'video')

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

    await applyMediaCreatedAt(media.id, imagePath, 'image')

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

  async function processAudioMedia(media: {id?: unknown; path?: unknown; name?: unknown; basename?: unknown}) {
    const audioPath = String(media.path || '')
    const metadata = await getAudioMetadata(audioPath)

    if (metadata) {
      videoMetadataRepo.create({
        mediaId: Number(media.id),
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
        title: metadata.title || null,
        artist: metadata.artist || null,
        album: metadata.album || null,
      })

      const title = String(metadata.title || '').trim()
      if (title && media.id != null) {
        const currentName = String(media.name || '').trim()
        const stem = String(media.basename || '').replace(/\.[^.]+$/, '').trim()
        // Only replace filename-like titles so user renames stay intact.
        if (!currentName || currentName === stem) {
          try {
            mediaRepo.updateById(Number(media.id), {name: title})
          } catch {
            // Name update is best-effort.
          }
        }
      }
    }

    await applyMediaCreatedAt(media.id, audioPath, 'audio')

    if (createAudioThumb) {
      try {
        await createAudioThumb(audioPath, media.id)
      } catch (error: unknown) {
        console.error(`Audio cover extraction failed for ${audioPath}:`, error)
      }
    }
  }

  async function processTextMedia(media: {id?: unknown; path?: unknown}) {
    const textPath = String(media.path || '')
    const indexed = extractTextIndexFromPath(textPath)
    if (!indexed || media.id == null) return

    try {
      textContentRepo.upsert({
        mediaId: Number(media.id),
        content: indexed.content,
        excerpt: indexed.excerpt,
        truncated: indexed.truncated ? 1 : 0,
      })
    } catch (error: unknown) {
      console.error(`Text content indexing failed for ${textPath}:`, error)
    }

    await applyMediaCreatedAt(media.id, textPath, 'other')
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
      return
    }

    if (isTextMediaType(mediaType)) {
      await processTextMedia(media)
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

    await applyMediaCreatedAt(mediaId, mediaPath, 'video')
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

    await applyMediaCreatedAt(mediaId, mediaPath, 'image')

    try {
      await getImageMedia().createImageThumb(mediaPath, mediaId, dbPath)
    } catch (error: unknown) {
      console.error(`Thumbnail regeneration failed for media ${mediaId}:`, error instanceof Error ? error.message : String(error))
    }
  }

  /**
   * Persist width/height/orientation only — no thumb regen.
   * Used to backfill gaps so virtual masonry can trust item dimensions.
   */
  async function ensureImageDimensions(
    media: {id?: unknown; path?: unknown},
  ): Promise<{width: number; height: number; orientation: number} | null> {
    const mediaId = Number(media.id)
    const mediaPath = String(media.path || '')
    if (!mediaId || !mediaPath) return null

    const existing = imageMetadataRepo.findByMediaId(mediaId)
    const existingW = Number(existing?.width) || 0
    const existingH = Number(existing?.height) || 0
    if (existingW > 0 && existingH > 0) {
      return {
        width: existingW,
        height: existingH,
        orientation: Number(existing?.orientation) || 1,
      }
    }

    const metadata = await withTimeout(
      getImageMedia().getImageMetadata(mediaPath),
      60000,
      'image metadata',
    ).catch((error: unknown) => {
      console.error(
        `Image dimension ensure failed for ${mediaPath}:`,
        error instanceof Error ? error.message : String(error),
      )
      return null
    }) as ImageMetadataResult | null

    const width = Number(metadata?.width) || 0
    const height = Number(metadata?.height) || 0
    if (width <= 0 || height <= 0) return null

    const orientation = Number(metadata?.orientation) || 1
    imageMetadataRepo.upsert({
      mediaId,
      width,
      height,
      orientation,
    })

    return {width, height, orientation}
  }

  async function refreshAudioMedia(mediaId: MediaId, mediaPath: string) {
    const metadata = await getAudioMetadata(mediaPath)

    if (metadata) {
      videoMetadataRepo.upsert({
        mediaId: Number(mediaId),
        duration: metadata.duration,
        bitrate: metadata.bitrate,
        codec: metadata.codec,
        title: metadata.title || null,
        artist: metadata.artist || null,
        album: metadata.album || null,
      })
    }

    await applyMediaCreatedAt(mediaId, mediaPath, 'audio')

    if (createAudioThumb) {
      try {
        await createAudioThumb(mediaPath, mediaId)
      } catch (error: unknown) {
        console.error(`Audio cover regeneration failed for media ${mediaId}:`, error)
      }
    }
  }

  async function refreshTextMedia(mediaId: MediaId, mediaPath: string) {
    const indexed = extractTextIndexFromPath(mediaPath)
    if (!indexed) return

    try {
      textContentRepo.upsert({
        mediaId: Number(mediaId),
        content: indexed.content,
        excerpt: indexed.excerpt,
        truncated: indexed.truncated ? 1 : 0,
      })
    } catch (error: unknown) {
      console.error(`Text content reindex failed for media ${mediaId}:`, error)
    }

    await applyMediaCreatedAt(mediaId, mediaPath, 'other')
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
      return
    }

    if (isTextMediaType(mediaType)) {
      await refreshTextMedia(mediaId, mediaPath)
    }
  }

  return {
    processNewMedia,
    refreshMediaInfo,
    ensureImageDimensions,
  }
}

export { createMediaPostProcessor }
