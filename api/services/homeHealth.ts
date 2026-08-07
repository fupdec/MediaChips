import type { ApiDb, AnyRecord } from '../types/db'
import type { ParsedHomeHealth, ParsedHomeHealthLite } from '@shared/schemas/home'
import {
  getContentHashBackfillStatus,
  getFingerprintBackfillStatus,
  getOshashBackfillStatus,
} from './mediaFingerprintBackfill'
import { getVideoCodecBackfillStatus } from './videoCodecBackfill'
import { getVideoImagesGenerationStatus } from './videoImagesGeneration'
import { getImageThumbsGenerationStatus } from './imageThumbsGeneration'
import {
  getTagImageAiUpscaleStatus,
  hasAnyUpscaleCandidateFiles,
  isTagImageAiUpscaleDone,
  TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
} from './tagImageAiUpscale'
import { getClipEmbeddingBackfillStatus } from './mediaClipEmbeddings'
import { getFaceDetectionStatus } from './faceDetector'
import { queryGet } from '../db/utils/rawQuery'
import { getDirectorySize } from './directorySize'

type HealthQueueItem = NonNullable<ParsedHomeHealth['queue']>[number]

async function getActiveDatabaseSize(db: ApiDb) {
  const bytes = await getDirectorySize(db.path ?? '')

  return {
    id: db.config?.id || null,
    name: db.config?.name || null,
    bytes,
  }
}

function summarizeGeneratedImagesStatus(status: unknown): {
  byType: AnyRecord
  totalPending: number
} {
  const byType = (status && typeof status === 'object' ? status : {}) as AnyRecord
  const totalPending = (Object.values(byType) as AnyRecord[]).reduce(
    (sum: number, item: AnyRecord) => sum + Number(item?.pending || 0),
    0,
  )

  return {byType, totalPending}
}

function pendingRatio(pending: number, total: number): number {
  if (pending <= 0) return 0
  if (total <= 0) return 1
  return Math.min(1, pending / total)
}

function visualsTotals(generatedImages: {byType: AnyRecord; totalPending: number}, imageThumbs: {
  total: number
  pending: number
}) {
  const types = ['preview', 'grid', 'marks'] as const
  let pending = 0
  let total = 0
  for (const key of types) {
    const item = generatedImages.byType?.[key] as AnyRecord | undefined
    pending += Number(item?.pending || 0)
    total += Number(item?.total || 0)
  }
  pending += Number(imageThumbs?.pending || 0)
  total += Number(imageThumbs?.total || 0)
  return {pending, total}
}

function duplicateSignalCount(duplicates: {
  byFilesize: number
  byFingerprint: number
  byVisualHash: number
}): number {
  return Math.max(
    Number(duplicates.byFilesize || 0),
    Number(duplicates.byFingerprint || 0),
    Number(duplicates.byVisualHash || 0),
  )
}

function isClipModelReady(modelStatus?: string): boolean {
  return modelStatus === 'downloaded'
    || modelStatus === 'loaded'
    || modelStatus === 'loading'
}

function computeHealthScore(input: {
  generatedImages: {byType: AnyRecord; totalPending: number}
  imageThumbs: {total: number; pending: number}
  clip: {total: number; pending: number}
  fingerprint: {total: number; pending: number}
  faces: {total: number; pending: number}
  videoCodec: {total: number; pending: number}
  duplicates: {byFilesize: number; byFingerprint: number; byVisualHash: number}
  tagImageAiUpscale: {done: boolean; pendingCount?: number; suggested: boolean}
}): number {
  let score = 100
  const visuals = visualsTotals(input.generatedImages, input.imageThumbs)
  score -= Math.round(25 * pendingRatio(visuals.pending, visuals.total))
  score -= Math.round(20 * pendingRatio(input.clip.pending, input.clip.total))
  score -= Math.round(15 * pendingRatio(input.fingerprint.pending, input.fingerprint.total))
  score -= Math.round(10 * pendingRatio(input.faces.pending, input.faces.total))
  score -= Math.round(10 * pendingRatio(input.videoCodec.pending, input.videoCodec.total))

  const dupCount = duplicateSignalCount(input.duplicates)
  if (dupCount >= 50) score -= 15
  else if (dupCount >= 10) score -= 10
  else if (dupCount > 0) score -= 5

  const tagUpscale = input.tagImageAiUpscale
  if (!tagUpscale.done && (tagUpscale.suggested || Number(tagUpscale.pendingCount) > 0)) {
    score -= 5
  }

  return Math.max(0, Math.min(100, score))
}

