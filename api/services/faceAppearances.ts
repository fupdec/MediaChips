import {parseFaceTimestampSeconds} from '../../shared/faceTimestamp'
import type {ApiDb} from '../types/db'
import {createFacesRepository, type FaceAppearanceRow} from '../db/repositories/faces'

export type FaceAppearanceItem = {
  id: number
  faceId: number
  key: string
  path: string
  name?: string
  basename?: string
  mediaTypeId?: number
  timestamp: string | null
  segmentStart: number
  matchScore: number | null
  cropPath: string | null
}

export type FaceAppearancesResponse = {
  items: FaceAppearanceItem[]
  count: number
}

function mapAppearanceRow(row: FaceAppearanceRow): FaceAppearanceItem {
  const segmentStart = parseFaceTimestampSeconds(row.timestamp) ?? 0
  return {
    id: Number(row.mediaId),
    faceId: Number(row.faceId),
    key: `face-${row.faceId}`,
    path: row.path,
    name: row.name || row.basename || undefined,
    basename: row.basename ?? undefined,
    mediaTypeId: row.mediaTypeId ?? undefined,
    timestamp: row.timestamp,
    segmentStart,
    matchScore: row.matchScore ?? null,
    cropPath: row.cropPath ?? null,
  }
}

export function listFacesForTag(
  db: ApiDb,
  tagId: number,
  options: {
    countOnly?: boolean
    sort?: 'time' | 'shuffle'
    limit?: number
    offset?: number
  } = {},
): FaceAppearancesResponse {
  const facesRepo = createFacesRepository(db.drizzle)
  const count = facesRepo.countByTagId(tagId)

  if (options.countOnly) {
    return {items: [], count}
  }

  const rows = facesRepo.findByTagId(tagId, {
    sort: options.sort === 'shuffle' ? 'shuffle' : 'time',
    limit: options.limit,
    offset: options.offset,
  })

  return {
    items: rows.map(mapAppearanceRow),
    count,
  }
}
