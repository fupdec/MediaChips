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
import { queryGet } from '../db/utils/rawQuery'
import { getDirectorySize } from './directorySize'

async function getActiveDatabaseSize(db: ApiDb) {
  const bytes = await getDirectorySize(db.path ?? '')

  return {
    id: db.config?.id || null,
    name: db.config?.name || null,
    bytes,
  }
}

function summarizeGeneratedImagesStatus(status: unknown) {
  const byType = status || {}
  const totalPending = (Object.values(byType) as AnyRecord[]).reduce(
    (sum: number, item: AnyRecord) => sum + Number(item?.pending || 0),
    0,
  )

  return {byType, totalPending}
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
  const [duplicates, fingerprint, contentHash, oshash, videoCodec, videoImages, imageThumbs, database, tagImageAiUpscale] = await Promise.all([
    getDuplicateCounts(db),
    getFingerprintBackfillStatus(db),
    getContentHashBackfillStatus(db),
    getOshashBackfillStatus(db),
    getVideoCodecBackfillStatus(db),
    getVideoImagesGenerationStatus(db, dbPath),
    getImageThumbsGenerationStatus(db, dbPath),
    getActiveDatabaseSize(db),
    getTagImageAiUpscaleStatus(db),
  ])

  const generatedImages = summarizeGeneratedImagesStatus({
    ...videoImages,
    'image-thumbs': imageThumbs,
  })

  return {
    duplicates,
    fingerprint,
    contentHash,
    oshash,
    videoCodec,
    generatedImages,
    imageThumbs,
    database,
    tagImageAiUpscale: {
      done: tagImageAiUpscale.done,
      pendingCount: tagImageAiUpscale.pendingCount,
      suggested: tagImageAiUpscale.suggested,
      downloadSizeMb: tagImageAiUpscale.downloadSizeMb,
    },
  } as ParsedHomeHealth
}

export { getHomeHealth, getHomeHealthLite, getDuplicateCounts }
