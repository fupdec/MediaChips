import type { ApiDb } from '../types/db'
import { queryGet } from '../db/utils/rawQuery'
import { createMediaRepository } from '../db/repositories/media'
import { resolveExistingPath } from './contentHash'
import {
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

/** All media large enough for oshash. */
const OSHASH_SCOPE_SQL = `
  (m.filesize > 8)
`

const FINGERPRINT_SCOPE_SQL = OSHASH_SCOPE_SQL

const PENDING_OSHASH_SQL = `
  AND ${OSHASH_SCOPE_SQL}
  AND (m.oshash IS NULL OR m.oshash = '')
`

const PENDING_FINGERPRINT_SQL = PENDING_OSHASH_SQL

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

  return {
    total: oshashTotal,
    pending: oshashPending,
    hashed: oshashTotal - oshashPending,
    byKind: {
      oshash: {
        total: oshashTotal,
        pending: oshashPending,
        hashed: oshashTotal - oshashPending,
      },
      contentHash: {
        total: 0,
        pending: 0,
        hashed: 0,
      },
    },
  }
}

/** Legacy content-hash settings panel — SHA-256 fingerprinting is retired. */
async function getContentHashBackfillStatus(_db: ApiDb) {
  return {total: 0, pending: 0, hashed: 0}
}

/** Status for the oshash / fingerprint settings panel. */
async function getOshashBackfillStatus(db: ApiDb) {
  const total = countSql(db, `AND ${OSHASH_SCOPE_SQL}`)
  const pending = countSql(db, PENDING_OSHASH_SQL)
  return {total, pending, hashed: total - pending}
}

function pendingFilterForKind(kind: FingerprintKind | 'all' | 'contentHash', force: boolean): string {
  if (kind === 'contentHash') {
    return 'AND 0 = 1'
  }

  if (force) {
    return `AND ${FINGERPRINT_SCOPE_SQL}`
  }

  return PENDING_FINGERPRINT_SQL
}

function findNextForFingerprintBackfill(
  db: ApiDb,
  lastId: number,
  force = false,
  kind: FingerprintKind | 'all' | 'contentHash' = 'all',
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
  kind: FingerprintKind | 'all' | 'contentHash' = 'all',
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
    kind?: FingerprintKind | 'all' | 'contentHash'
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
  getFingerprintBackfillStatus,
  getContentHashBackfillStatus,
  getOshashBackfillStatus,
  backfillMediaFingerprint,
  iterateFingerprintBackfill,
  iterateOshashBackfill,
  iterateContentHashBackfill,
}
