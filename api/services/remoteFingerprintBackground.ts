import type {ApiDb} from '../types/db'
import {createSettingsRepository} from '../db/repositories/settings'
import {pinSourceDb} from './mediaSources/context'
import {backfillMediaFingerprint} from './mediaFingerprintBackfill'
import {onLibraryRestoreStart, runLibraryBackgroundTask} from './libraryMaintenance'
import {readDuplicatePolicy} from './duplicateSimilarity'
import {DEFAULT_SIZE_CANDIDATE_MIN_BYTES} from '../../shared/duplicateSimilarity'
import {trackBackgroundWork} from './backgroundTasks'

export const REMOTE_OSHASH_SETTING = 'remoteOshashBackground'
const BATCH = 4
const HASHABLE_PATH_SQL = `(m.path LIKE 'nas://%' OR m.path LIKE 'gdrive://%'
  OR m.path LIKE 'onedrive://%' OR m.path LIKE 'dropbox://%' OR instr(m.path, '://') = 0)`
/**
 * Large cards without a fingerprint that share an exact byte size with another live card of the
 * same media type, largest first. Size only nominates the pair; oshash still decides the match.
 */
const SIZE_CANDIDATES_SQL = `
  SELECT m.id, m.path, m.filesize, m.oshash, m.contentHash, mt.type AS mediaType
  FROM media m INDEXED BY media_filesize_copy_discovery_idx
  LEFT JOIN mediaTypes mt ON mt.id = m.mediaTypeId
  WHERE m.filesize >= ? AND COALESCE(m.oshash, '') = '' AND COALESCE(m.deletedAt, '') = ''
    AND ${HASHABLE_PATH_SQL}
    AND EXISTS (
      SELECT 1 FROM media other INDEXED BY media_filesize_copy_discovery_idx
      WHERE other.filesize = m.filesize AND other.id != m.id AND other.mediaTypeId IS m.mediaTypeId
        AND COALESCE(other.deletedAt, '') = ''
    )
  ORDER BY m.filesize DESC, m.id
  LIMIT 64
`

/** Hash remote cards and older local cards of the same size and media type. Large same-size pairs go first. One bounded read job at a time. Failed cards are left for manual retry or the next application session. */
export function createRemoteFingerprintBackground(db: ApiDb, options: {
  backfill?: typeof backfillMediaFingerprint
} = {}) {
  const cursors = new WeakMap<object, number>()
  const attempted = new WeakMap<object, Set<string>>()
  let running = false, disposed = false
  let controller = new AbortController()
  const unsubscribe = onLibraryRestoreStart(() => controller.abort())
  return {
    async tick() {
      return runLibraryBackgroundTask(async () => {
        if (running || disposed) return
        running = true
        try {
          controller = new AbortController()
          const pinned = pinSourceDb(db), current = pinned.db
          const enabled = () => createSettingsRepository(current.drizzle).findByOption(REMOTE_OSHASH_SETTING)?.value !== '0'
          if (!enabled()) return
          let seen = attempted.get(current.sqlite)
          if (!seen) { seen = new Set(); attempted.set(current.sqlite, seen) }
          const hash = (row: Parameters<typeof backfillMediaFingerprint>[1]) => trackBackgroundWork('remoteFingerprint', async () => {
            await (options.backfill || backfillMediaFingerprint)(current, row, {
              signal: controller.signal,
              assertCurrent: () => {
                pinned.assertCurrent()
                if (!enabled()) throw new Error('Background fingerprinting disabled')
              },
            })
            pinned.assertCurrent()
          })
          let processed = 0
          const minBytes = readDuplicatePolicy(current).sizeCandidateMinBytes ?? DEFAULT_SIZE_CANDIDATE_MIN_BYTES
          if (minBytes > 0) {
            const candidates = current.sqlite.prepare(SIZE_CANDIDATES_SQL)
              .all(minBytes) as Parameters<typeof backfillMediaFingerprint>[1][]
            for (const row of candidates) {
              pinned.assertCurrent()
              if (disposed || controller.signal.aborted || !enabled()) return
              const identity = JSON.stringify([row.id, row.path, row.filesize])
              if (!row.mediaType || seen.has(identity)) continue
              await hash(row)
              seen.add(identity)
              if (++processed === BATCH) return
            }
          }
          const rows = current.sqlite.prepare(`
            WITH page AS MATERIALIZED (
              SELECT id, path, filesize, oshash, contentHash, mediaTypeId, deletedAt
              FROM media WHERE id > ? ORDER BY id LIMIT 256
            )
            SELECT m.id, m.path, m.filesize, m.oshash, m.contentHash, mt.type AS mediaType,
              (m.filesize > 8 AND COALESCE(m.oshash, '') = '' AND COALESCE(m.deletedAt, '') = ''
              AND (m.path LIKE 'nas://%' OR m.path LIKE 'gdrive://%'
                OR m.path LIKE 'onedrive://%' OR m.path LIKE 'dropbox://%'
                OR (instr(m.path, '://') = 0 AND EXISTS (
                  SELECT 1 FROM media remote INDEXED BY media_filesize_copy_discovery_idx
                  WHERE remote.filesize = m.filesize AND remote.mediaTypeId = m.mediaTypeId
                    AND COALESCE(remote.deletedAt, '') = ''
                    AND (remote.path LIKE 'nas://%' OR remote.path LIKE 'gdrive://%'
                      OR remote.path LIKE 'onedrive://%' OR remote.path LIKE 'dropbox://%')
                )))) AS eligible
            FROM page m LEFT JOIN mediaTypes mt ON mt.id = m.mediaTypeId
            ORDER BY m.id
          `).all(cursors.get(current.sqlite) || 0) as (Parameters<typeof backfillMediaFingerprint>[1] & {eligible: number})[]
          if (!rows.length) cursors.set(current.sqlite, 0)
          for (const row of rows) {
            pinned.assertCurrent()
            if (disposed || controller.signal.aborted || !enabled()) return
            const identity = JSON.stringify([row.id, row.path, row.filesize])
            if (!row.eligible || !row.mediaType || seen.has(identity)) {
              cursors.set(current.sqlite, row.id)
              continue
            }
            await hash(row)
            seen.add(identity)
            cursors.set(current.sqlite, row.id)
            if (++processed === BATCH) break
          }
        } finally { running = false }
      })
    },
    dispose() { disposed = true; controller.abort(); unsubscribe() },
  }
}
