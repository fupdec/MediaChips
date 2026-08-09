import type {ApiDb} from '../types/db'
import fs from 'fs'
import path from 'path'
import {queryAll, queryGet, bindNamedParameters} from '../db/utils/rawQuery'
import {chunkArray} from '../db/utils/chunk'
import {
  packFloat32Embeddings,
  unpackFloat32Embeddings,
  rankByMaxCosineSimilarityHits,
  rankByMaxPairwiseCosineSimilarity,
  type ClipEmbeddingVector,
} from './clipEmbeddingMath'
import {
  CLIP_EMBEDDING_INDEX_KEY,
  embedClipImageFile,
  embedClipImageTiles,
  embedClipText,
  getClipEmbeddingStatus,
} from './clipEmbeddingModel'
import {translateQueryToEnglish} from './semanticQueryTranslate'
import {VIDEO_GRID_SPRITE, gridTileSeekSeconds} from '../../shared/videoPreview'
import {clampVisualSearchQuickSampleSize} from '../../shared/visualSearchQuick'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000
const VIDEO_GRID_TILE_COUNT = VIDEO_GRID_SPRITE.cols * VIDEO_GRID_SPRITE.rows

export type SemanticSearchHit = {
  id: number
  tileIndex: number | null
  time: number | null
}

type MediaPreviewRow = {
  id: number
  mediaTypeId: number | null
  mediaType: string | null
}

type StoredEmbeddingRow = {
  mediaId: number
  embedding: Buffer
  dims: number
  model: string
}

function clampLimit(limit?: number | null) {
  const parsed = Number(limit)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT
  return Math.min(Math.floor(parsed), MAX_LIMIT)
}

function loadVideoDurations(db: ApiDb, mediaIds: number[]): Map<number, number> {
  const map = new Map<number, number>()
  if (!mediaIds.length) return map
  for (const chunk of chunkArray(mediaIds)) {
    const rows = queryAll<{mediaId: number; duration: number | null}>(db, `
      SELECT mediaId, duration
      FROM videoMetadata
      WHERE mediaId IN (:ids)
    `, {ids: chunk})
    for (const row of rows) {
      map.set(Number(row.mediaId), Number(row.duration) || 0)
    }
  }
  return map
}

function buildSemanticHits(
  ranked: Array<{id: number; tileIndex: number}>,
  candidatesById: Map<number, {embeddings: ClipEmbeddingVector[]}>,
  durations: Map<number, number>,
): SemanticSearchHit[] {
  return ranked.map((hit) => {
    const embeddingsCount = candidatesById.get(hit.id)?.embeddings.length || 0
    if (embeddingsCount !== VIDEO_GRID_TILE_COUNT) {
      return {id: hit.id, tileIndex: null, time: null}
    }
    const time = gridTileSeekSeconds(
      durations.get(hit.id) || 0,
      hit.tileIndex,
      VIDEO_GRID_TILE_COUNT,
    )
    return {
      id: hit.id,
      tileIndex: hit.tileIndex,
      time,
    }
  })
}

function countSeekableSemanticHits(hits: SemanticSearchHit[]): number {
  return hits.filter((hit) => {
    const time = Number(hit?.time)
    return Number.isFinite(time) && time > 0
  }).length
}

function nowIso() {
  return new Date().toISOString()
}

function getVideoGridPath(dbPath: string, id: number) {
  return path.join(dbPath, 'media/videos/grids', `${id}.jpg`)
}

function getVideoThumbPath(dbPath: string, id: number) {
  return path.join(dbPath, 'media/videos/thumbs', `${id}.jpg`)
}

function getImageThumbPath(dbPath: string, id: number) {
  return path.join(dbPath, 'media/images/thumbs', `${id}.jpg`)
}

function isVideoGridPreviewPath(previewPath: string) {
  const normalized = previewPath.replace(/\\/g, '/')
  return normalized.includes('/media/videos/grids/')
}

