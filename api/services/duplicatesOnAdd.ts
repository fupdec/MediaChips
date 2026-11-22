import type {ApiDb} from '../types/db'
import {createSettingsRepository} from '../db/repositories/settings'
import {pinSourceDb} from './mediaSources/context'
import {backfillMediaFingerprint} from './mediaFingerprintBackfill'
import {onLibraryRestoreStart, runLibraryBackgroundTask} from './libraryMaintenance'
import {createSimilarityTargetCache, findSimilarityGroupForTarget, readDuplicatePolicy, type SimilarityTargetCache} from './duplicateSimilarity'
import {mergeMediaItems} from './mediaMerge'
import {mapWithConcurrency} from './thumbEncoding'
import {apiErrorMessage} from '../types/errors'
import {
  DUPLICATES_ON_ADD_CURSOR_SETTING,
  DUPLICATES_ON_ADD_PAUSED_SETTING,
  DUPLICATES_ON_ADD_SETTING,
  type DuplicatesOnAddEvent,
  type DuplicatesOnAddStatus,
} from '../../shared/duplicatesOnAdd'

/** Cards per database read; the pass keeps going until nothing is pending. */
const BATCH = 24
/** Parallel fingerprint reads: NAS sessions are scarce, Drive and local files are not. */
const NAS_FINGERPRINT_CONCURRENCY = 3
const FINGERPRINT_CONCURRENCY = 8
const MAX_EVENTS = 200

type NewCardRow = {
  id: number
  path: string
  name: string | null
  filesize: number
  oshash: string | null
  contentHash: string | null
  mediaType: string | null
}

type RunStats = {checked: number; found: number; merged: number; current: string | null}

/**
 * Checks every card added after the feature was enabled against the maintenance similarity policy.
 * New cards are found by id watermark, so every import path (local, Drive, cloud, NAS, catalogs) is covered.
 * Auto-merge follows the maintenance policy; outcomes are events, progress is a status the UI polls and controls.
 */
