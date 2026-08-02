import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { queryAll, queryGet } from '../db/utils/rawQuery'
import { chunkArray } from '../db/utils/chunk'
import { createMediaRepository } from '../db/repositories/media'
import {
  clusterVisualNearDuplicates,
  computeGridVisualFingerprint,
  encodeVisualHashTiles,
  flattenVisualDuplicateIds,
  type VisualSimilarityOptions,
} from './visualHash'

type VisualNearLookupOptions = VisualSimilarityOptions & {
  /** When set, only these media ids are considered (filter-scoped candidate set). */
  candidateIds?: number[] | null
}

interface VisualHashMediaRow {
  id: number
  visualHash: string | null
  visualHashTiles: string | null
}

function getGridPath(dbPath: string, id: number) {
  return path.join(dbPath, 'media/videos/grids', `${id}.jpg`)
}

function countSql(db: ApiDb, whereExtra = ''): number {
  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type = 'video'
    ${whereExtra}
  `)
  return Number(row?.count || 0)
}

/** Videos that already have a grid JPEG on disk (candidates for hashing). */
function listVideoIdsWithGrid(db: ApiDb): number[] {
  const dbPath = String(db.path || '')
  if (!dbPath) return []

  const gridsDir = path.join(dbPath, 'media/videos/grids')
  if (!fs.existsSync(gridsDir)) return []

  const onDisk = new Set(
    fs.readdirSync(gridsDir)
      .map((name) => {
        const match = /^(\d+)\.jpg$/i.exec(name)
        return match ? Number(match[1]) : 0
      })
      .filter((id) => id > 0),
  )

  if (!onDisk.size) return []

  const rows = queryAll<{id: number}>(db, `
    SELECT m.id AS id
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type = 'video'
  `)

  return rows.map((row) => Number(row.id)).filter((id) => onDisk.has(id))
}

async function getVisualHashBackfillStatus(db: ApiDb) {
  const withGridIds = listVideoIdsWithGrid(db)
  const total = withGridIds.length

  if (!total) {
    return {total: 0, pending: 0, hashed: 0, videosWithoutGrid: countSql(db)}
  }

  const hashedRows = queryAll<{id: number}>(db, `
    SELECT m.id AS id
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type = 'video'
      AND m.visualHash IS NOT NULL
      AND m.visualHash != ''
      AND m.id IN (:ids)
  `, {ids: withGridIds})

  const hashed = hashedRows.length
  const videosWithoutGrid = countSql(db) - total

  return {
    total,
    pending: Math.max(total - hashed, 0),
    hashed,
    videosWithoutGrid: Math.max(videosWithoutGrid, 0),
  }
}

function findNextForVisualHashBackfill(
  db: ApiDb,
  lastId: number,
  force: boolean,
  withGridIds: number[],
): VisualHashMediaRow | undefined {
  if (!withGridIds.length) return undefined

  const pendingClause = force
    ? ''
    : `AND (m.visualHash IS NULL OR m.visualHash = '')`

  return queryGet<VisualHashMediaRow>(db, `
    SELECT
      m.id AS id,
      m.visualHash AS visualHash,
      m.visualHashTiles AS visualHashTiles
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type = 'video'
      AND m.id > :lastId
      AND m.id IN (:ids)
      ${pendingClause}
    ORDER BY m.id
    LIMIT 1
  `, {lastId, ids: withGridIds})
}

async function backfillMediaVisualHash(db: ApiDb, media: VisualHashMediaRow) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const dbPath = String(db.path || '')
  const gridPath = getGridPath(dbPath, Number(media.id))

  if (!fs.existsSync(gridPath)) {
    return {
      status: 'missing' as const,
      id: media.id,
      path: gridPath,
    }
  }

  try {
    const fingerprint = await computeGridVisualFingerprint(gridPath)
    mediaRepo.updateById(Number(media.id), {
      visualHash: fingerprint.hash,
      visualHashTiles: encodeVisualHashTiles(fingerprint.tiles),
    })

    return {
      status: 'hashed' as const,
      id: media.id,
      path: gridPath,
      hash: fingerprint.hash,
    }
  } catch (error: unknown) {
    return {
      status: 'failed' as const,
      id: media.id,
      path: gridPath,
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Persist visual hash for one media after its grid JPEG was generated.
 * No-op when db path / grid file is missing.
 */
async function upsertVisualHashForMedia(db: ApiDb, mediaId: number) {
  const dbPath = String(db.path || '')
  if (!dbPath || !mediaId) return null

  const gridPath = getGridPath(dbPath, mediaId)
  if (!fs.existsSync(gridPath)) return null

  const mediaRepo = createMediaRepository(db.drizzle)
  const fingerprint = await computeGridVisualFingerprint(gridPath)
  const patch = {
    visualHash: fingerprint.hash,
    visualHashTiles: encodeVisualHashTiles(fingerprint.tiles),
  }
  mediaRepo.updateById(mediaId, patch)
  return patch
}

async function* iterateVisualHashBackfill(
  db: ApiDb,
  {
    shouldStop = (): boolean => false,
    force = false,
  }: {
    shouldStop?: () => boolean
    force?: boolean
  } = {},
) {
  const withGridIds = listVideoIdsWithGrid(db)
  const status = await getVisualHashBackfillStatus(db)
  const total = force ? status.total : status.pending

  let processed = 0
  let hashed = 0
  let missing = 0
  let failed = 0
  let skipped = 0
  let lastId = 0

  yield {
    type: 'progress',
    processed,
    total,
    remaining: total,
    hashed,
    missing,
    failed,
    skipped,
  }

  while (!shouldStop()) {
    const media = findNextForVisualHashBackfill(db, lastId, force, withGridIds)
    if (!media) break

    lastId = Number(media.id)
    const result = await backfillMediaVisualHash(db, media)
    processed += 1

    if (result.status === 'hashed') hashed += 1
    else if (result.status === 'missing') missing += 1
    else if (result.status === 'failed') failed += 1
    else skipped += 1

    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      hashed,
      missing,
      failed,
      skipped,
      current: result.path,
      id: result.id,
      status: result.status,
    }
  }

  yield {
    type: 'complete',
    processed,
    total,
    hashed,
    missing,
    failed,
    skipped,
    stopped: shouldStop(),
  }
}

function loadVisualHashRows(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  candidateIds?: number[] | null,
) {
  if (candidateIds != null) {
    if (!candidateIds.length) return []

    const rows: Array<{id: number, visualHash: string, visualHashTiles: string | null}> = []
    for (const chunk of chunkArray(candidateIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))) {
      rows.push(...queryAll<{id: number, visualHash: string, visualHashTiles: string | null}>(db, `
        SELECT
          m.id AS id,
          m.visualHash AS visualHash,
          m.visualHashTiles AS visualHashTiles
        FROM media m
        WHERE m.id IN (:ids)
          AND m.visualHash IS NOT NULL
          AND m.visualHash != ''
      `, {ids: chunk}))
    }
    return rows
  }

  const typeId = mediaTypeId == null || mediaTypeId === ''
    ? null
    : Number(mediaTypeId)
  const hasTypeId = typeId != null && Number.isFinite(typeId)
  const typeClause = hasTypeId
    ? 'AND m.mediaTypeId = :mediaTypeId'
    : `AND mt.type = 'video'`

  return queryAll<{id: number, visualHash: string, visualHashTiles: string | null}>(db, `
    SELECT
      m.id AS id,
      m.visualHash AS visualHash,
      m.visualHashTiles AS visualHashTiles
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE m.visualHash IS NOT NULL
      AND m.visualHash != ''
      ${typeClause}
  `, hasTypeId ? {mediaTypeId: typeId} : {})
}

function findVisualNearDuplicateIds(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  options: VisualNearLookupOptions = {},
): number[] {
  const {candidateIds, ...similarity} = options
  const rows = loadVisualHashRows(db, mediaTypeId, candidateIds)
  const clusters = clusterVisualNearDuplicates(rows, similarity)
  return flattenVisualDuplicateIds(clusters)
}

function findVisualNearDuplicateClusters(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  options: VisualNearLookupOptions = {},
) {
  const {candidateIds, ...similarity} = options
  const rows = loadVisualHashRows(db, mediaTypeId, candidateIds)
  return clusterVisualNearDuplicates(rows, similarity)
}

export {
  getVisualHashBackfillStatus,
  iterateVisualHashBackfill,
  upsertVisualHashForMedia,
  findVisualNearDuplicateIds,
  findVisualNearDuplicateClusters,
  getGridPath,
}
