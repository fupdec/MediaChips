import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { readdir } from 'fs/promises'
import { resolveExistingPath } from './contentHash'
import { createMediaRepository } from '../db/repositories/media'
import { createMediaTypesRepository } from '../db/repositories/mediaTypes'
import { createImageMetadataRepository } from '../db/repositories/imageMetadata'
import { upsertClipEmbeddingForMedia } from './mediaClipEmbeddings'

import {collectJpgStemIds, parsePositiveStemIds} from './videoImagesStatus'

async function getImageMediaTypeId(db: ApiDb) {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const imageType = mediaTypesRepo.findByType('image')
  return imageType?.id || null
}

const getThumbPath = (dbPath: string, id: unknown) => path.join(dbPath, 'media/images/thumbs', `${id}.jpg`)

function hasImageThumb(dbPath: string, id: unknown) {
  return fs.existsSync(getThumbPath(dbPath, id))
}

function buildStatus(total: number, generated: number) {
  return {
    total,
    generated,
    pending: Math.max(total - generated, 0),
  }
}

async function loadGeneratedThumbIds(dbPath: string) {
  const dirPath = path.join(dbPath, 'media/images/thumbs')
  if (!fs.existsSync(dirPath)) return new Set<string>()

  const files = await readdir(dirPath)
  return collectJpgStemIds(files)
}

async function getImageThumbsGenerationStatus(db: ApiDb, dbPath: string) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const imageTypeId = await getImageMediaTypeId(db)
  const [thumbIds, imageTotal] = await Promise.all([
    loadGeneratedThumbIds(dbPath),
    Promise.resolve(imageTypeId ? mediaRepo.countByMediaType(imageTypeId) : 0),
  ])

  const generated = imageTypeId
    ? mediaRepo.countByIdsAndMediaType(imageTypeId, parsePositiveStemIds(thumbIds))
    : 0

  return buildStatus(imageTotal, generated)
}

async function generateImageThumb(
  db: ApiDb,
  dbPath: string,
  item: {id?: unknown; path?: unknown},
  imageMedia: {getImageMetadata: (path: string) => Promise<unknown>; createImageThumb: (path: string, id: unknown, dbPath: string) => Promise<void>},
  {force = false} = {},
) {
  const imageMetadataRepo = createImageMetadataRepository(db.drizzle)
  const imagePath = await resolveExistingPath(String(item.path || ''))

  if (!imagePath) {
    return {status: 'missing', id: item.id, path: item.path}
  }

  if (!force && hasImageThumb(dbPath, item.id)) {
    return {status: 'skipped', id: item.id, path: imagePath}
  }

  try {
    const metadata = await imageMedia.getImageMetadata(imagePath) as {
      width?: number
      height?: number
      orientation?: number
    } | null

    if (metadata) {
      imageMetadataRepo.upsert({
        mediaId: Number(item.id),
        width: metadata.width,
        height: metadata.height,
        orientation: metadata.orientation,
      })
    }

    await imageMedia.createImageThumb(imagePath, item.id, dbPath)
    return {status: 'created', id: item.id, path: imagePath}
  } catch (error: unknown) {
    return {
      status: 'failed',
      id: item.id,
      path: imagePath,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

async function* iterateImageThumbsGeneration(
  db: ApiDb,
  dbPath: string,
  imageMedia: {getImageMetadata: (path: string) => Promise<unknown>; createImageThumb: (path: string, id: unknown, dbPath: string) => Promise<void>},
  {
    shouldStop = (): boolean => false,
    force = false,
  }: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const imageTypeId = await getImageMediaTypeId(db)

  if (!imageTypeId) {
    yield {type: 'complete', processed: 0, total: 0, created: 0, skipped: 0, missing: 0, failed: 0}
    return
  }

  const total = mediaRepo.countByMediaType(imageTypeId)
  let processed = 0
  let created = 0
  let skipped = 0
  let missing = 0
  let failed = 0
  let lastId = 0

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
    const item = mediaRepo.findNextByMediaTypeAfterId(imageTypeId, lastId)

    if (!item) break

    lastId = Number(item.id)

    const result = await generateImageThumb(db, dbPath, item, imageMedia, {force})
    processed += 1

    if (result.status === 'created') {
      created += 1
      try {
        await upsertClipEmbeddingForMedia(db, Number(item.id))
      } catch {
        // Thumb is usable; CLIP embedding can be filled via Settings backfill.
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

export { getImageThumbsGenerationStatus, iterateImageThumbsGeneration }