function resolvePreviewImagePath(db: ApiDb, mediaId: number, mediaType?: string | null) {
  const dbPath = String(db.path || '')
  if (!dbPath || !mediaId) return null

  const type = String(mediaType || '').toLowerCase()
  if (type === 'image') {
    const imageThumb = getImageThumbPath(dbPath, mediaId)
    return fs.existsSync(imageThumb) ? imageThumb : null
  }

  if (type === 'video' || !type) {
    const grid = getVideoGridPath(dbPath, mediaId)
    if (fs.existsSync(grid)) return grid
    const thumb = getVideoThumbPath(dbPath, mediaId)
    if (fs.existsSync(thumb)) return thumb
  }

  if (!type) {
    const imageThumb = getImageThumbPath(dbPath, mediaId)
    if (fs.existsSync(imageThumb)) return imageThumb
  }

  return null
}

function loadMediaPreviewRow(db: ApiDb, mediaId: number): MediaPreviewRow | null {
  return queryGet<MediaPreviewRow>(db, `
    SELECT
      m.id AS id,
      m.mediaTypeId AS mediaTypeId,
      mt.type AS mediaType
    FROM media m
    LEFT JOIN mediaTypes mt ON mt.id = m.mediaTypeId
    WHERE m.id = :mediaId
    LIMIT 1
  `, {mediaId}) || null
}

function listPreviewCandidateIds(db: ApiDb): number[] {
  const dbPath = String(db.path || '')
  if (!dbPath) return []

  const onDisk = new Set<number>()

  const collect = (dir: string) => {
    if (!fs.existsSync(dir)) return
    for (const name of fs.readdirSync(dir)) {
      const match = /^(\d+)\.jpg$/i.exec(name)
      if (match) onDisk.add(Number(match[1]))
    }
  }

  collect(path.join(dbPath, 'media/videos/grids'))
  collect(path.join(dbPath, 'media/videos/thumbs'))
  collect(path.join(dbPath, 'media/images/thumbs'))

  if (!onDisk.size) return []

  const rows = queryAll<{id: number}>(db, `
    SELECT m.id AS id
    FROM media m
    INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
    WHERE mt.type IN ('video', 'image')
  `)

  return rows.map((row) => Number(row.id)).filter((id) => onDisk.has(id))
}

function countEmbedded(db: ApiDb, candidateIds: number[]) {
  if (!candidateIds.length) return 0
  let count = 0
  for (const id of candidateIds) {
    if (!needsClipEmbeddingUpgrade(db, id)) count += 1
  }
  return count
}

async function getClipEmbeddingBackfillStatus(db: ApiDb) {
  const candidateIds = listPreviewCandidateIds(db)
  const total = candidateIds.length
  const embedded = countEmbedded(db, candidateIds)
  const model = getClipEmbeddingStatus(db)
  return {
    total,
    hashed: embedded,
    pending: Math.max(total - embedded, 0),
    modelStatus: model.status,
    model: model.model,
  }
}

function packedClipTileCount(embedding: Buffer | Uint8Array | null | undefined, dims: number): number {
  const bytes = embedding?.byteLength || 0
  const perVector = Math.floor(Number(dims)) * 4
  if (!bytes || !Number.isFinite(perVector) || perVector <= 0) return 0
  return Math.floor(bytes / perVector)
}

function expectedClipTileCountForPreview(previewPath: string | null): number {
  if (!previewPath) return 0
  return isVideoGridPreviewPath(previewPath) ? VIDEO_GRID_TILE_COUNT : 1
}

/**
 * Recent videos that still need grids / CLIP — small sample for instant Find scene wow.
 * Prefer missing grids, then embeddings that are not full 9-tile yet.
 */
function listVisualSearchQuickSampleIds(
  db: ApiDb,
  limit?: number | null,
): number[] {
  const max = clampVisualSearchQuickSampleSize(limit)
  const dbPath = String(db.path || '')
  const scan = Math.min(max * 10, 500)
  const rows = queryAll<{id: number}>(db, `
    SELECT m.id AS id
    FROM media m
    INNER JOIN mediaTypes mt ON mt.id = m.mediaTypeId
    WHERE mt.type = 'video'
    ORDER BY m.id DESC
    LIMIT :scan
  `, {scan})

  const missingGrid: number[] = []
  const needsUpgrade: number[] = []
  for (const row of rows) {
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) continue
    const gridPath = getVideoGridPath(dbPath, id)
    if (!dbPath || !fs.existsSync(gridPath)) {
      missingGrid.push(id)
    } else if (needsClipEmbeddingUpgrade(db, id)) {
      needsUpgrade.push(id)
    }
    if (missingGrid.length >= max) break
  }

  return [...missingGrid, ...needsUpgrade].slice(0, max)
}

