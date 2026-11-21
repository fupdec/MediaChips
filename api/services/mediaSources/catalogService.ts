import {isLibraryRestoring, runLibraryOperation} from '../libraryMaintenance'
import {CloudKeySchema} from '../../../shared/cloudAccounts'
import {getCloudAccounts} from '../cloudAccounts/accounts'
import type {Response} from 'express'
import {randomUUID} from 'crypto'
import {eq, and, lte, gt} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {sourceCatalogRoots, sourceConnections, sourceCacheSettings} from '../../db/schema/mediaSources'
import {CatalogRootInputSchema, type CatalogRoot, type CatalogRootInput, type SourceJob} from '../../../shared/sourceCatalog'
import {DriveFileIdSchema} from '../../../shared/cloudDrive'
import {normalizeNasRelativePath} from '../nas/transport'
import {resolveMediaLocation} from './locations'
import {getCloudDriveService} from '../cloudDrive'
import {createNasCredentialStore} from '../nas/credentials'
import {pinSourceDb, openSource, sourceError} from './context'
import {collectCatalog, commitCatalog} from './reconcile'
import {offlineDirectory, offlineLimit, offlineUsage, saveOfflineFile, removeOfflineFile, offlineStatus, sendOfflineFile, pruneOfflineFiles} from './offline'
import type {SourceReadAdapter} from './adapter'
import {requestAutomaticCopyDiscovery} from './copyDiscoveryTriggers'
import {sourceOperationLocks} from './operationLocks'
import type {BackgroundTaskProviderItem} from '../backgroundTasks'

const errorCodes = new Set(['library_changed', 'auth_required', 'credentials_required', 'connection_not_found', 'source_version_changed',
  'offline_limit_exceeded', 'offline_disk_full', 'offline_download_failed', 'media_type_unavailable', 'catalog_too_large', 'invalid_inventory', 'invalid_pagination', 'source_changed'])
