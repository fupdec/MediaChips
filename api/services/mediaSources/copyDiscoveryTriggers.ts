import {createHash} from 'crypto'
import path from 'path'
import type {ApiDb} from '../../types/db'
import type {CopyDiscoveryInput, CopyDiscoveryTrigger} from '../../../shared/copyDiscovery'
import {normalizeExcludedPaths} from '../../utils/watchedFolderExcludes'

export type AutomaticRoot = CopyDiscoveryInput['roots'][number]
export const COPY_TRIGGER_SETTINGS: Record<CopyDiscoveryTrigger, string> = {
  import: 'copyDiscoveryOnImport', folder_update: 'copyDiscoveryOnFolderUpdate', reconnect: 'copyDiscoveryOnReconnect',
}
export function copyTriggerEnabled(db: ApiDb, reason: CopyDiscoveryTrigger) {
  const row = db.sqlite.prepare('SELECT value FROM settings WHERE option = ?').get(COPY_TRIGGER_SETTINGS[reason]) as {value: string} | undefined
  return row?.value !== '0'
}
export function automaticRootId(root: AutomaticRoot) {
  return createHash('sha256').update(JSON.stringify([root.connectionId || '', root.key])).digest('hex')
}
export function rememberCopyDiscoveryRoot(db: ApiDb, input: AutomaticRoot, origin: string, monitor = true) {
  const root = {...input}
  if (!root.connectionId) {
    if (!path.isAbsolute(root.key) || root.key.includes('://') || root.key.includes('!/')) return null
    root.key = path.normalize(root.key)
    root.excluded = [...normalizeExcludedPaths(root.key, (root.excluded || []).filter(value => path.isAbsolute(value))), ...(root.excluded || []).filter(value => !path.isAbsolute(value))]
  }
  const id = automaticRootId(root)
  const previous = db.sqlite.prepare('SELECT excluded FROM copyDiscoveryAutoRoots WHERE id = ?').get(id) as {excluded: string} | undefined
  db.sqlite.prepare(`INSERT INTO copyDiscoveryAutoRoots (id,connectionId,key,excluded,origin,monitor) VALUES (?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET excluded = excluded.excluded,
      origin = CASE WHEN copyDiscoveryAutoRoots.origin IN ('manual','import') OR (excluded.origin = 'event' AND copyDiscoveryAutoRoots.origin IN ('watched','catalog')) THEN copyDiscoveryAutoRoots.origin ELSE excluded.origin END,
      monitor = MAX(copyDiscoveryAutoRoots.monitor, excluded.monitor)`)
    .run(id, root.connectionId || null, root.key, input.excluded === undefined && previous ? previous.excluded : JSON.stringify(root.excluded || []), origin, Number(monitor))
  return id
}

/** Synchronous durable notification only; never read file contents in an import or watcher callback. */
export function requestAutomaticCopyDiscovery(db: ApiDb, roots: AutomaticRoot[], reason: CopyDiscoveryTrigger,
  options: {monitor?: boolean; now?: number; expanded?: boolean} = {}) {
  // Older test adapters and a database still bootstrapping may not expose the queue yet.
  if (!db.sqlite?.prepare) return
  try {
    if (!copyTriggerEnabled(db, reason)) return
    const now = options.now ?? Date.now()
    db.sqlite.transaction(() => {
      for (const root of roots) {
        const rootId = rememberCopyDiscoveryRoot(db, root, reason === 'import' ? 'import' : 'event', options.monitor ?? false)
        if (!rootId) continue
        const old = db.sqlite.prepare('SELECT * FROM copyDiscoveryAutoRequests WHERE rootId = ?').get(rootId) as {reasons: string; firstAt: number} | undefined
        const reasons = [...new Set([...(old ? JSON.parse(old.reasons) : []), reason])]
        db.sqlite.prepare(`INSERT INTO copyDiscoveryAutoRequests (rootId,reasons,firstAt,dueAt,expanded) VALUES (?,?,?,?,?)
          ON CONFLICT(rootId) DO UPDATE SET reasons = excluded.reasons, generation = generation + 1,
            dueAt = excluded.dueAt, expanded = MIN(copyDiscoveryAutoRequests.expanded, excluded.expanded)`)
          .run(rootId, JSON.stringify(reasons), old?.firstAt ?? now, Math.min(now + 2000, (old?.firstAt ?? now) + 10_000), Number(options.expanded ?? false))
      }
    })()
  } catch (err) {
    if (!String((err as Error).message).includes('no such table')) console.warn('[copy-discovery] Could not save automatic request:', (err as Error).message)
  }
}

/** Reauthentication only checks already selected roots of this connection. */
export function notifyCopySourceConnected(db: ApiDb, connectionId: string) {
  if (!db.sqlite?.prepare) return
  try {
    const rows = db.sqlite.prepare(`SELECT rootKey AS key FROM sourceCatalogRoots WHERE connectionId = ?
      UNION SELECT key FROM copyDiscoveryAutoRoots WHERE connectionId = ? AND monitor = 1`).all(connectionId, connectionId) as {key: string}[]
    requestAutomaticCopyDiscovery(db, rows.map(row => ({connectionId, key: row.key})), 'reconnect')
  } catch (err) { if (!String((err as Error).message).includes('no such table')) console.warn('[copy-discovery] Could not queue restored source') }
}
