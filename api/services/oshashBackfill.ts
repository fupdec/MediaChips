import type { ApiDb } from '../types/db'
import { queryGet } from '../db/utils/rawQuery'
import { createMediaRepository } from '../db/repositories/media'
import { computeOshashForPath } from './oshash'
import { resolveExistingPath } from './contentHash'

interface OshashMediaRow {
  id: number
  path: string
}

const VIDEO_MEDIA_SQL = `
  FROM media m
  INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
  WHERE mt.type = 'video'
    AND m.filesize > 8
`

const PENDING_OSHASH_SQL = `
  AND (m.oshash IS NULL OR m.oshash = '')
`

async function getOshashBackfillStatus(db: ApiDb) {
  const totalRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${VIDEO_MEDIA_SQL}
  `)
  const pendingRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${VIDEO_MEDIA_SQL}
    ${PENDING_OSHASH_SQL}
  `)

  const total = Number(totalRow?.count || 0)
  const pending = Number(pendingRow?.count || 0)

  return {
    total,
    pending,
    hashed: total - pending,
  }
}

function findNextVideoForOshashBackfill(
  db: ApiDb,
  lastId: number,
  force = false,
): OshashMediaRow | undefined {
  const pendingFilter = force ? '' : PENDING_OSHASH_SQL

  return queryGet<OshashMediaRow>(db, `
    SELECT m.id, m.path
    ${VIDEO_MEDIA_SQL}
    AND m.id > :lastId
    ${pendingFilter}
    ORDER BY m.id
    LIMIT 1
  `, {lastId})
}

function countVideosForOshashBackfill(db: ApiDb, force = false): number {
  if (force) {
    const row = queryGet<{count: number}>(db, `
      SELECT COUNT(*) AS count
      ${VIDEO_MEDIA_SQL}
    `)
    return Number(row?.count || 0)
  }

  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${VIDEO_MEDIA_SQL}
    ${PENDING_OSHASH_SQL}
  `)
  return Number(row?.count || 0)
}

async function backfillMediaOshash(
  db: ApiDb,
  media: OshashMediaRow,
) {
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

  try {
    const oshash = await computeOshashForPath(mediaPath)
    mediaRepo.updateById(Number(media.id), {oshash})

    return {
      status: 'hashed' as const,
      id: media.id,
      path: mediaPath,
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)

    if (/size <= 8/i.test(message)) {
      return {
        status: 'skipped' as const,
        id: media.id,
        path: mediaPath,
        message,
      }
    }

    return {
      status: 'failed' as const,
      id: media.id,
      path: mediaPath,
      message,
    }
  }
}

async function* iterateOshashBackfill(
  db: ApiDb,
  {shouldStop = (): boolean => false, force = false}: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  const total = countVideosForOshashBackfill(db, force)

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
    const media = findNextVideoForOshashBackfill(db, lastId, force)

    if (!media) break

    lastId = Number(media.id)
    const result = await backfillMediaOshash(db, media)
    processed += 1

    if (result.status === 'hashed') hashed += 1
    else if (result.status === 'missing') missing += 1
    else if (result.status === 'skipped') skipped += 1
    else failed += 1

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
      lastStatus: result.status,
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

export {
  getOshashBackfillStatus,
  backfillMediaOshash,
  iterateOshashBackfill,
}
