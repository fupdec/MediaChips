import type { ApiDb } from '../types/db'
import type {
  VideoImageGenerationOptions,
  VideoImageGenerationProgressEvent,
  VideoImageGenerationResult,
  VideoImageItem,
  VideoImagesGenerationStatus,
  VideoImageType,
} from '../types/videoImagesGeneration'
import fs from 'fs'
import { readdir } from 'fs/promises'
import path from 'path'
import {
  extractVideoFrame,
  extractVideoThumbnail,
} from '../utils/ffmpeg'
import { resolveExistingPath } from './contentHash'
import { upsertVisualHashForMedia } from './visualHashBackfill'
import { upsertClipEmbeddingForMedia } from './mediaClipEmbeddings'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createMarksRepository } from '../db/repositories/marks'
import { formatMarkTimestamp } from '../../shared/markTimestamp'
import {
  VIDEO_GRID_SPRITE,
  VIDEO_MARK_HEIGHT,
  VIDEO_MARK_JPEG_QUALITY,
  VIDEO_THUMB_HEIGHT,
  VIDEO_THUMB_JPEG_QUALITY,
} from '../../shared/videoPreview'
import {
  buildVideoImageStatus,
  collectJpgStemIds,
  parsePositiveStemIds,
} from './videoImagesStatus'
import { generateVideoGrid } from './videoGrid'

async function getVideoMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  return videoType?.id || null
}

const IMAGE_TYPES: VideoImageType[] = ['preview', 'grid', 'marks']

const withTimeout = <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => Promise.race([
  promise,
  new Promise<T>((_, reject) => {
    setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
  }),
])

const getPreviewPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/thumbs', `${id}.jpg`)
const getGridPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/grids', `${id}.jpg`)
const getMarkPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/videos/marks', `${id}.jpg`)

const ensureDir = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {recursive: true})
  }
}

function hasGeneratedImage(dbPath: string, imageType: VideoImageType, item: VideoImageItem) {
  switch (imageType) {
    case 'preview':
      return fs.existsSync(getPreviewPath(dbPath, item.id))
    case 'grid':
      return fs.existsSync(getGridPath(dbPath, item.id))
    case 'marks':
      return fs.existsSync(getMarkPath(dbPath, item.id))
    default:
      return false
  }
}

function createPreviewImage(pathToFile: string, id: unknown, dbPath: string) {
  const thumbsDir = path.join(dbPath, 'media/videos/thumbs')
  ensureDir(thumbsDir)
  const outputPath = getPreviewPath(dbPath, id)
  return withTimeout(
    extractVideoThumbnail({
      input: pathToFile,
      outputPath,
      height: VIDEO_THUMB_HEIGHT,
      jpegQuality: VIDEO_THUMB_JPEG_QUALITY,
    }),
    120000,
    'ffmpeg thumbnail',
  )
}

function createMarkImage(timestamp: string, inputPath: string, outputPath: string) {
  return extractVideoFrame({
    input: inputPath,
    output: outputPath,
    timestamp,
    vf: `scale=-1:${VIDEO_MARK_HEIGHT}`,
    jpegQuality: VIDEO_MARK_JPEG_QUALITY,
  })
}

