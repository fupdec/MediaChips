import type {ApiDb} from '../types/db'
import {queryGet} from '../db/utils/rawQuery'
import {createMediaRepository} from '../db/repositories/media'
import {resolveExistingPath} from './contentHash'
import {
  resolveMediaCreatedAt,
  type MediaCreatedKind,
} from './mediaSystemDates'

interface MediaCreatedRow {
  id: number
  path: string
  mediaType: string | null
}

const MEDIA_SQL = `
  FROM media m
  LEFT JOIN mediaTypes mt ON m.mediaTypeId = mt.id
`

const PENDING_SQL = `
  AND (m.mediaCreatedAt IS NULL OR TRIM(m.mediaCreatedAt) = '')
`

function mediaKindFromType(mediaType: string | null | undefined): MediaCreatedKind {
  const type = String(mediaType || '').toLowerCase()
  if (type === 'image') return 'image'
  if (type === 'video') return 'video'
  if (type === 'audio') return 'audio'
  return 'other'
}

async function getMediaCreatedBackfillStatus(db: ApiDb) {
  const totalRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${MEDIA_SQL}
  `)
  const pendingRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${MEDIA_SQL}
    WHERE 1=1
    ${PENDING_SQL}
  `)

  const total = Number(totalRow?.count || 0)
  const pending = Number(pendingRow?.count || 0)

  return {
    total,
    pending,
    filled: Math.max(total - pending, 0),
  }
}

function findNextMediaForCreatedBackfill(
  db: ApiDb,
  lastId: number,
  force = false,
): MediaCreatedRow | undefined {
  const pendingFilter = force ? '' : PENDING_SQL

  return queryGet<MediaCreatedRow>(db, `
    SELECT m.id, m.path, mt.type AS mediaType
    ${MEDIA_SQL}
    WHERE m.id > :lastId
    ${pendingFilter}
    ORDER BY m.id
    LIMIT 1
  `, {lastId})
}

function countMediaForCreatedBackfill(db: ApiDb, force = false): number {
  if (force) {
    const row = queryGet<{count: number}>(db, `
      SELECT COUNT(*) AS count
      ${MEDIA_SQL}
    `)
    return Number(row?.count || 0)
  }

  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${MEDIA_SQL}
    WHERE 1=1
    ${PENDING_SQL}
  `)
  return Number(row?.count || 0)
}

async function backfillMediaCreatedAt(db: ApiDb, media: MediaCreatedRow) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const mediaPath = String(media.path || '')
  const resolvedPath = await resolveExistingPath(mediaPath)

  if (!resolvedPath) {
    return {
      status: 'missing' as const,
      id: media.id,
      path: mediaPath,
    }
  }

  const mediaCreatedAt = await resolveMediaCreatedAt(
    resolvedPath,
    mediaKindFromType(media.mediaType),
  )

  if (!mediaCreatedAt) {
    return {
      status: 'failed' as const,
      id: media.id,
      path: mediaPath,
    }
  }

  mediaRepo.updateById(Number(media.id), {mediaCreatedAt})

  return {
    status: 'updated' as const,
    id: media.id,
    path: mediaPath,
  }
}

async function* iterateMediaCreatedBackfill(
  db: ApiDb,
  {shouldStop = (): boolean => false, force = false}: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  const total = countMediaForCreatedBackfill(db, force)

  let processed = 0
  let updated = 0
  let missing = 0
  let failed = 0
  let lastId = 0

  yield {
    type: 'progress',
    processed,
    total,
    remaining: total,
    updated,
    missing,
    failed,
  }

  while (!shouldStop()) {
    const media = findNextMediaForCreatedBackfill(db, lastId, force)
    if (!media) break

    lastId = Number(media.id)
    const result = await backfillMediaCreatedAt(db, media)
    processed += 1

    if (result.status === 'updated') updated += 1
    else if (result.status === 'missing') missing += 1
    else failed += 1

    yield {
      type: 'progress',
      processed,
      total,
      remaining: Math.max(total - processed, 0),
      updated,
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
    updated,
    missing,
    failed,
    stopped: shouldStop(),
  }
}

export {
  getMediaCreatedBackfillStatus,
  backfillMediaCreatedAt,
  iterateMediaCreatedBackfill,
  mediaKindFromType,
}
