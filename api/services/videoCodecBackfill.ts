import type {ApiDb} from '../types/db'
import {queryGet} from '../db/utils/rawQuery'
import {createVideoMetadataRepository} from '../db/repositories/videoMetadata'
import {resolveExistingPath} from './contentHash'
import {probeVideoMetadata} from './videoMetadataProbe'

interface VideoCodecMediaRow {
  id: number
  path: string
}

const VIDEO_MEDIA_SQL = `
  FROM media m
  INNER JOIN mediaTypes mt ON m.mediaTypeId = mt.id
  WHERE mt.type = 'video'
`

const PENDING_CODEC_SQL = `
  AND (
    NOT EXISTS (SELECT 1 FROM videoMetadata vm WHERE vm.mediaId = m.id)
    OR EXISTS (
      SELECT 1 FROM videoMetadata vm
      WHERE vm.mediaId = m.id
        AND (vm.codec IS NULL OR vm.codec = '')
    )
  )
`

async function getVideoCodecBackfillStatus(db: ApiDb) {
  const totalRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${VIDEO_MEDIA_SQL}
  `)
  const pendingRow = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${VIDEO_MEDIA_SQL}
    ${PENDING_CODEC_SQL}
  `)

  const total = Number(totalRow?.count || 0)
  const pending = Number(pendingRow?.count || 0)

  return {
    total,
    pending,
    filled: total - pending,
  }
}

function findNextVideoForCodecBackfill(
  db: ApiDb,
  lastId: number,
  force = false,
): VideoCodecMediaRow | undefined {
  const pendingFilter = force ? '' : PENDING_CODEC_SQL

  return queryGet<VideoCodecMediaRow>(db, `
    SELECT m.id, m.path
    ${VIDEO_MEDIA_SQL}
    AND m.id > :lastId
    ${pendingFilter}
    ORDER BY m.id
    LIMIT 1
  `, {lastId})
}

function countVideosForCodecBackfill(db: ApiDb, force = false): number {
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
    ${PENDING_CODEC_SQL}
  `)
  return Number(row?.count || 0)
}

async function backfillVideoCodec(
  db: ApiDb,
  media: VideoCodecMediaRow,
) {
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const mediaPath = String(media.path || '')
  const resolvedPath = await resolveExistingPath(mediaPath)

  if (!resolvedPath) {
    return {
      status: 'missing' as const,
      id: media.id,
      path: mediaPath,
    }
  }

  const metadata = await probeVideoMetadata(resolvedPath)

  if (!metadata) {
    return {
      status: 'failed' as const,
      id: media.id,
      path: mediaPath,
    }
  }

  const existing = videoMetadataRepo.findByMediaId(Number(media.id))

  videoMetadataRepo.upsert({
    mediaId: Number(media.id),
    duration: metadata.duration,
    bitrate: metadata.bitrate,
    width: metadata.width,
    height: metadata.height,
    codec: metadata.codec,
    fps: metadata.fps,
    time: existing?.time ?? null,
  })

  return {
    status: 'updated' as const,
    id: media.id,
    path: mediaPath,
  }
}

async function* iterateVideoCodecBackfill(
  db: ApiDb,
  {shouldStop = (): boolean => false, force = false}: {shouldStop?: () => boolean; force?: boolean} = {},
) {
  const total = countVideosForCodecBackfill(db, force)

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
    const media = findNextVideoForCodecBackfill(db, lastId, force)

    if (!media) break

    lastId = Number(media.id)
    const result = await backfillVideoCodec(db, media)
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
  getVideoCodecBackfillStatus,
  backfillVideoCodec,
  iterateVideoCodecBackfill,
}