function needsClipEmbeddingUpgrade(db: ApiDb, mediaId: number): boolean {
  const row = loadMediaPreviewRow(db, mediaId)
  if (!row) return false
  const previewPath = resolvePreviewImagePath(db, mediaId, row.mediaType)
  const expected = expectedClipTileCountForPreview(previewPath)
  if (!expected) return false

  const stored = queryGet<StoredEmbeddingRow>(db, `
    SELECT mediaId, embedding, dims, model
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId, model: CLIP_EMBEDDING_INDEX_KEY})

  if (!stored) return true
  return packedClipTileCount(stored.embedding, Number(stored.dims)) < expected
}

function persistEmbeddings(db: ApiDb, mediaId: number, embeddings: ClipEmbeddingVector[]) {
  if (!embeddings.length) return
  const dims = embeddings[0].length
  const packed = packFloat32Embeddings(embeddings)
  const {text, params} = bindNamedParameters(`
    INSERT INTO mediaClipEmbeddings (mediaId, embedding, dims, model, updatedAt)
    VALUES (:mediaId, :embedding, :dims, :model, :updatedAt)
    ON CONFLICT(mediaId) DO UPDATE SET
      embedding = excluded.embedding,
      dims = excluded.dims,
      model = excluded.model,
      updatedAt = excluded.updatedAt
  `, {
    mediaId,
    embedding: packed,
    dims,
    model: CLIP_EMBEDDING_INDEX_KEY,
    updatedAt: nowIso(),
  })
  db.sqlite.prepare(text).run(...params)
}

async function embedPreviewPath(db: ApiDb, previewPath: string): Promise<ClipEmbeddingVector[]> {
  if (isVideoGridPreviewPath(previewPath)) {
    return embedClipImageTiles(
      db,
      previewPath,
      VIDEO_GRID_SPRITE.cols,
      VIDEO_GRID_SPRITE.rows,
    )
  }

  const embedding = await embedClipImageFile(db, previewPath)
  return embedding.length ? [embedding] : []
}

async function upsertClipEmbeddingForMedia(db: ApiDb, mediaId: number) {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return null

  const row = loadMediaPreviewRow(db, id)
  if (!row) return null

  const previewPath = resolvePreviewImagePath(db, id, row.mediaType)
  if (!previewPath) return null

  const embeddings = await embedPreviewPath(db, previewPath)
  if (!embeddings.length) return null

  persistEmbeddings(db, id, embeddings)
  return {
    mediaId: id,
    dims: embeddings[0].length,
    tileCount: embeddings.length,
    path: previewPath,
  }
}

function findNextClipBackfillId(
  db: ApiDb,
  lastId: number,
  force: boolean,
  candidateIds: number[],
): number | null {
  if (!candidateIds.length) return null

  const nextIds = candidateIds
    .filter((id) => id > lastId)
    .sort((a, b) => a - b)

  for (const id of nextIds) {
    if (force || needsClipEmbeddingUpgrade(db, id)) return id
  }

  return null
}

async function* iterateClipEmbeddingBackfill(
  db: ApiDb,
  {
    shouldStop = (): boolean => false,
    force = false,
    mediaIds,
  }: {
    shouldStop?: () => boolean
    force?: boolean
    mediaIds?: Array<number | string>
  } = {},
) {
  const allCandidates = listPreviewCandidateIds(db)
  const requested = Array.isArray(mediaIds)
    ? [...new Set(mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
    : null
  const candidateIds = requested?.length
    ? allCandidates.filter((id) => requested.includes(id))
    : allCandidates

  const status = requested?.length
    ? {
      total: candidateIds.length,
      pending: force
        ? candidateIds.length
        : candidateIds.filter((id) => needsClipEmbeddingUpgrade(db, id)).length,
    }
    : await getClipEmbeddingBackfillStatus(db)
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
    const mediaId = findNextClipBackfillId(db, lastId, force, candidateIds)
    if (mediaId == null) break

    lastId = mediaId
    processed += 1

    try {
      const result = await upsertClipEmbeddingForMedia(db, mediaId)
      if (result) {
        hashed += 1
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
          id: mediaId,
          status: 'hashed',
        }
      } else {
        missing += 1
        yield {
          type: 'progress',
          processed,
          total,
          remaining: Math.max(total - processed, 0),
          hashed,
          missing,
          failed,
          skipped,
          id: mediaId,
          status: 'missing',
        }
      }
    } catch (error: unknown) {
      failed += 1
      yield {
        type: 'progress',
        processed,
        total,
        remaining: Math.max(total - processed, 0),
        hashed,
        missing,
        failed,
        skipped,
        id: mediaId,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      }
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

function loadStoredEmbeddings(
  db: ApiDb,
  mediaTypeId?: number | null,
): Array<{id: number; embeddings: ClipEmbeddingVector[]}> {
  const typeClause = mediaTypeId != null && Number.isFinite(Number(mediaTypeId)) && Number(mediaTypeId) > 0
    ? 'AND m.mediaTypeId = :mediaTypeId'
    : ''

  const rows = queryAll<StoredEmbeddingRow & {mediaTypeId?: number}>(db, `
    SELECT
      e.mediaId AS mediaId,
      e.embedding AS embedding,
      e.dims AS dims,
      e.model AS model
    FROM mediaClipEmbeddings e
    INNER JOIN media m ON m.id = e.mediaId
    WHERE e.model = :model
      ${typeClause}
  `, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    ...(typeClause ? {mediaTypeId: Number(mediaTypeId)} : {}),
  })

  return rows
    .map((row) => ({
      id: Number(row.mediaId),
      embeddings: unpackFloat32Embeddings(row.embedding, Number(row.dims)),
    }))
    .filter((row) => row.id > 0 && row.embeddings.some((embedding) => embedding.length > 0))
}

function countMissingEmbeddings(db: ApiDb, mediaTypeId?: number | null) {
  const typeClause = mediaTypeId != null && Number.isFinite(Number(mediaTypeId)) && Number(mediaTypeId) > 0
    ? 'AND m.mediaTypeId = :mediaTypeId'
    : ''

  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    FROM media m
    INNER JOIN mediaTypes mt ON mt.id = m.mediaTypeId
    WHERE mt.type IN ('video', 'image')
      ${typeClause}
      AND NOT EXISTS (
        SELECT 1 FROM mediaClipEmbeddings e
        WHERE e.mediaId = m.id AND e.model = :model
      )
  `, {
    model: CLIP_EMBEDDING_INDEX_KEY,
    ...(typeClause ? {mediaTypeId: Number(mediaTypeId)} : {}),
  })

  return Number(row?.count || 0)
}

