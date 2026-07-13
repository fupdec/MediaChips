import type { ApiDb, AnyRecord } from '../types/db'
import type { ParsedHomeHealth } from '@shared/schemas/home'
import fs from 'fs'
import path from 'path'
import { readdir, stat } from 'fs/promises'
import { getContentHashBackfillStatus } from './contentHashBackfill'
import { getOshashBackfillStatus } from './oshashBackfill'
import { getVideoCodecBackfillStatus } from './videoCodecBackfill'
import { getVideoImagesGenerationStatus } from './videoImagesGeneration'
import { getImageThumbsGenerationStatus } from './imageThumbsGeneration'
import { queryGet } from '../db/utils/rawQuery'

async function getDirectorySize(directory: string): Promise<number> {
  if (!fs.existsSync(directory)) return 0

  const entries = await readdir(directory, {withFileTypes: true})
  const sizes = await Promise.all(entries.map(async (entry: import("fs").Dirent) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return getDirectorySize(entryPath)
    if (entry.isFile()) {
      const {size} = await stat(entryPath)
      return size
    }
    return 0
  }))

  return sizes.reduce((sum: number, size: number) => sum + size, 0)
}

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

  const byContentHash = queryGet(db, `
    SELECT COUNT(*) AS count
    FROM media m
    WHERE m.contentHash IS NOT NULL
      AND m.contentHash != ''
      AND m.contentHash IN (
        SELECT contentHash
        FROM media
        WHERE contentHash IS NOT NULL
          AND contentHash != ''
        GROUP BY contentHash
        HAVING COUNT(*) > 1
      )
  `) as {count?: number} | undefined

  return {
    byFilesize: Number(byFilesize?.count || 0),
    byContentHash: Number(byContentHash?.count || 0),
  }
}

async function getHomeHealth(db: ApiDb): Promise<ParsedHomeHealth> {
  const getDbPath = () => db.path!
  const dbPath = getDbPath()
  const [duplicates, contentHash, oshash, videoCodec, videoImages, imageThumbs, database] = await Promise.all([
    getDuplicateCounts(db),
    getContentHashBackfillStatus(db),
    getOshashBackfillStatus(db),
    getVideoCodecBackfillStatus(db),
    getVideoImagesGenerationStatus(db, dbPath),
    getImageThumbsGenerationStatus(db, dbPath),
    getActiveDatabaseSize(db),
  ])

  const generatedImages = summarizeGeneratedImagesStatus({
    ...videoImages,
    'image-thumbs': imageThumbs,
  })

  return {
    duplicates,
    contentHash,
    oshash,
    videoCodec,
    generatedImages,
    imageThumbs,
    database,
  } as ParsedHomeHealth
}

export { getHomeHealth, getDuplicateCounts }
