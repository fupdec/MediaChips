import type { ApiDb } from '../types/db'
import fs from 'fs'
import path from 'path'
import { queryAll, queryGet } from '../db/utils/rawQuery'
import { chunkArray } from '../db/utils/chunk'
import { createMediaRepository } from '../db/repositories/media'
import {
  clusterVisualMatches,
  computeAHashHex,
  collectVisualNearNeighborIds,
  computeGridVisualFingerprint,
  encodeVisualHashTiles,
  flattenVisualDuplicateIds,
  rankVisualSimilarIds,
  type RankVisualSimilarOptions,
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
  visualHashThumbnail?: string | null
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

/** Videos with an existing grid or thumbnail (candidates for hashing). */
function listVideoIdsWithPreviews(db: ApiDb): number[] {
  const dbPath = String(db.path || '')
  if (!dbPath) return []

  const onDisk = new Set<number>()
  for (const folder of ['grids', 'thumbs']) {
    const directory = path.join(dbPath, 'media/videos', folder)
    if (!fs.existsSync(directory)) continue
    for (const name of fs.readdirSync(directory)) {
      const match = /^(\d+)\.jpg$/i.exec(name)
      if (match && Number(match[1]) > 0) onDisk.add(Number(match[1]))
    }
  }

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
  const withPreviewIds = listVideoIdsWithPreviews(db)
  const total = withPreviewIds.length

  if (!total) {
    return {total: 0, pending: 0, hashed: 0, videosWithoutGrid: countSql(db)}
  }

  const pending = listPendingVisualHashIds(db, withPreviewIds)
  const hashed = total - pending.length
  const videosWithoutGrid = queryAll<{id: number}>(db, `
    SELECT m.id FROM media m INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id WHERE mt.type = 'video'
  `).filter(row => !fs.existsSync(getGridPath(String(db.path || ''), row.id))).length

  return {
    total,
    pending: Math.max(total - hashed, 0),
    hashed,
    videosWithoutGrid: Math.max(videosWithoutGrid, 0),
  }
}

function listPendingVisualHashIds(db: ApiDb, ids: number[]): number[] {
  const pending: number[] = []
  for (const chunk of chunkArray(ids)) {
    const rows = queryAll<VisualHashMediaRow>(db, `
      SELECT id, visualHash, visualHashTiles, visualHashThumbnail FROM media WHERE id IN (:ids)
    `, {ids: chunk})
    for (const row of rows) {
      const root = String(db.path || '')
      if ((!row.visualHash && fs.existsSync(getGridPath(root, row.id)))
        || (!row.visualHashThumbnail && fs.existsSync(path.join(root, 'media/videos/thumbs', `${row.id}.jpg`)))) pending.push(row.id)
    }
  }
  return pending
}

async function backfillMediaVisualHash(db: ApiDb, media: VisualHashMediaRow) {
  const dbPath = String(db.path || '')
  const gridPath = getGridPath(dbPath, Number(media.id))

  try {
    const patch = await upsertVisualHashForMedia(db, Number(media.id))
    if (!patch) return {status: 'missing' as const, id: media.id, path: gridPath}
    return {status: 'hashed' as const, id: media.id, path: gridPath}
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
 * Persist fingerprints for available grid and thumbnail images.
 * No-op when neither preview exists.
 */
async function upsertVisualHashForMedia(db: ApiDb, mediaId: number) {
  const dbPath = String(db.path || '')
  if (!dbPath || !mediaId) return null

  const gridPath = getGridPath(dbPath, mediaId)
  const thumbPath = path.join(dbPath, 'media/videos/thumbs', `${mediaId}.jpg`)
  const patch: {visualHash?: string, visualHashTiles?: string, visualHashThumbnail?: string} = {}
  if (fs.existsSync(gridPath)) {
    const fingerprint = await computeGridVisualFingerprint(gridPath)
    patch.visualHash = fingerprint.hash
    patch.visualHashTiles = encodeVisualHashTiles(fingerprint.tiles)
  }
  if (fs.existsSync(thumbPath)) patch.visualHashThumbnail = await computeAHashHex(thumbPath)
  if (!Object.keys(patch).length) return null
  createMediaRepository(db.drizzle).updateById(mediaId, patch)
  return patch
}

export async function upsertThumbnailVisualHash(db: ApiDb, mediaId: number) {
  if (!db.path || !mediaId) return
  const thumbnail = path.join(db.path, 'media/videos/thumbs', `${mediaId}.jpg`)
  if (!fs.existsSync(thumbnail)) return
  const hash = await computeAHashHex(thumbnail)
  createMediaRepository(db.drizzle).updateById(mediaId, {visualHashThumbnail: hash})
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
  const withPreviewIds = listVideoIdsWithPreviews(db)
  const status = await getVisualHashBackfillStatus(db)
  const total = force ? status.total : status.pending

  let processed = 0
  let hashed = 0
  let missing = 0
  let failed = 0
  let skipped = 0
  const ids = (force ? withPreviewIds : listPendingVisualHashIds(db, withPreviewIds)).sort((a, b) => a - b)
  let nextIndex = 0

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
    const id = ids[nextIndex++]
    if (id == null) break
    const media: VisualHashMediaRow = {id, visualHash: null, visualHashTiles: null}
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

function mediaTypeVisualHashClause(mediaTypeId?: number | string | null) {
  const typeId = mediaTypeId == null || mediaTypeId === ''
    ? null
    : Number(mediaTypeId)
  const hasTypeId = typeId != null && Number.isFinite(typeId)
  return {
    hasTypeId,
    typeId,
    typeClause: hasTypeId
      ? 'AND m.mediaTypeId = :mediaTypeId'
      : `AND mt.type = 'video'`,
    replacements: hasTypeId ? {mediaTypeId: typeId} : {},
  }
}

/** id + visualHash only — used to BK-prefilter before loading tiles. */
function loadVisualHashLeanRows(
  db: ApiDb,
  mediaTypeId?: number | string | null,
) {
  const {typeClause, replacements} = mediaTypeVisualHashClause(mediaTypeId)
  return queryAll<{id: number, visualHash: string}>(db, `
    SELECT
      m.id AS id,
      m.visualHash AS visualHash
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE m.visualHash IS NOT NULL
      AND m.visualHash != ''
      ${typeClause}
  `, replacements)
}

function loadVisualHashRows(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  candidateIds?: number[] | null,
) {
  if (candidateIds != null) {
    if (!candidateIds.length) return []

    const rows: Array<{id: number, visualHash: string, visualHashTiles: string | null, visualHashThumbnail: string | null}> = []
    for (const chunk of chunkArray(candidateIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))) {
      rows.push(...queryAll<{id: number, visualHash: string, visualHashTiles: string | null, visualHashThumbnail: string | null}>(db, `
        SELECT
          m.id AS id,
          m.visualHash AS visualHash,
          m.visualHashTiles AS visualHashTiles,
          m.visualHashThumbnail AS visualHashThumbnail
        FROM media m
        WHERE m.id IN (:ids)
          AND (COALESCE(m.visualHash, '') != '' OR COALESCE(m.visualHashThumbnail, '') != '')
      `, {ids: chunk}))
    }
    return rows
  }

  const {typeClause, replacements} = mediaTypeVisualHashClause(mediaTypeId)

  return queryAll<{id: number, visualHash: string, visualHashTiles: string | null, visualHashThumbnail: string | null}>(db, `
    SELECT
      m.id AS id,
      m.visualHash AS visualHash,
      m.visualHashTiles AS visualHashTiles,
      m.visualHashThumbnail AS visualHashThumbnail
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE (COALESCE(m.visualHash, '') != '' OR COALESCE(m.visualHashThumbnail, '') != '')
      ${typeClause}
  `, replacements)
}

function findVisualNearDuplicateIds(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  options: VisualNearLookupOptions = {},
): number[] {
  const {candidateIds, ...similarity} = options
  const rows = loadVisualHashRows(db, mediaTypeId, candidateIds)
  const clusters = clusterVisualMatches(rows, similarity)
  return flattenVisualDuplicateIds(clusters)
}

function findVisualNearDuplicateClusters(
  db: ApiDb,
  mediaTypeId?: number | string | null,
  options: VisualNearLookupOptions = {},
) {
  const {candidateIds, ...similarity} = options
  const rows = loadVisualHashRows(db, mediaTypeId, candidateIds)
  return clusterVisualMatches(rows, similarity)
}

export interface VisualSimilarBySeedResult {
  seedId: number
  hasVisualHash: boolean
  ids: number[]
}

function findVisualSimilarIds(
  db: ApiDb,
  seedId: number,
  options: RankVisualSimilarOptions = {},
): VisualSimilarBySeedResult {
  const id = Number(seedId)
  if (!Number.isFinite(id) || id <= 0) {
    return {seedId: id, hasVisualHash: false, ids: []}
  }

  const seed = queryGet<{
    id: number
    visualHash: string | null
    visualHashTiles: string | null
    mediaTypeId: number | null
  }>(db, `
    SELECT
      m.id AS id,
      m.visualHash AS visualHash,
      m.visualHashTiles AS visualHashTiles,
      m.mediaTypeId AS mediaTypeId
    FROM media m
    WHERE m.id = :id
  `, {id})

  if (!seed) {
    return {seedId: id, hasVisualHash: false, ids: []}
  }

  const visualHash = String(seed.visualHash || '').trim()
  if (!visualHash) {
    return {seedId: id, hasVisualHash: false, ids: []}
  }

  const seedRow = {
    id: seed.id,
    visualHash,
    visualHashTiles: seed.visualHashTiles,
  }

  // Lean type-wide hash load + BK radius, then hydrate tiles only for neighbors.
  // Avoids pulling every visualHashTiles blob just to rank a short similar list.
  const leanRows = loadVisualHashLeanRows(db, seed.mediaTypeId)
  const neighborIds = collectVisualNearNeighborIds(seedRow, leanRows, options)
  const rows = loadVisualHashRows(db, null, neighborIds)
  const ids = rankVisualSimilarIds(seedRow, rows, options)

  return {seedId: id, hasVisualHash: true, ids}
}

export {
  getVisualHashBackfillStatus,
  iterateVisualHashBackfill,
  upsertVisualHashForMedia,
  findVisualNearDuplicateIds,
  findVisualNearDuplicateClusters,
  findVisualSimilarIds,
  getGridPath,
}