const safeError = (err: unknown) => {
  const code = (err as {code?: string})?.code
  return code && errorCodes.has(code) ? code : 'source_update_failed'
}
export function createSourceCatalogService(db: ApiDb, options: {open?: typeof openSource; cacheBase?: string; now?: () => number} = {}) {
  const open = options.open || openSource
  const now = options.now || Date.now
  const jobs = new Map<string, {job: SourceJob; controller: AbortController; identity: ApiDb['sqlite']}>()
  const locks = sourceOperationLocks
  let cacheBusy = false
  const directory = (pinned: ApiDb) => offlineDirectory(pinned, options.cacheBase)
  const rootRow = (pinned: ApiDb, id: string) => {
    const row = pinned.drizzle.select().from(sourceCatalogRoots).where(eq(sourceCatalogRoots.id, id)).get()
    if (!row) throw sourceError('root_not_found', 404)
    return row
  }
  const launch = (kind: SourceJob['kind'], targetId: string, connectionId: string, action: (pinned: ApiDb, adapter: SourceReadAdapter,
    signal: AbortSignal, assertCurrent: () => void, job: SourceJob) => Promise<void>) => {
    const pinned = pinSourceDb(db)
    const lock = `${pinned.db.sqlite.name}:${connectionId}`
    if (locks.has(lock) || (kind === 'offline' && cacheBusy)) throw sourceError('source_busy')
    locks.add(lock)
    if (kind === 'offline') cacheBusy = true
    for (const [id, entry] of jobs) if (jobs.size >= 100 && entry.job.state !== 'running') jobs.delete(id)
    const controller = new AbortController()
    const job: SourceJob = {id: randomUUID(), kind, targetId, state: 'running', processed: 0}
    jobs.set(job.id, {job, controller, identity: pinned.db.sqlite})
    const config = pinned.db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, connectionId)).get()
    const assertCurrent = () => {
      pinned.assertCurrent(); controller.signal.throwIfAborted()
      const current = pinned.db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, connectionId)).get()
      if (!current || current.config !== config?.config || current.credentialRef !== config?.credentialRef) throw sourceError('source_changed')
      if (!options.open) {
        if (current.provider === 'nas' && !createNasCredentialStore().has(current.credentialRef)) throw sourceError('credentials_required')
        if (current.credentialRef === current.id && !getCloudAccounts().list(pinned.db).find(a => a.id === current.id)?.authenticated) throw sourceError('auth_required')
        if (current.id === 'google-drive' && !getCloudDriveService().status().authenticated) throw sourceError('auth_required')
      }
    }
    void runLibraryOperation(async () => {
      let adapter: SourceReadAdapter | undefined
      const timeout = setTimeout(() => controller.abort(sourceError('source_timeout')), 2 * 60 * 60_000)
      try {
        const connectTimeout = setTimeout(() => controller.abort(sourceError('source_timeout')), 30_000)
        try { adapter = await open(pinned.db, connectionId, controller.signal) } finally { clearTimeout(connectTimeout) }
        assertCurrent()
        // Bound each listing/stat/read setup. Stream lifetime belongs to the job controller.
        const bounded: SourceReadAdapter = {...adapter,
          list: (key, token, signal) => adapter!.list(key, token, AbortSignal.any([signal || controller.signal, AbortSignal.timeout(30_000)])),
          stat: (key, signal) => adapter!.stat(key, AbortSignal.any([signal || controller.signal, AbortSignal.timeout(30_000)])),
          read: (key, range, signal) => adapter!.read(key, range, signal || controller.signal),
        }
        await action(pinned.db, bounded, controller.signal, assertCurrent, job)
        job.state = 'completed'
      } catch (err) {
        job.state = controller.signal.aborted && controller.signal.reason?.name === 'AbortError' ? 'cancelled' : 'failed'
        job.error = job.state === 'failed' ? safeError(err) : undefined
        if (kind === 'catalog') {
          try {
            pinned.assertCurrent()
            pinned.db.drizzle.update(sourceCatalogRoots).set({lastError: job.error || 'cancelled'}).where(eq(sourceCatalogRoots.id, targetId)).run()
          } catch { /* An old job must never write into the newly active library. */ }
        }
      } finally {
        clearTimeout(timeout)
        try { adapter?.close() } catch { /* Cleanup must release the writer locks. */ }
        locks.delete(lock)
        if (kind === 'offline') cacheBusy = false
      }
    }).catch(() => {})
    return {...job}
  }
  const refresh = (id: string) => {
    const pinned = pinSourceDb(db).db
    const root = rootRow(pinned, id)
    return launch('catalog', id, root.connectionId, async (currentDb, adapter, signal, assertCurrent, job) => {
      const files = await collectCatalog(adapter, root.rootKey, signal, n => { job.processed = n; assertCurrent() })
      assertCurrent()
      job.result = commitCatalog(currentDb, id, files, signal)
      requestAutomaticCopyDiscovery(currentDb, [{connectionId: root.connectionId, key: root.rootKey}], 'folder_update')
    })
  }
  return {
    roots(): CatalogRoot[] {
      return db.drizzle.select().from(sourceCatalogRoots).all().map(row => ({...row, lastResult: row.lastResult ? JSON.parse(row.lastResult) : null}))
    },
    saveRoot(raw: CatalogRootInput): CatalogRoot {
      const input = CatalogRootInputSchema.parse(raw)
      const connection = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, input.connectionId)).get()
      if (!connection) throw sourceError('connection_not_found', 404)
      const rootKey = connection.provider === 'nas' ? normalizeNasRelativePath(input.rootKey) : connection.id !== 'google-drive' ? CloudKeySchema.parse(input.rootKey || 'root') : DriveFileIdSchema.parse(input.rootKey || 'root')
      const existing = db.drizzle.select().from(sourceCatalogRoots).where(and(eq(sourceCatalogRoots.connectionId, input.connectionId), eq(sourceCatalogRoots.rootKey, rootKey))).get()
      const id = existing?.id || randomUUID()
      const nextRunAt = input.intervalMinutes ? now() + input.intervalMinutes * 60_000 : null
      db.drizzle.insert(sourceCatalogRoots).values({id, ...input, rootKey, nextRunAt})
        .onConflictDoUpdate({target: [sourceCatalogRoots.connectionId, sourceCatalogRoots.rootKey], set: {name: input.name, intervalMinutes: input.intervalMinutes, nextRunAt}}).run()
      const row = rootRow(db, id)
      return {...row, lastResult: row.lastResult ? JSON.parse(row.lastResult) : null}
    },
    deleteRoot(id: string) {
      const root = rootRow(db, id)
      if (locks.has(`${db.sqlite.name}:${root.connectionId}`)) throw sourceError('source_busy')
      db.drizzle.delete(sourceCatalogRoots).where(eq(sourceCatalogRoots.id, id)).run()
    },
    refresh,
    jobs() { return [...jobs.values()].filter(entry => entry.identity === pinSourceDb(db).db.sqlite).map(entry => ({...entry.job})) },
    /** Running catalog refreshes and offline copies, for the Tasks panel. */
    backgroundTasks(): BackgroundTaskProviderItem[] {
      const current = pinSourceDb(db).db
      const items: BackgroundTaskProviderItem[] = []
      for (const {job, identity} of jobs.values()) {
        if (identity !== current.sqlite || job.state !== 'running') continue
        if (job.kind === 'offline') {
          const row = current.sqlite.prepare('SELECT filesize FROM media WHERE id = ?').get(Number(job.targetId)) as {filesize?: number | null} | undefined
          const size = Number(row?.filesize)
          items.push({id: `offlineCopy:${job.id}`, kind: 'offlineCopy', processed: job.processed, total: size > 0 ? size : null, unit: 'bytes'})
        } else {
          items.push({id: `sourceCatalog:${job.id}`, kind: 'sourceCatalog', processed: job.processed, total: null, unit: 'items'})
        }
      }
      return items
    },
    job(id: string) {
      const entry = jobs.get(id)
      if (!entry || entry.identity !== pinSourceDb(db).db.sqlite) throw sourceError('job_not_found', 404)
      return {...entry.job}
    },
    cancel(id: string) {
      const entry = jobs.get(id)
      if (!entry || entry.identity !== pinSourceDb(db).db.sqlite) throw sourceError('job_not_found', 404)
      if (entry.job.state === 'running') entry.controller.abort()
    },
    saveOffline(mediaId: number) {
      const resolved = resolveMediaLocation(db, mediaId)
      if (resolved.provider === 'local') throw sourceError('unsupported_source', 400)
      return launch('offline', String(mediaId), resolved.location.connectionId, async (currentDb, adapter, signal, assertCurrent, job) => {
        await saveOfflineFile({db: currentDb, mediaId, adapter, signal, assertCurrent, directory: directory(currentDb), progress: n => { job.processed = n }})
      })
    },
    streamOffline(mediaId: number, res: Response) { sendOfflineFile(db, mediaId, res, directory(db)) },
    offlineStatus(mediaId: number) { return offlineStatus(db, mediaId, directory(db)) },
    removeOffline(mediaId: number) {
      if (cacheBusy) throw sourceError('source_busy')
      removeOfflineFile(db, mediaId, directory(db))
    },
    cache() {
      if (!cacheBusy) pruneOfflineFiles(db, directory(db))
      return {usedBytes: offlineUsage(directory(db)), limitBytes: offlineLimit(db)}
    },
    setLimit(limitBytes: number) {
      if (cacheBusy) throw sourceError('source_busy')
      pruneOfflineFiles(db, directory(db))
      if (limitBytes < offlineUsage(directory(db))) throw sourceError('offline_limit_below_usage', 400)
      db.drizzle.insert(sourceCacheSettings).values({id: 1, limitBytes})
        .onConflictDoUpdate({target: sourceCacheSettings.id, set: {limitBytes}}).run()
    },
    tick() {
      if (isLibraryRestoring()) return
      const pinned = pinSourceDb(db)
      const due = pinned.db.drizzle.select().from(sourceCatalogRoots).where(and(gt(sourceCatalogRoots.intervalMinutes, 0), lte(sourceCatalogRoots.nextRunAt, now()))).all()
      for (const root of due) {
        if (locks.has(`${pinned.db.sqlite.name}:${root.connectionId}`)) continue
        // Persist the next attempt before starting: failures retry at the configured interval.
        pinned.db.drizzle.update(sourceCatalogRoots).set({nextRunAt: now() + root.intervalMinutes * 60_000}).where(eq(sourceCatalogRoots.id, root.id)).run()
        try { refresh(root.id) } catch (err) {
          pinned.db.drizzle.update(sourceCatalogRoots).set({lastError: safeError(err)}).where(eq(sourceCatalogRoots.id, root.id)).run()
        }
      }
    },
    dispose() { for (const entry of jobs.values()) if (entry.job.state === 'running') entry.controller.abort() },
  }
}