async function semanticSearchMedia(
  db: ApiDb,
  {
    query,
    mediaTypeId = null,
    limit = DEFAULT_LIMIT,
    locale = null,
  }: {
    query: string
    mediaTypeId?: number | null
    limit?: number
    locale?: string | null
  },
) {
  const text = String(query || '').trim()
  const modelStatus = getClipEmbeddingStatus(db).status

  let missingEmbeddingsCount = 0
  let previewCandidatesCount = 0
  let candidates: Array<{id: number; embeddings: ClipEmbeddingVector[]}> = []
  try {
    missingEmbeddingsCount = countMissingEmbeddings(db, mediaTypeId)
    previewCandidatesCount = listPreviewCandidateIds(db).length
    candidates = loadStoredEmbeddings(db, mediaTypeId)
  } catch (error: unknown) {
    return {
      ids: [] as number[],
      hits: [] as SemanticSearchHit[],
      seekableCount: 0,
      missingEmbeddingsCount: 0,
      indexedCount: 0,
      previewCandidatesCount: 0,
      originalQuery: text,
      searchQuery: text,
      translated: false,
      sourceLang: null as string | null,
      modelStatus,
      error: error instanceof Error ? error.message : String(error),
    }
  }

  const indexedCount = candidates.length
  const emptyMeta = {
    originalQuery: text,
    searchQuery: text,
    translated: false as boolean,
    sourceLang: null as string | null,
    modelStatus,
  }

  if (!text) {
    return {
      ids: [] as number[],
      hits: [] as SemanticSearchHit[],
      seekableCount: 0,
      missingEmbeddingsCount,
      indexedCount,
      previewCandidatesCount,
      ...emptyMeta,
    }
  }

  let prepared
  try {
    prepared = await translateQueryToEnglish(db, text, {locale})
  } catch {
    prepared = {
      query: text,
      originalQuery: text,
      translated: false,
      sourceLang: null as string | null,
      model: null,
    }
  }

  const queryMeta = {
    originalQuery: prepared.originalQuery,
    searchQuery: prepared.query,
    translated: prepared.translated,
    sourceLang: prepared.sourceLang,
    modelStatus: getClipEmbeddingStatus(db).status,
  }

  try {
    const queryEmbedding = await embedClipText(db, prepared.query)
    if (!queryEmbedding.length) {
      return {
        ids: [] as number[],
        hits: [] as SemanticSearchHit[],
        seekableCount: 0,
        missingEmbeddingsCount,
        indexedCount,
        previewCandidatesCount,
        ...queryMeta,
      }
    }

    const ranked = rankByMaxCosineSimilarityHits(
      queryEmbedding,
      candidates,
      clampLimit(limit),
    )
    const ids = ranked.map((row) => row.id)
    const candidatesById = new Map(
      candidates.map((candidate) => [candidate.id, candidate] as const),
    )
    const durations = loadVideoDurations(db, ids)
    const hits = buildSemanticHits(ranked, candidatesById, durations)

    return {
      ids,
      hits,
      seekableCount: countSeekableSemanticHits(hits),
      missingEmbeddingsCount,
      indexedCount,
      previewCandidatesCount,
      ...queryMeta,
    }
  } catch (error: unknown) {
    return {
      ids: [] as number[],
      hits: [] as SemanticSearchHit[],
      seekableCount: 0,
      missingEmbeddingsCount,
      indexedCount,
      previewCandidatesCount,
      ...queryMeta,
      modelStatus: getClipEmbeddingStatus(db).status,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

async function findSimilarByClip(
  db: ApiDb,
  seedId: number,
  options: {limit?: number} = {},
) {
  const id = Number(seedId)
  if (!Number.isFinite(id) || id <= 0) {
    return {seedId: id, hasEmbedding: false, seedTileCount: 0, ids: [] as number[]}
  }

  const seedRow = queryGet<StoredEmbeddingRow>(db, `
    SELECT mediaId, embedding, dims, model
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId: id, model: CLIP_EMBEDDING_INDEX_KEY})

  if (!seedRow) {
    // Try to create on demand from preview.
    try {
      await upsertClipEmbeddingForMedia(db, id)
    } catch {
      // fall through
    }
  }

  const refreshed = seedRow || queryGet<StoredEmbeddingRow>(db, `
    SELECT mediaId, embedding, dims, model
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId: id, model: CLIP_EMBEDDING_INDEX_KEY})

  if (!refreshed) {
    return {seedId: id, hasEmbedding: false, seedTileCount: 0, ids: [] as number[]}
  }

  const seedEmbeddings = unpackFloat32Embeddings(refreshed.embedding, Number(refreshed.dims))
  if (!seedEmbeddings.length) {
    return {seedId: id, hasEmbedding: false, seedTileCount: 0, ids: [] as number[]}
  }

  const media = loadMediaPreviewRow(db, id)
  const candidates = loadStoredEmbeddings(db, media?.mediaTypeId ?? null)
    .filter((row) => row.id !== id)

  const neighborIds = rankByMaxPairwiseCosineSimilarity(
    seedEmbeddings,
    candidates,
    Math.max(clampLimit(options.limit) - 1, 0),
  )

  return {
    seedId: id,
    hasEmbedding: true,
    seedTileCount: seedEmbeddings.length,
    ids: [id, ...neighborIds],
  }
}

export {
  CLIP_EMBEDDING_INDEX_KEY,
  buildSemanticHits,
  countSeekableSemanticHits,
  findSimilarByClip,
  getClipEmbeddingBackfillStatus,
  iterateClipEmbeddingBackfill,
  isVideoGridPreviewPath,
  listVisualSearchQuickSampleIds,
  resolvePreviewImagePath,
  semanticSearchMedia,
  upsertClipEmbeddingForMedia,
}
