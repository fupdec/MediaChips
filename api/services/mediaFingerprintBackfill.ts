import type { ApiDb } from '../types/db'
import { queryGet } from '../db/utils/rawQuery'
import { createMediaRepository } from '../db/repositories/media'
import { resolveExistingPath } from './contentHash'
import {
  FINGERPRINT_SIZE_THRESHOLD_BYTES,
  computeFingerprint,
  type FingerprintKind,
} from './mediaFingerprint'

interface FingerprintMediaRow {
  id: number
  path: string
  filesize: number
  mediaType: string | null
  oshash: string | null
  contentHash: string | null
}

const MEDIA_WITH_TYPE_SQL = `
  FROM media m
  INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
`

/** Rows that should store oshash under the hybrid policy. */
const OSHASH_SCOPE_SQL = `
  (
    (LOWER(COALESCE(mt.type, '')) = 'video' AND m.filesize > 8)
    OR (
      LOWER(COALESCE(mt.type, '')) != 'video'
      AND m.filesize > ${FINGERPRINT_SIZE_THRESHOLD_BYTES}
    )
  )
`

/** Rows that should store contentHash (sha256) under the hybrid policy. */
const CONTENT_HASH_SCOPE_SQL = `
  (
    LOWER(COALESCE(mt.type, '')) != 'video'
    AND m.filesize > 0
    AND m.filesize <= ${FINGERPRINT_SIZE_THRESHOLD_BYTES}
  )
`

const FINGERPRINT_SCOPE_SQL = `
  (${OSHASH_SCOPE_SQL} OR ${CONTENT_HASH_SCOPE_SQL})
`

const PENDING_OSHASH_SQL = `
  AND ${OSHASH_SCOPE_SQL}
  AND (m.oshash IS NULL OR m.oshash = '')
`

const PENDING_CONTENT_HASH_SQL = `
  AND ${CONTENT_HASH_SCOPE_SQL}
  AND (m.contentHash IS NULL OR m.contentHash = '')
`

const PENDING_FINGERPRINT_SQL = `
  AND (
    (
      ${OSHASH_SCOPE_SQL}
      AND (m.oshash IS NULL OR m.oshash = '')
    )
    OR (
      ${CONTENT_HASH_SCOPE_SQL}
      AND (m.contentHash IS NULL OR m.contentHash = '')
    )
  )
`

function countSql(db: ApiDb, whereExtra = ''): number {
  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${MEDIA_WITH_TYPE_SQL}
    WHERE 1 = 1
    ${whereExtra}
  `)
  return Number(row?.count || 0)
}

async function getFingerprintBackfillStatus(db: ApiDb) {
  const oshashTotal = countSql(db, `AND ${OSHASH_SCOPE_SQL}`)
  const oshashPending = countSql(db, PENDING_OSHASH_SQL)
  const contentHashTotal = countSql(db, `AND ${CONTENT_HASH_SCOPE_SQL}`)
  const contentHashPending = countSql(db, PENDING_CONTENT_HASH_SQL)

  const total = oshashTotal + contentHashTotal
  const pending = oshashPending + contentHashPending

  return {
    total,
    pending,
    hashed: total - pending,
    byKind: {
      oshash: {
        total: oshashTotal,
        pending: oshashPending,
        hashed: oshashTotal - oshashPending,
      },
      contentHash: {
        total: contentHashTotal,
        pending: contentHashPending,
        hashed: contentHashTotal - contentHashPending,
      },
    },
  }
}

/** Policy-scoped status for the legacy content-hash settings panel. */
async function getContentHashBackfillStatus(db: ApiDb) {
  const total = countSql(db, `AND ${CONTENT_HASH_SCOPE_SQL}`)
  const pending = countSql(db, PENDING_CONTENT_HASH_SQL)
  return {total, pending, hashed: total - pending}
}

/** Policy-scoped status for the legacy oshash settings panel (video + large non-video). */
async function getOshashBackfillStatus(db: ApiDb) {
  const total = countSql(db, `AND ${OSHASH_SCOPE_SQL}`)
  const pending = countSql(db, PENDING_OSHASH_SQL)
  return {total, pending, hashed: total - pending}
}

function pendingFilterForKind(kind: FingerprintKind | 'all', force: boolean): string {
  if (force) {
    if (kind === 'oshash') return `AND ${OSHASH_SCOPE_SQL}`
    if (kind === 'contentHash') return `AND ${CONTENT_HASH_SCOPE_SQL}`
    return `AND ${FINGERPRINT_SCOPE_SQL}`
  }

  if (kind === 'oshash') return PENDING_OSHASH_SQL
  if (kind === 'contentHash') return PENDING_CONTENT_HASH_SQL
  return PENDING_FINGERPRINT_SQL
}

function findNextForFingerprintBackfill(
  db: ApiDb,
  lastId: number,
  force = false,
  kind: FingerprintKind | 'all' = 'all',
): FingerprintMediaRow | undefined {
  return queryGet<FingerprintMediaRow>(db, `
    SELECT
      m.id,
      m.path,
      m.filesize,
      mt.type AS mediaType,
      m.oshash,
      m.contentHash
    ${MEDIA_WITH_TYPE_SQL}
    WHERE m.id > :lastId
    ${pendingFilterForKind(kind, force)}
    ORDER BY m.id
    LIMIT 1
  `, {lastId})
}

function countForFingerprintBackfill(
  db: ApiDb,
  force = false,
  kind: FingerprintKind | 'all' = 'all',
): number {
  return countSql(db, pendingFilterForKind(kind, force))
}

async function backfillMediaFingerprint(
  db: ApiDb,
  media: FingerprintMediaRow,
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
    const fingerprint = await computeFingerprint({
      path: mediaPath,
      filesize: Number(media.filesize) || 0,
      mediaType: media.mediaType,
    })

    if (!fingerprint) {
      return {
        status: 'skipped' as const,
        id: media.id,
        path: mediaPath,
        message: 'no fingerprint kind for media',
      }
    }

    mediaRepo.updateById(Number(media.id), fingerprint.patch)

    return {
      status: 'hashed' as const,
      id: media.id,
      path: mediaPath,
      kind: fingerprint.kind,
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

async function* iterateFingerprintBackfill(
  db: ApiDb,
  {
    shouldStop = (): boolean => false,
    force = false,
    kind = 'all',
  }: {
    shouldStop?: () => boolean
    force?: boolean
    kind?: FingerprintKind | 'all'
  } = {},
) {
  const total = countForFingerprintBackfill(db, force, kind)

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
    const media = findNextForFingerprintBackfill(db, lastId, force, kind)

    if (!media) break

    lastId = Number(media.id)
    const result = await backfillMediaFingerprint(db, media)
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
      kind: 'kind' in result ? result.kind : undefined,
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

async function* iterateOshashBackfill(
  db: ApiDb,
  options: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  yield* iterateFingerprintBackfill(db, {...options, kind: 'oshash'})
}

async function* iterateContentHashBackfill(
  db: ApiDb,
  options: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  yield* iterateFingerprintBackfill(db, {...options, kind: 'contentHash'})
}

export {
  OSHASH_SCOPE_SQL,
  CONTENT_HASH_SCOPE_SQL,
  getFingerprintBackfillStatus,
  getContentHashBackfillStatus,
  getOshashBackfillStatus,
  backfillMediaFingerprint,
  iterateFingerprintBackfill,
  iterateOshashBackfill,
  iterateContentHashBackfill,
}
