import type {ApiDb} from '../types/db'
import fs from 'fs'
import path from 'path'
import {queryAll, queryGet, bindNamedParameters} from '../db/utils/rawQuery'
import {chunkArray} from '../db/utils/chunk'
import {
  packFloat32Embedding,
  unpackFloat32Embedding,
  rankByCosineSimilarity,
  type ClipEmbeddingVector,
} from './clipEmbeddingMath'
import {
  CLIP_EMBEDDING_MODEL,
  embedClipImageFile,
  embedClipText,
} from './clipEmbeddingModel'
import {translateQueryToEnglish} from './semanticQueryTranslate'

const DEFAULT_LIMIT = 500
const MAX_LIMIT = 1000

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
  for (const chunk of chunkArray(candidateIds)) {
    const rows = queryAll<{count: number}>(db, `
      SELECT COUNT(*) AS count
      FROM mediaClipEmbeddings
      WHERE mediaId IN (:ids)
        AND model = :model
    `, {ids: chunk, model: CLIP_EMBEDDING_MODEL})
    count += Number(rows[0]?.count || 0)
  }
  return count
}

async function getClipEmbeddingBackfillStatus(db: ApiDb) {
  const candidateIds = listPreviewCandidateIds(db)
  const total = candidateIds.length
  const embedded = countEmbedded(db, candidateIds)
  return {
    total,
    hashed: embedded,
    pending: Math.max(total - embedded, 0),
  }
}

function persistEmbedding(db: ApiDb, mediaId: number, embedding: ClipEmbeddingVector) {
  const packed = packFloat32Embedding(embedding)
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
    dims: embedding.length,
    model: CLIP_EMBEDDING_MODEL,
    updatedAt: nowIso(),
  })
  db.sqlite.prepare(text).run(...params)
}

async function upsertClipEmbeddingForMedia(db: ApiDb, mediaId: number) {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return null

  const row = loadMediaPreviewRow(db, id)
  if (!row) return null

  const previewPath = resolvePreviewImagePath(db, id, row.mediaType)
  if (!previewPath) return null

  const embedding = await embedClipImageFile(db, previewPath)
  if (!embedding.length) return null

  persistEmbedding(db, id, embedding)
  return {mediaId: id, dims: embedding.length, path: previewPath}
}

function findNextClipBackfillId(
  db: ApiDb,
  lastId: number,
  force: boolean,
  candidateIds: number[],
): number | null {
  if (!candidateIds.length) return null

  const pendingClause = force
    ? ''
    : `AND NOT EXISTS (
         SELECT 1 FROM mediaClipEmbeddings e
         WHERE e.mediaId = m.id AND e.model = :model
       )`

  const row = queryGet<{id: number}>(db, `
    SELECT m.id AS id
    FROM media m
    WHERE m.id > :lastId
      AND m.id IN (:ids)
      ${pendingClause}
    ORDER BY m.id
    LIMIT 1
  `, {
    lastId,
    ids: candidateIds,
    ...(force ? {} : {model: CLIP_EMBEDDING_MODEL}),
  })

  return row ? Number(row.id) : null
}

async function* iterateClipEmbeddingBackfill(
  db: ApiDb,
  {
    shouldStop = (): boolean => false,
    force = false,
  }: {
    shouldStop?: () => boolean
    force?: boolean
  } = {},
) {
  const candidateIds = listPreviewCandidateIds(db)
  const status = await getClipEmbeddingBackfillStatus(db)
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
): Array<{id: number; embedding: ClipEmbeddingVector}> {
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
    model: CLIP_EMBEDDING_MODEL,
    ...(typeClause ? {mediaTypeId: Number(mediaTypeId)} : {}),
  })

  return rows
    .map((row) => ({
      id: Number(row.mediaId),
      embedding: unpackFloat32Embedding(row.embedding),
    }))
    .filter((row) => row.id > 0 && row.embedding.length > 0)
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
    model: CLIP_EMBEDDING_MODEL,
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
  const missingEmbeddingsCount = countMissingEmbeddings(db, mediaTypeId)
  const previewCandidatesCount = listPreviewCandidateIds(db).length
  const candidates = loadStoredEmbeddings(db, mediaTypeId)
  const indexedCount = candidates.length

  const emptyMeta = {
    originalQuery: text,
    searchQuery: text,
    translated: false as boolean,
    sourceLang: null as string | null,
  }

  if (!text) {
    return {
      ids: [] as number[],
      missingEmbeddingsCount,
      indexedCount,
      previewCandidatesCount,
      ...emptyMeta,
    }
  }

  const prepared = await translateQueryToEnglish(db, text, {locale})
  const queryMeta = {
    originalQuery: prepared.originalQuery,
    searchQuery: prepared.query,
    translated: prepared.translated,
    sourceLang: prepared.sourceLang,
  }

  const queryEmbedding = await embedClipText(db, prepared.query)
  if (!queryEmbedding.length) {
    return {
      ids: [] as number[],
      missingEmbeddingsCount,
      indexedCount,
      previewCandidatesCount,
      ...queryMeta,
    }
  }

  const ids = rankByCosineSimilarity(queryEmbedding, candidates, clampLimit(limit))
  return {
    ids,
    missingEmbeddingsCount,
    indexedCount,
    previewCandidatesCount,
    ...queryMeta,
  }
}

async function findSimilarByClip(
  db: ApiDb,
  seedId: number,
  options: {limit?: number} = {},
) {
  const id = Number(seedId)
  if (!Number.isFinite(id) || id <= 0) {
    return {seedId: id, hasEmbedding: false, ids: [] as number[]}
  }

  const seedRow = queryGet<StoredEmbeddingRow>(db, `
    SELECT mediaId, embedding, dims, model
    FROM mediaClipEmbeddings
    WHERE mediaId = :mediaId AND model = :model
    LIMIT 1
  `, {mediaId: id, model: CLIP_EMBEDDING_MODEL})

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
  `, {mediaId: id, model: CLIP_EMBEDDING_MODEL})

  if (!refreshed) {
    return {seedId: id, hasEmbedding: false, ids: [] as number[]}
  }

  const seedEmbedding = unpackFloat32Embedding(refreshed.embedding)
  if (!seedEmbedding.length) {
    return {seedId: id, hasEmbedding: false, ids: [] as number[]}
  }

  const media = loadMediaPreviewRow(db, id)
  const candidates = loadStoredEmbeddings(db, media?.mediaTypeId ?? null)
    .filter((row) => row.id !== id)

  const neighborIds = rankByCosineSimilarity(
    seedEmbedding,
    candidates,
    Math.max(clampLimit(options.limit) - 1, 0),
  )

  return {
    seedId: id,
    hasEmbedding: true,
    ids: [id, ...neighborIds],
  }
}

export {
  findSimilarByClip,
  getClipEmbeddingBackfillStatus,
  iterateClipEmbeddingBackfill,
  resolvePreviewImagePath,
  semanticSearchMedia,
  upsertClipEmbeddingForMedia,
}
