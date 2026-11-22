import type {ApiDb} from '../types/db'
import {chunkArray} from '../db/utils/chunk'

/** Aggregate the explicit selection, independent of the current page or filters. */
export function getMediaSelectionStats(db: Pick<ApiDb, 'sqlite'>, ids: number[]) {
  const uniqueIds = [...new Set(ids)]
  let count = 0
  let filesize = 0
  let unknownSize = 0
  for (const batch of chunkArray(uniqueIds, 500)) {
    const row = db.sqlite.prepare(`
      SELECT COUNT(*) AS count, COALESCE(SUM(filesize), 0) AS filesize,
             COALESCE(SUM(CASE WHEN filesize IS NULL THEN 1 ELSE 0 END), 0) AS unknownSize
      FROM media WHERE id IN (${batch.map(() => '?').join(',')})
    `).get(...batch) as {count: number; filesize: number; unknownSize: number}
    count += row.count
    filesize += row.filesize
    unknownSize += row.unknownSize
  }
  /** `missing` = requested IDs no longer in the library; `unknownSize` = files without a recorded size. */
  return {count, filesize, missing: uniqueIds.length - count, unknownSize}
}