async function generateVideoImage(
  dbPath: string,
  imageType: VideoImageType,
  item: VideoImageItem,
  {force = false}: { force?: boolean } = {},
): Promise<VideoImageGenerationResult> {
  if (!force && hasGeneratedImage(dbPath, imageType, item)) {
    return {status: 'skipped', id: item.id, path: item.path || item.media?.path}
  }

  const videoPath = imageType === 'marks'
    ? (item.media?.path || item.Media?.path)
    : item.path

  if (!videoPath) {
    return {status: 'missing', id: item.id, path: videoPath}
  }

  const resolvedPath = await resolveExistingPath(videoPath)
  if (!resolvedPath) {
    return {status: 'missing', id: item.id, path: videoPath}
  }

  try {
    switch (imageType) {
      case 'preview':
        await createPreviewImage(resolvedPath, item.id, dbPath)
        break
      case 'grid': {
        const gridPath = getGridPath(dbPath, item.id)
        if (force && fs.existsSync(gridPath)) fs.unlinkSync(gridPath)
        const gridResult = await generateVideoGrid({
          input: resolvedPath,
          output: `${item.id}.jpg`,
          width: VIDEO_GRID_SPRITE.tileWidth,
          cols: VIDEO_GRID_SPRITE.cols,
          rows: VIDEO_GRID_SPRITE.rows,
        }, dbPath)
        if (!gridResult) {
          return {
            status: 'failed',
            id: item.id,
            path: videoPath,
            message: 'Unable to probe video duration',
          }
        }
        break
      }
      case 'marks': {
        const marksDir = path.join(dbPath, 'media/videos/marks')
        ensureDir(marksDir)
        const outputPath = getMarkPath(dbPath, item.id)
        if (force && fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        await createMarkImage(formatMarkTimestamp(Number(item.time)), resolvedPath, outputPath)
        break
      }
      default:
        throw new Error(`Unknown image type: ${imageType}`)
    }

    return {status: 'created', id: item.id, path: videoPath}
  } catch (error: unknown) {
    return {
      status: 'failed',
      id: item.id,
      path: videoPath,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

const GENERATED_DIR_BY_TYPE: Record<VideoImageType, string> = {
  preview: 'media/videos/thumbs',
  grid: 'media/videos/grids',
  marks: 'media/videos/marks',
}

async function loadGeneratedIdSet(dbPath: string, imageType: VideoImageType): Promise<Set<string>> {
  const relativeDir = GENERATED_DIR_BY_TYPE[imageType]
  if (!relativeDir) return new Set()

  const dirPath = path.join(dbPath, relativeDir)
  if (!fs.existsSync(dirPath)) return new Set()

  const files = await readdir(dirPath)
  return collectJpgStemIds(files)
}

async function getVideoImagesGenerationStatus(db: ApiDb, dbPath: string): Promise<VideoImagesGenerationStatus> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const videoTypeId = await getVideoMediaTypeId(db)
  const [previewIds, gridIds, markImageIds, videoTotal, marksTotal] = await Promise.all([
    loadGeneratedIdSet(dbPath, 'preview'),
    loadGeneratedIdSet(dbPath, 'grid'),
    loadGeneratedIdSet(dbPath, 'marks'),
    Promise.resolve(videoTypeId ? mediaRepo.countByMediaType(videoTypeId) : 0),
    Promise.resolve(marksRepo.countAll()),
  ])

  const previewGenerated = videoTypeId
    ? mediaRepo.countByIdsAndMediaType(videoTypeId, parsePositiveStemIds(previewIds))
    : 0
  const gridGenerated = videoTypeId
    ? mediaRepo.countByIdsAndMediaType(videoTypeId, parsePositiveStemIds(gridIds))
    : 0
  const marksGenerated = marksRepo.countByIds(parsePositiveStemIds(markImageIds))

  return {
    preview: buildVideoImageStatus(videoTotal, previewGenerated),
    grid: buildVideoImageStatus(videoTotal, gridGenerated),
    marks: buildVideoImageStatus(marksTotal, marksGenerated),
  }
}

function normalizeMediaIds(mediaIds?: Array<number | string> | null): number[] | null {
  if (!Array.isArray(mediaIds) || !mediaIds.length) return null
  const ids = [...new Set(mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
  return ids.length ? ids : null
}

async function* iterateVideoImagesGeneration(
  db: ApiDb,
  dbPath: string,
  imageType: VideoImageType,
  {
    shouldStop = () => false,
    force = false,
    mediaIds,
  }: VideoImageGenerationOptions = {},
): AsyncGenerator<VideoImageGenerationProgressEvent> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const requestedIds = imageType === 'marks' ? null : normalizeMediaIds(mediaIds)

  if (!IMAGE_TYPES.includes(imageType)) {
    yield {type: 'error', message: `Unknown image type: ${imageType}`}
    return
  }

  let total = 0
  if (requestedIds?.length) {
    total = requestedIds.length
  } else if (imageType === 'marks') {
    total = marksRepo.countAll()
  } else {
    const videoTypeId = await getVideoMediaTypeId(db)
    if (!videoTypeId) {
      yield {type: 'complete', processed: 0, total: 0, created: 0, skipped: 0, missing: 0, failed: 0}
      return
    }
    total = mediaRepo.countByMediaType(videoTypeId)
  }

  let processed = 0
  let created = 0
  let skipped = 0
  let missing = 0
  let failed = 0
  let lastId = 0
  let requestIndex = 0

  yield {
    type: 'progress',
    processed,
    total,
    remaining: total,
    created,
    skipped,
    missing,
    failed,
  }

  while (!shouldStop()) {
    let item: VideoImageItem | null = null

    if (requestedIds?.length) {
      if (requestIndex >= requestedIds.length) break
      const id = requestedIds[requestIndex]
      requestIndex += 1
      const row = mediaRepo.findById(id)
      if (!row) {
        processed += 1
        missing += 1
        yield {
          type: 'progress',
          processed,
          total,
          remaining: Math.max(total - processed, 0),
          created,
          skipped,
          missing,
          failed,
          lastStatus: 'missing',
        }
        continue
      }
      item = row as VideoImageItem
    } else if (imageType === 'marks') {
      const markRow = marksRepo.findNextWithMediaAfterId(lastId)
      if (!markRow) break
      item = {
        ...markRow,
        media: markRow.media || undefined,
      } as VideoImageItem
    } else {
      const videoTypeId = await getVideoMediaTypeId(db)
      item = mediaRepo.findNextByMediaTypeAfterId(Number(videoTypeId), lastId) as VideoImageItem | null
      if (!item) break
    }

    lastId = Number(item.id)

    if (!force && hasGeneratedImage(dbPath, imageType, item)) {
      processed += 1
      skipped += 1
      yield {
        type: 'progress',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        created,
        skipped,
        missing,
        failed,
        current: item.path || item.media?.path,
        lastStatus: 'skipped',
      }
      continue
    }

    const result = await generateVideoImage(dbPath, imageType, item, {force})
    processed += 1

    if (result.status === 'created') {
      created += 1
      if (imageType === 'grid') {
        try {
          await upsertVisualHashForMedia(db, Number(item.id))
        } catch {
          // Grid is usable; hash can be filled via Settings → visual hash backfill.
        }
        try {
          await upsertClipEmbeddingForMedia(db, Number(item.id))
        } catch {
          // Grid is usable; CLIP embedding can be filled via Settings backfill.
        }
      }
    }
    else if (result.status === 'skipped') skipped += 1
    else if (result.status === 'missing') missing += 1
    else failed += 1

    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      created,
      skipped,
      missing,
      failed,
      current: result.path,
      lastStatus: result.status,
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    created,
    skipped,
    missing,
    failed,
    stopped: shouldStop(),
  }
}

export {
  IMAGE_TYPES,
  generateVideoImage,
  getVideoImagesGenerationStatus,
  iterateVideoImagesGeneration,
}