function buildHealthQueue(input: {
  generatedImages: {byType: AnyRecord; totalPending: number}
  imageThumbs: {total: number; pending: number}
  fingerprint: {total: number; pending: number}
  videoCodec: {total: number; pending: number}
  clip: {total: number; pending: number; modelStatus?: string}
  faces: {total: number; pending: number}
  duplicates: {byFilesize: number; byFingerprint: number; byVisualHash: number}
  tagImageAiUpscale: {done: boolean; pendingCount?: number; suggested: boolean}
}): HealthQueueItem[] {
  const queue: HealthQueueItem[] = []
  const visuals = visualsTotals(input.generatedImages, input.imageThumbs)

  if (visuals.pending > 0) {
    queue.push({
      id: 'visuals',
      severity: 'info',
      count: visuals.pending,
      autoFixable: true,
      settingsSection: 'generate_video_images',
    })
  }

  if (input.fingerprint.pending > 0) {
    queue.push({
      id: 'fingerprint',
      severity: 'info',
      count: input.fingerprint.pending,
      autoFixable: true,
      settingsSection: 'oshash_backfill',
    })
  }

  if (input.videoCodec.pending > 0) {
    queue.push({
      id: 'codec',
      severity: 'info',
      count: input.videoCodec.pending,
      autoFixable: true,
      settingsSection: 'video_codec_backfill',
    })
  }

  if (input.clip.pending > 0) {
    queue.push({
      id: 'clip',
      severity: 'info',
      count: input.clip.pending,
      autoFixable: isClipModelReady(input.clip.modelStatus),
      settingsSection: 'clip_embedding_backfill',
    })
  }

  if (input.faces.pending > 0) {
    queue.push({
      id: 'faces',
      severity: 'info',
      count: input.faces.pending,
      autoFixable: false,
      settingsSection: 'detect_faces',
    })
  }

  const dupCount = duplicateSignalCount(input.duplicates)
  if (dupCount > 0) {
    queue.push({
      id: 'duplicates',
      severity: 'warning',
      count: dupCount,
      autoFixable: false,
      settingsSection: 'find_duplicates',
    })
  }

  const tagUpscale = input.tagImageAiUpscale
  if (!tagUpscale.done && (tagUpscale.suggested || Number(tagUpscale.pendingCount) > 0)) {
    queue.push({
      id: 'tagUpscale',
      severity: 'info',
      count: Number(tagUpscale.pendingCount) || 0,
      autoFixable: false,
      settingsSection: 'tag_image_ai_upscale',
    })
  }

  // Navigate-only tip; never scored. Always present so users can deep-check paths.
  queue.push({
    id: 'missing',
    severity: 'info',
    count: 0,
    autoFixable: false,
    settingsSection: 'find_missing',
  })

  return queue
}

async function getDuplicateCounts(db: ApiDb) {
  const byFilesize = queryGet(db, `
    SELECT COUNT(*) AS count
    FROM media m
    WHERE m.filesize > 0
      AND m.filesize IN (
        SELECT filesize
        FROM media
        WHERE filesize > 0
        GROUP BY filesize
        HAVING COUNT(*) > 1
      )
  `) as {count?: number} | undefined

  const byOshash = queryGet(db, `
    SELECT COUNT(*) AS count
    FROM media m
    WHERE m.oshash IS NOT NULL
      AND m.oshash != ''
      AND m.oshash IN (
        SELECT oshash
        FROM media
        WHERE oshash IS NOT NULL
          AND oshash != ''
        GROUP BY oshash
        HAVING COUNT(*) > 1
      )
  `) as {count?: number} | undefined

  const byFingerprint = Number(byOshash?.count || 0)

  // Exact visualHash groups only — near-dup BK-tree clustering is reserved for
  // Find Duplicates; the home badge only needs a cheap health signal.
  const byVisualHash = queryGet(db, `
    SELECT COUNT(*) AS count
    FROM media m
    WHERE m.visualHash IS NOT NULL
      AND m.visualHash != ''
      AND m.visualHash IN (
        SELECT visualHash
        FROM media
        WHERE visualHash IS NOT NULL
          AND visualHash != ''
        GROUP BY visualHash
        HAVING COUNT(*) > 1
      )
  `) as {count?: number} | undefined

  return {
    byFilesize: Number(byFilesize?.count || 0),
    byContentHash: 0,
    byOshash: Number(byOshash?.count || 0),
    byFingerprint,
    byVisualHash: Number(byVisualHash?.count || 0),
  }
}