export function createDuplicatesOnAdd(db: ApiDb, options: {
  backfill?: typeof backfillMediaFingerprint
  merge?: typeof mergeMediaItems
} = {}) {
  const logs = new WeakMap<object, {seq: number; events: DuplicatesOnAddEvent[]}>()
  const runs = new WeakMap<object, RunStats>()
  let running = false, disposed = false
  let controller = new AbortController()
  const unsubscribe = onLibraryRestoreStart(() => controller.abort())

  const log = (current: ApiDb) => {
    let entry = logs.get(current.sqlite)
    if (!entry) { entry = {seq: 0, events: []}; logs.set(current.sqlite, entry) }
    return entry
  }
  const run = (current: ApiDb) => {
    let entry = runs.get(current.sqlite)
    if (!entry) { entry = {checked: 0, found: 0, merged: 0, current: null}; runs.set(current.sqlite, entry) }
    return entry
  }
  const push = (current: ApiDb, event: Omit<DuplicatesOnAddEvent, 'seq' | 'at'>) => {
    const entry = log(current)
    entry.events.push({...event, seq: ++entry.seq, at: new Date().toISOString()})
    if (entry.events.length > MAX_EVENTS) entry.events.splice(0, entry.events.length - MAX_EVENTS)
    const stats = run(current)
    if (event.kind === 'merged') stats.merged += 1
    else stats.found += 1
  }
  const maxId = (current: ApiDb) =>
    Number((current.sqlite.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM media').get() as {id: number}).id)
  const settingsOf = (current: ApiDb) => createSettingsRepository(current.drizzle)
  const enabledIn = (current: ApiDb) => settingsOf(current).findByOption(DUPLICATES_ON_ADD_SETTING)?.value !== '0'
  const pausedIn = (current: ApiDb) => settingsOf(current).findByOption(DUPLICATES_ON_ADD_PAUSED_SETTING)?.value === '1'
  const cursorOf = (current: ApiDb): number | null => {
    const raw = settingsOf(current).findByOption(DUPLICATES_ON_ADD_CURSOR_SETTING)?.value
    const value = Number(raw)
    return raw == null || raw === '' || !Number.isFinite(value) ? null : value
  }
  const setCursor = (current: ApiDb, id: number) => settingsOf(current).upsertByOption(DUPLICATES_ON_ADD_CURSOR_SETTING, String(id))
  const pendingIn = (current: ApiDb, cursor: number) => Number((current.sqlite.prepare(
    "SELECT COUNT(*) AS n FROM media WHERE id > ? AND COALESCE(deletedAt, '') = ''").get(cursor) as {n: number}).n)

  const worker = {
    async tick() {
      return runLibraryBackgroundTask(async () => {
        if (running || disposed) return
        running = true
        try {
          controller = new AbortController()
          const pinned = pinSourceDb(db), current = pinned.db
          const cursor = cursorOf(current)
          // While disabled (or on first run) only move the watermark: an existing library is never re-scanned.
          if (!enabledIn(current) || cursor == null) {
            setCursor(current, maxId(current))
            runs.delete(current.sqlite)
            return
          }
          const stats = run(current)
          let cache = createSimilarityTargetCache()
          const stop = () => disposed || controller.signal.aborted || !enabledIn(current) || pausedIn(current)
          // Keep going while there is work: no idle wait between batches.
          for (;;) {
            if (stop()) return
            const from = cursorOf(current) ?? cursor
            const rows = current.sqlite.prepare(`
              SELECT m.id, m.path, m.name, m.filesize, m.oshash, m.contentHash, mt.type AS mediaType
              FROM media m LEFT JOIN mediaTypes mt ON mt.id = m.mediaTypeId
              WHERE m.id > ? AND COALESCE(m.deletedAt, '') = ''
              ORDER BY m.id LIMIT ?
            `).all(from, BATCH) as NewCardRow[]
            if (!rows.length) {
              // A finished run starts its counters over next time.
              runs.delete(current.sqlite)
              return
            }
            // Exact copies are matched by oshash; hash new cards first when the import did not.
            const unhashed = rows.filter(row => !row.oshash && Number(row.filesize) > 8 && row.mediaType)
            const hashRow = async (row: NewCardRow) => {
              if (stop()) return
              stats.current = row.name || row.path
              try {
                await (options.backfill || backfillMediaFingerprint)(current, row, {signal: controller.signal, assertCurrent: pinned.assertCurrent})
              } catch { /* Unreadable now: path, name and visual signals can still match. */ }
            }
            const isNas = (row: NewCardRow) => row.path.startsWith('nas://')
            await Promise.all([
              mapWithConcurrency(unhashed.filter(row => !isNas(row)), FINGERPRINT_CONCURRENCY, hashRow),
              mapWithConcurrency(unhashed.filter(isNas), NAS_FINGERPRINT_CONCURRENCY, hashRow),
            ])
            for (const row of rows) {
              pinned.assertCurrent()
              if (stop()) return
              // The cursor may have been moved by "skip" while this batch was hashing.
              if ((cursorOf(current) ?? 0) >= row.id) continue
              stats.current = row.name || row.path
              if (await checkCard(current, row, cache)) cache = createSimilarityTargetCache()
              setCursor(current, row.id)
              stats.checked += 1
            }
          }
        } finally {
          running = false
          const stats = runs.get(pinSourceDb(db).db.sqlite)
          if (stats) stats.current = null
        }
      })
    },
    /** Events newer than `after` plus the current status; `seq` lets the client resume after polling gaps. */
    events(after = 0) {
      const current = pinSourceDb(db).db
      const entry = log(current)
      return {seq: entry.seq, events: entry.events.filter(event => event.seq > after), status: worker.status()}
    },
    status(): DuplicatesOnAddStatus {
      const current = pinSourceDb(db).db
      const enabled = enabledIn(current)
      const cursor = cursorOf(current)
      const pending = enabled && cursor != null ? pendingIn(current, cursor) : 0
      const stats = runs.get(current.sqlite) || {checked: 0, found: 0, merged: 0, current: null}
      const paused = pausedIn(current)
      return {
        state: !enabled ? 'disabled' : pending === 0 ? 'idle' : paused ? 'paused' : 'running',
        pending, checked: stats.checked, found: stats.found, merged: stats.merged,
        current: paused ? null : stats.current,
      }
    },
    pause() {
      settingsOf(pinSourceDb(db).db).upsertByOption(DUPLICATES_ON_ADD_PAUSED_SETTING, '1')
      controller.abort()
      return worker.status()
    },
    resume() {
      settingsOf(pinSourceDb(db).db).upsertByOption(DUPLICATES_ON_ADD_PAUSED_SETTING, '0')
      void worker.tick().catch(() => {})
      return worker.status()
    },
    /** Marks every pending card as checked; they can still be reviewed from Maintenance. */
    skip() {
      const current = pinSourceDb(db).db
      setCursor(current, maxId(current))
      controller.abort()
      runs.delete(current.sqlite)
      return worker.status()
    },
    dispose() { disposed = true; controller.abort(); unsubscribe() },
  }
  return worker

  /** Returns true when cards were merged (cached candidates are stale then). */
  async function checkCard(current: ApiDb, row: NewCardRow, cache: SimilarityTargetCache): Promise<boolean> {
    const stillThere = current.sqlite.prepare("SELECT 1 FROM media WHERE id = ? AND COALESCE(deletedAt, '') = ''").get(row.id)
    if (!stillThere) return false
    const group = findSimilarityGroupForTarget(current, row.id, cache)
    if (!group || group.itemIds.length < 2) return false
    const name = row.name || row.path
    const policy = readDuplicatePolicy(current)
    const sourceIds = group.itemIds.filter(id => id !== group.originalId)
    // Only exact copies merge without review; other versions are reported as found.
    if (policy.autoMerge && policy.files === 'keep' && group.similarity.every(match => match.level === 'exact')) {
      try {
        const merged = await (options.merge || mergeMediaItems)(current, {
          survivorId: group.originalId, sourceIds, similarity: true, signal: controller.signal,
        })
        push(current, {kind: 'merged', mediaId: row.id, name, itemIds: group.itemIds, survivorId: merged.survivor.id})
        return true
      } catch (err) {
        if (controller.signal.aborted) throw err
        push(current, {kind: 'found', mediaId: row.id, name, itemIds: group.itemIds, reason: apiErrorMessage(err) || String(err)})
        return false
      }
    }
    push(current, {kind: 'found', mediaId: row.id, name, itemIds: group.itemIds})
    return false
  }
}