async function getTagImageAiUpscaleLiteHint(db: ApiDb) {
  const done = isTagImageAiUpscaleDone(db)
  if (done) {
    return {
      done: true,
      suggested: false,
      downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
    }
  }

  const dbPath = db.path
  const suggested = dbPath ? await hasAnyUpscaleCandidateFiles(dbPath) : false
  return {
    done: false,
    suggested,
    downloadSizeMb: TAG_AI_UPSCALE_DOWNLOAD_SIZE_MB,
  }
}

async function getHomeHealthLite(db: ApiDb): Promise<ParsedHomeHealthLite> {
  const [fingerprint, contentHash, oshash, videoCodec, tagImageAiUpscale] = await Promise.all([
    getFingerprintBackfillStatus(db),
    getContentHashBackfillStatus(db),
    getOshashBackfillStatus(db),
    getVideoCodecBackfillStatus(db),
    getTagImageAiUpscaleLiteHint(db),
  ])

  return {
    fingerprint,
    contentHash,
    oshash,
    videoCodec,
    tagImageAiUpscale,
  } as ParsedHomeHealthLite
}

async function getHomeHealth(db: ApiDb): Promise<ParsedHomeHealth> {
  const getDbPath = () => db.path!
  const dbPath = getDbPath()
  const [
    duplicates,
    fingerprint,
    contentHash,
    oshash,
    videoCodec,
    videoImages,
    imageThumbs,
    database,
    tagImageAiUpscale,
    clipStatus,
    facesStatus,
  ] = await Promise.all([
    getDuplicateCounts(db),
    getFingerprintBackfillStatus(db),
    getContentHashBackfillStatus(db),
    getOshashBackfillStatus(db),
    getVideoCodecBackfillStatus(db),
    getVideoImagesGenerationStatus(db, dbPath),
    getImageThumbsGenerationStatus(db, dbPath),
    getActiveDatabaseSize(db),
    getTagImageAiUpscaleStatus(db),
    getClipEmbeddingBackfillStatus(db),
    getFaceDetectionStatus(db),
  ])

  const generatedImages = summarizeGeneratedImagesStatus({
    ...videoImages,
    'image-thumbs': imageThumbs,
  })

  const clip = {
    total: Number(clipStatus.total || 0),
    pending: Number(clipStatus.pending || 0),
    hashed: Number(clipStatus.hashed || 0),
    modelStatus: clipStatus.modelStatus,
    model: clipStatus.model,
  }

  const faces = {
    total: Number(facesStatus.total || 0),
    pending: Number(facesStatus.pending || 0),
    generated: Number(facesStatus.generated || 0),
    faces: Number(facesStatus.faces || 0),
  }

  const tagImageAiUpscalePayload = {
    done: tagImageAiUpscale.done,
    pendingCount: tagImageAiUpscale.pendingCount,
    suggested: tagImageAiUpscale.suggested,
    downloadSizeMb: tagImageAiUpscale.downloadSizeMb,
  }

  const score = computeHealthScore({
    generatedImages,
    imageThumbs,
    clip,
    fingerprint,
    faces,
    videoCodec,
    duplicates,
    tagImageAiUpscale: tagImageAiUpscalePayload,
  })

  const queue = buildHealthQueue({
    generatedImages,
    imageThumbs,
    fingerprint,
    videoCodec,
    clip,
    faces,
    duplicates,
    tagImageAiUpscale: tagImageAiUpscalePayload,
  })

  return {
    score,
    queue,
    duplicates,
    fingerprint,
    contentHash,
    oshash,
    videoCodec,
    generatedImages,
    imageThumbs,
    clip,
    faces,
    database,
    tagImageAiUpscale: tagImageAiUpscalePayload,
  } as ParsedHomeHealth
}

export {
  getHomeHealth,
  getHomeHealthLite,
  getDuplicateCounts,
  computeHealthScore,
  buildHealthQueue,
  isClipModelReady,
}
