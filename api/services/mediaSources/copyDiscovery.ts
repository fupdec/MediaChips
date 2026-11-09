import {runLibraryBackgroundTask} from '../libraryMaintenance'
import {parseCloudMediaPath, cloudMediaPath, CloudKeySchema} from '../../../shared/cloudAccounts'
import path from 'path'
import {randomUUID} from 'crypto'
import {and, eq} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {verifiedMediaCopies} from '../../db/schema/mediaCopies'
import {CopyDiscoveryInputSchema, type CopyDiscoveryInput, type CopyDiscoveryJob, type CopyDiscoveryItem, type CopyDiscoveryItemState, type CopyDiscoveryTrigger} from '../../../shared/copyDiscovery'
import {mediaFileKind, mediaFileContentType} from '../../../shared/mediaFormats'
import {nasMediaPath, parseNasMediaPath} from '../../../shared/remoteMedia'
import {driveMediaPath, parseDriveMediaPath, DriveFileIdSchema} from '../../../shared/cloudDrive'
import {normalizeNasRelativePath} from '../nas/transport'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {copyVerificationMethod} from './copyVerification'
import {fingerprintCopy, openCopySource, detachMediaCopy, type OpenCopySource} from './copies'
import {pinSourceDb, openSource, sourceError} from './context'
import {createLocalOriginalAdapter, localOriginalKey} from './localAdapter'
import {sourceOperationLocks} from './operationLocks'
import type {SourceObject, SourceReadAdapter} from './adapter'
import {rememberCopyDiscoveryRoot} from './copyDiscoveryTriggers'
import {isPathUnderExcluded} from '../../utils/watchedFolderExcludes'

type JobRow = Omit<CopyDiscoveryJob, 'roots' | 'counts' | 'total' | 'items' | 'truncated' | 'triggers'> & {roots: string; listingComplete: number; triggers: string}
type ItemRow = Omit<CopyDiscoveryItem, 'candidateIds' | 'candidates'> & {jobId: string; candidateIds: string}
type Resource = {id: number; path: string; size: number}
type Checked = Awaited<ReturnType<typeof fingerprintCopy>>
type Root = CopyDiscoveryInput['roots'][number]
const activeStates = "('queued','discovering','verifying')"
const validSource = (value: string) => !!(parseCloudMediaPath(value) || parseNasMediaPath(value) || parseDriveMediaPath(value) || (path.isAbsolute(value) && !value.includes('!/')))
const sourceId = (value: string) => parseCloudMediaPath(value)?.connectionId || parseNasMediaPath(value)?.connectionId || (parseDriveMediaPath(value) ? 'google-drive' : 'local')
const errorCode = (err: unknown) => {
  const code = (err as {code?: string}).code
  return code && /^[a-z_]+$/.test(code) ? code : 'copy_check_failed'
}

// Separate lookups let SQLite use a path index for each branch.
const existingCopyPathSql = `
  SELECT 1 FROM media WHERE path = ?
  UNION ALL SELECT 1 FROM media WHERE trashOriginalPath = ?
  UNION ALL SELECT 1 FROM verifiedMediaCopies WHERE path = ?
  LIMIT 1
`

/** Every address is indexed, including retained copies whose primary original is offline. */
export function libraryCopyResources(db: ApiDb, size: number, mediaId: number | null = null): Resource[] {
  const rows = db.sqlite.prepare(`SELECT m.id, m.path, m.filesize AS size FROM media m
    WHERE m.deletedAt IS NULL AND m.filesize = ? AND (? IS NULL OR m.id = ?)
    UNION ALL SELECT m.id, c.path, c.size FROM verifiedMediaCopies c JOIN media m ON m.id = c.mediaId
    WHERE m.deletedAt IS NULL AND c.size = ? AND (? IS NULL OR m.id = ?)`)
    .all(size, mediaId, mediaId, size, mediaId, mediaId) as Resource[]
  const seen = new Set<string>()
  return rows.filter(row => {
    const key = `${row.id}:${row.path}`
    if (!validSource(row.path) || seen.has(key)) return false
    seen.add(key); return true
  })
}

export function createCopyDiscoveryService(db: ApiDb, options: {
  open?: OpenCopySource
  openRoot?: (db: ApiDb, root: Root, signal: AbortSignal) => Promise<SourceReadAdapter>
} = {}) {
  let busy = false
  let disposed = false
  let controller: AbortController | undefined
  let runningId: string | undefined
  let runningDb: ApiDb | undefined
  const open = options.open || openCopySource
  const now = () => new Date().toISOString()
  const readJob = (current: ApiDb, id: string) => {
    const row = current.sqlite.prepare('SELECT * FROM copyDiscoveryJobs WHERE id = ?').get(id) as JobRow | undefined
    if (!row) throw sourceError('job_not_found', 404)
    return row
  }
  const updateJob = (current: ApiDb, id: string, state: JobRow['state'], error: string | null = null) =>
    current.sqlite.prepare('UPDATE copyDiscoveryJobs SET state = ?, error = ?, updatedAt = ? WHERE id = ?').run(state, error, now(), id)
  const updateItem = (current: ApiDb, id: string, state: CopyDiscoveryItemState, ids: number[] = [], mediaId: number | null = null, copyId: string | null = null, error: string | null = null) =>
    current.sqlite.prepare('UPDATE copyDiscoveryItems SET state = ?, candidateIds = ?, mediaId = ?, copyId = ?, error = ? WHERE id = ?')
      .run(state, JSON.stringify(ids), mediaId, copyId, error, id)
  const view = (current: ApiDb, id: string): CopyDiscoveryJob => {
    const row = readJob(current, id)
    const counts: CopyDiscoveryJob['counts'] = {}
    let total = 0
    for (const entry of current.sqlite.prepare('SELECT state, COUNT(*) AS n FROM copyDiscoveryItems WHERE jobId = ? GROUP BY state').all(id) as {state: CopyDiscoveryItemState; n: number}[]) {
      counts[entry.state] = entry.n; total += entry.n
    }
    const items = current.sqlite.prepare(`SELECT * FROM copyDiscoveryItems WHERE jobId = ?
      ORDER BY CASE state WHEN 'ambiguous' THEN 0 WHEN 'failed' THEN 1 WHEN 'attached' THEN 2 WHEN 'checking' THEN 3 WHEN 'candidate' THEN 4 ELSE 5 END, rowid LIMIT 200`).all(id) as ItemRow[]
    return {id: row.id, state: row.state, method: row.method, triggers: JSON.parse(row.triggers || '[]'), mediaId: row.mediaId, roots: JSON.parse(row.roots),
      createdAt: row.createdAt, updatedAt: row.updatedAt, error: row.error, counts, total,
      items: items.map(({jobId: _jobId, ...item}) => {
        const candidateIds: number[] = JSON.parse(item.candidateIds)
        return {...item, candidateIds, ...(item.state === 'ambiguous' ? {candidates: candidateIds.map(candidateId =>
          current.sqlite.prepare('SELECT id, name, path FROM media WHERE id = ? AND deletedAt IS NULL').get(candidateId))
          .filter(Boolean) as NonNullable<CopyDiscoveryItem['candidates']>} : {})}
      }), truncated: total > items.length}
  }

  async function discover(current: ApiDb, job: JobRow, signal: AbortSignal, assertCurrent: () => void) {
    const seen = new Set<string>()
    const existingPath = current.sqlite.prepare(existingCopyPathSql)
    let filesSinceYield = 0
    const insert = current.sqlite.prepare(`INSERT INTO copyDiscoveryItems (id,jobId,path,name,size,version,state,candidateIds)
      VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(jobId,path) DO UPDATE SET name = excluded.name, size = excluded.size,
        version = excluded.version, state = excluded.state, candidateIds = excluded.candidateIds, error = NULL
        WHERE copyDiscoveryItems.state IN ('candidate','checking','failed','unmatched')`)
    for (const root of JSON.parse(job.roots) as Root[]) {
      assertCurrent()
      const adapter = options.openRoot ? await options.openRoot(current, root, signal)
        : root.connectionId ? await openSource(current, root.connectionId, signal) : createLocalOriginalAdapter()
      try {
        const address = (key: string) => root.connectionId && adapter.provider !== 'nas' && adapter.provider !== 'local' && root.connectionId !== 'google-drive' ? cloudMediaPath(adapter.provider, root.connectionId, key) : adapter.provider === 'gdrive' ? driveMediaPath(key)
          : root.connectionId ? nasMediaPath(root.connectionId, key) : localOriginalKey(key)
        const excluded = (key: string) => root.excluded?.some(value => path.isAbsolute(value)
          ? isPathUnderExcluded(key, [value]) : key.includes(value))
        const add = (file: SourceObject) => {
          assertCurrent()
          if (excluded(file.resourceKey)) return
          if (!mediaFileKind(file.name) || !file.version || !Number.isSafeInteger(file.size) || file.size < 0 || /\.mediachips-|\.part$/i.test(file.name)) return
          const filePath = address(file.resourceKey)
          const ids = [...new Set(libraryCopyResources(current, file.size, job.mediaId).filter(row => row.path !== filePath).map(row => row.id))]
          const existing = existingPath.get(filePath, filePath, filePath)
          insert.run(randomUUID(), job.id, filePath, file.name, file.size, file.version, existing ? 'existing' : ids.length ? 'candidate' : 'unmatched', JSON.stringify(ids))
        }
        const first = root.connectionId && root.key === '' ? null
          : await adapter.stat(root.key, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
        if (first && !first.isDirectory) { add(first); continue }
        const pending = [root.key]
        while (pending.length) {
          assertCurrent()
          const key = pending.pop()!
          const identity = `${root.connectionId || 'local'}:${key}`
          if (seen.has(identity)) continue
          seen.add(identity)
          if (seen.size > 100_000) throw sourceError('catalog_too_large')
          let token: string | undefined
          const tokens = new Set<string>()
          do {
            const page = await adapter.list(key, token, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
            assertCurrent()
            for (const file of page.entries) {
              if (excluded(file.resourceKey)) continue
              if (file.isDirectory) pending.push(file.resourceKey)
              else {
                add(file)
                filesSinceYield += 1
                if (filesSinceYield >= 32) {
                  filesSinceYield = 0
                  await new Promise(resolve => setImmediate(resolve))
                  assertCurrent()
                }
              }
            }
            const count = current.sqlite.prepare('SELECT COUNT(*) AS n FROM copyDiscoveryItems WHERE jobId = ?').get(job.id) as {n: number}
            if (count.n > 100_000) throw sourceError('catalog_too_large')
            token = page.nextPageToken
            if (token && tokens.has(token)) throw sourceError('invalid_pagination')
            if (token) tokens.add(token)
            await new Promise(resolve => setImmediate(resolve))
          } while (token)
        }
      } finally { adapter.close() }
    }
    assertCurrent()
    current.sqlite.prepare('UPDATE copyDiscoveryJobs SET listingComplete = 1 WHERE id = ?').run(job.id)
  }

  async function verify(current: ApiDb, job: JobRow, item: ItemRow, signal: AbortSignal, assertCurrent: () => void, cache: Map<string, Checked>) {
    const stat = async (value: string) => {
      const opened = await open(current, value, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
      try {
        const file = await opened.adapter.stat(opened.key, AbortSignal.any([signal, AbortSignal.timeout(30_000)]))
        assertCurrent()
        if (file.isDirectory || !file.version) throw sourceError('invalid_file')
        return file
      } finally { opened.adapter.close() }
    }
    const fingerprint = async (value: string) => {
      const file = await stat(value)
      const key = `${value}\n${file.version}\n${job.method}`
      const cached = cache.get(key)
      if (cached && cached.file.size === file.size) return cached
      const checked = await fingerprintCopy(current, value, job.method, signal, assertCurrent, open)
      if (file.version !== checked.file.version || file.size !== checked.file.size) throw sourceError('source_version_changed')
      cache.set(key, checked)
      return checked
    }
    const owner = () => current.sqlite.prepare(existingCopyPathSql).get(item.path, item.path, item.path)
    if (owner()) { updateItem(current, item.id, 'existing'); return }
    const resources = () => libraryCopyResources(current, item.size, item.mediaId || job.mediaId).filter(row => row.path !== item.path)
    const initialResources = resources()
    const snapshot = () => JSON.stringify([...new Set(resources().map(row => row.id))].map(id => ({
      card: current.sqlite.prepare('SELECT id, path, filesize, deletedAt FROM media WHERE id = ?').get(id),
      copies: current.sqlite.prepare('SELECT id, path, version, size, sha256, oshash, verificationMethod FROM verifiedMediaCopies WHERE mediaId = ? ORDER BY id').all(id),
    })))
    const initial = snapshot()
    const checked = await fingerprint(item.path)
    if (checked.file.version !== item.version || checked.file.size !== item.size) throw sourceError('source_version_changed')
    const matches: Array<{id: number; path: string; checked: Checked}> = []
    const uncertain: number[] = []
    const key = (value: Checked) => `${value.file.size}:${value.verificationMethod}:${value.oshash || value.sha256}`
    for (const id of new Set(initialResources.map(row => row.id))) {
      if (current.sqlite.prepare('SELECT 1 FROM copyDiscoveryIgnored WHERE path = ? AND version = ? AND mediaId = ?').get(item.path, item.version, id)) continue
      let read = false
      for (const resource of initialResources.filter(row => row.id === id)) {
        try {
          const reference = await fingerprint(resource.path)
          const stored = current.drizzle.select().from(verifiedMediaCopies).where(and(eq(verifiedMediaCopies.mediaId, id), eq(verifiedMediaCopies.path, resource.path))).get()
          if (stored && (stored.size !== reference.file.size
            || (stored.sha256 && reference.verificationMethod === 'sha256' && stored.sha256 !== reference.sha256)
            || (stored.oshash && reference.oshash && stored.oshash !== reference.oshash)
            || (stored.sha256 && stored.version !== reference.file.version && reference.verificationMethod !== 'sha256'))) throw sourceError('source_version_changed')
          if (reference.verificationMethod === 'sha256') {
            const baselines = current.sqlite.prepare("SELECT DISTINCT sha256 FROM verifiedMediaCopies WHERE mediaId = ? AND sha256 != '' AND relationship = 'copy'").all(id) as {sha256: string}[]
            if (stored?.relationship !== 'version' && baselines.some(row => row.sha256 !== reference.sha256)) throw sourceError('copy_content_mismatch')
            // Upgrading a sampled row must also agree with its previous sampled evidence.
            if (stored?.oshash && !stored.sha256) {
              const sampled = await fingerprintCopy(current, resource.path, 'oshash', signal, assertCurrent, open)
              if (sampled.file.version !== reference.file.version || sampled.file.size !== reference.file.size || sampled.oshash !== stored.oshash) throw sourceError('source_version_changed')
            }
          }
          read = true
          if (key(reference) === key(checked)) { matches.push({id, path: resource.path, checked: reference}); break }
        } catch (err) { assertCurrent(); if (signal.aborted) throw err }
      }
      if (!read) uncertain.push(id)
    }
    assertCurrent()
    if (initial !== snapshot()) throw sourceError('media_changed')
    const ids = [...new Set([...matches.map(row => row.id), ...uncertain])]
    if (matches.length > 1 || (matches.length && uncertain.length)) { updateItem(current, item.id, 'ambiguous', ids); return }
    if (!matches.length) {
      updateItem(current, item.id, uncertain.length ? 'failed' : 'unmatched', ids, null, null, uncertain.length ? 'reference_unavailable' : null)
      return
    }
    const reference = matches[0]
    // Recheck both observed versions after comparing all candidate cards.
    for (const [value, expected] of [[item.path, checked], [reference.path, reference.checked]] as const) {
      const file = await stat(value)
      if (file.version !== expected.file.version || file.size !== expected.file.size) throw sourceError('source_version_changed')
    }
    current.drizzle.transaction(tx => {
      assertCurrent()
      if (owner() || initial !== snapshot()) throw sourceError('media_changed')
      const copyId = randomUUID()
      const relationship = current.drizzle.select().from(verifiedMediaCopies).where(and(eq(verifiedMediaCopies.mediaId, reference.id), eq(verifiedMediaCopies.path, reference.path))).get()?.relationship || 'copy'
      for (const [value, evidence, id] of [[reference.path, reference.checked, randomUUID()], [item.path, checked, copyId]] as const) {
        const previous = tx.select().from(verifiedMediaCopies).where(and(eq(verifiedMediaCopies.mediaId, reference.id), eq(verifiedMediaCopies.path, value))).get()
        const sha256 = evidence.sha256 || (previous?.version === evidence.file.version ? previous.sha256 : '')
        const values = {mediaId: reference.id, relationship, path: value, version: evidence.file.version,
          size: evidence.file.size, sha256, oshash: evidence.oshash || (previous?.version === evidence.file.version ? previous.oshash : null),
          verificationMethod: sha256 ? 'sha256' as const : evidence.verificationMethod,
          contentType: mediaFileContentType(evidence.file.name) || evidence.file.contentType,
          availability: 'available' as const,
          verifiedAt: !evidence.sha256 && sha256 && previous ? previous.verifiedAt : now()}
        tx.insert(verifiedMediaCopies).values({id, ...values}).onConflictDoUpdate({target: [verifiedMediaCopies.mediaId, verifiedMediaCopies.path], set: values}).run()
      }
      // Persist the successful attachment and its queue checkpoint together.
      updateItem(current, item.id, 'attached', [reference.id], reference.id, copyId)
    })
    invalidateMediaDerivedCaches()
  }

  const service = {
    create(raw: CopyDiscoveryInput, triggers: CopyDiscoveryTrigger[] = []) {
      const input = CopyDiscoveryInputSchema.parse(raw)
      const current = pinSourceDb(db).db
      for (const root of input.roots) {
        if (!root.connectionId) root.key = localOriginalKey(root.key)
        else {
          const connection = current.sqlite.prepare('SELECT provider FROM sourceConnections WHERE id = ?').get(root.connectionId) as {provider: string} | undefined
          if (!connection) throw sourceError('connection_not_found', 404)
          root.key = connection.provider === 'nas' ? normalizeNasRelativePath(root.key) : root.connectionId === 'google-drive' ? DriveFileIdSchema.parse(root.key) : CloudKeySchema.parse(root.key || 'root')
        }
      }
      if (input.mediaId && !current.sqlite.prepare('SELECT 1 FROM media WHERE id = ? AND deletedAt IS NULL').get(input.mediaId)) throw sourceError('media_not_found', 404)
      const id = randomUUID(), date = now()
      current.sqlite.transaction(() => {
        current.sqlite.prepare('INSERT INTO copyDiscoveryJobs (id,state,method,roots,mediaId,createdAt,updatedAt,triggers) VALUES (?,?,?,?,?,?,?,?)')
          .run(id, 'queued', copyVerificationMethod(current), JSON.stringify(input.roots), input.mediaId || null, date, date, JSON.stringify(triggers))
        if (!triggers.length) for (const root of input.roots) rememberCopyDiscoveryRoot(current, root, 'manual')
      })()
      return view(current, id)
    },
    jobs() { const current = pinSourceDb(db).db; return (current.sqlite.prepare('SELECT id FROM copyDiscoveryJobs ORDER BY rowid DESC LIMIT 20').all() as {id: string}[]).map(row => view(current, row.id)) },
    activity() {
      const current = pinSourceDb(db).db
      return current.sqlite.prepare(`SELECT id, state FROM copyDiscoveryJobs
        WHERE state IN ('queued','discovering','verifying','paused') ORDER BY rowid`).all() as Pick<CopyDiscoveryJob, 'id' | 'state'>[]
    },
    pause(id: string) {
      const current = pinSourceDb(db).db
      const job = readJob(current, id)
      if (['queued', 'discovering', 'verifying'].includes(job.state)) {
        updateJob(current, id, 'paused')
        if (runningId === id && runningDb?.sqlite === current.sqlite) controller?.abort()
      }
      return view(current, id)
    },
    resume(id: string) {
      const current = pinSourceDb(db).db
      if (readJob(current, id).state === 'paused') updateJob(current, id, 'queued')
      return view(current, id)
    },
    clearHistory() {
      const current = pinSourceDb(db).db
      const running = runningDb?.sqlite === current.sqlite ? runningId || '' : ''
      current.sqlite.prepare("DELETE FROM copyDiscoveryJobs WHERE state IN ('completed','cancelled','failed') AND id != ?").run(running)
      return service.jobs()
    },
    job(id: string) { return view(pinSourceDb(db).db, id) },
    cancel(id: string) {
      const current = pinSourceDb(db).db
      const job = readJob(current, id)
      if (!['queued', 'discovering', 'verifying', 'paused'].includes(job.state)) return view(current, id)
      updateJob(current, id, 'cancelled')
      if (runningId === id && runningDb?.sqlite === current.sqlite) controller?.abort()
      return view(current, id)
    },
    retry(id: string) {
      const current = pinSourceDb(db).db
      const job = readJob(current, id)
      if (['queued', 'discovering', 'verifying', 'paused'].includes(job.state) || (runningId === id && runningDb?.sqlite === current.sqlite)) throw sourceError('source_busy')
      current.sqlite.transaction(() => {
        current.sqlite.prepare("UPDATE copyDiscoveryItems SET state = 'candidate', error = NULL WHERE jobId = ? AND state IN ('failed','checking')").run(id)
        current.sqlite.prepare('UPDATE copyDiscoveryJobs SET listingComplete = 0 WHERE id = ?').run(id)
        updateJob(current, id, 'queued')
      })()
      return view(current, id)
    },
    choose(id: string, itemId: string, mediaId: number) {
      const current = pinSourceDb(db).db
      const job = readJob(current, id)
      if (['queued', 'discovering', 'verifying', 'paused'].includes(job.state) || (runningId === id && runningDb?.sqlite === current.sqlite)) throw sourceError('source_busy')
      const item = current.sqlite.prepare('SELECT * FROM copyDiscoveryItems WHERE jobId = ? AND id = ?').get(id, itemId) as ItemRow | undefined
      if (!item || item.state !== 'ambiguous' || !JSON.parse(item.candidateIds).includes(mediaId)) throw sourceError('copy_not_found', 404)
      current.sqlite.transaction(() => {
        updateItem(current, itemId, 'candidate', [mediaId], mediaId)
        updateJob(current, id, 'queued')
      })()
      return view(current, id)
    },
    undo(id: string, itemId: string) {
      const current = pinSourceDb(db).db
      readJob(current, id)
      const item = current.sqlite.prepare('SELECT * FROM copyDiscoveryItems WHERE jobId = ? AND id = ?').get(id, itemId) as ItemRow | undefined
      if (!item || item.state !== 'attached' || !item.mediaId || !item.copyId) throw sourceError('copy_not_found', 404)
      current.drizzle.transaction(() => {
        detachMediaCopy(current, item.mediaId!, item.copyId!)
        current.sqlite.prepare('INSERT OR IGNORE INTO copyDiscoveryIgnored (path,version,mediaId) VALUES (?,?,?)').run(item.path, item.version, item.mediaId)
        updateItem(current, item.id, 'dismissed', [item.mediaId!], item.mediaId)
      })
      return view(current, id)
    },
    tick() {
      return runLibraryBackgroundTask(async () => {
        if (busy || disposed) return
        const pinned = pinSourceDb(db), current = pinned.db
        const job = current.sqlite.prepare(`SELECT * FROM copyDiscoveryJobs WHERE state IN ${activeStates} ORDER BY rowid LIMIT 1`).get() as JobRow | undefined
        if (!job) return
        const connections = current.sqlite.prepare('SELECT * FROM sourceConnections ORDER BY id').all()
        const connectionSnapshot = JSON.stringify(connections)
        // Share the writer locks: reconciliation and managed moves cannot race publication.
        const neededLocks = () => {
          const ids = new Set((JSON.parse(job.roots) as Root[]).map(root => root.connectionId || 'local'))
          const sizes = current.sqlite.prepare("SELECT DISTINCT size FROM copyDiscoveryItems WHERE jobId = ? AND state IN ('candidate','checking')").all(job.id) as {size: number}[]
          for (const {size} of sizes) for (const row of libraryCopyResources(current, size, job.mediaId)) ids.add(sourceId(row.path))
          for (const row of current.sqlite.prepare("SELECT DISTINCT path FROM copyDiscoveryItems WHERE jobId = ? AND state IN ('candidate','checking')").all(job.id) as {path: string}[]) ids.add(sourceId(row.path))
          return [...ids].map(id => `${current.sqlite.name}:${id}`)
        }
        const locks = neededLocks()
        if (locks.some(lock => sourceOperationLocks.has(lock))) return
        busy = true; runningId = job.id; runningDb = current; controller = new AbortController()
        const signal = controller.signal
        locks.forEach(lock => sourceOperationLocks.add(lock))
        const assertCurrent = () => {
          pinned.assertCurrent(); signal.throwIfAborted()
          if (connectionSnapshot !== JSON.stringify(current.sqlite.prepare('SELECT * FROM sourceConnections ORDER BY id').all())) throw sourceError('source_changed')
        }
        try {
          current.sqlite.prepare("UPDATE copyDiscoveryItems SET state = 'candidate' WHERE jobId = ? AND state = 'checking'").run(job.id)
          if (!job.listingComplete) { updateJob(current, job.id, 'discovering'); await discover(current, job, signal, assertCurrent) }
          // Listing may discover references on additional sources. Wait for their writers.
          const additional = neededLocks().filter(lock => !locks.includes(lock))
          if (additional.some(lock => sourceOperationLocks.has(lock))) { updateJob(current, job.id, 'queued'); return }
          additional.forEach(lock => { locks.push(lock); sourceOperationLocks.add(lock) })
          assertCurrent(); updateJob(current, job.id, 'verifying')
          const cache = new Map<string, Checked>()
          while (true) {
            assertCurrent()
            const item = current.sqlite.prepare("SELECT * FROM copyDiscoveryItems WHERE jobId = ? AND state = 'candidate' ORDER BY rowid LIMIT 1").get(job.id) as ItemRow | undefined
            if (!item) break
            updateItem(current, item.id, 'checking', JSON.parse(item.candidateIds))
            try { await verify(current, job, item, AbortSignal.any([signal, AbortSignal.timeout(30 * 60_000)]), assertCurrent, cache) }
            catch (err) {
              assertCurrent()
              updateItem(current, item.id, 'failed', JSON.parse(item.candidateIds), null, null, errorCode(err))
            }
            await new Promise(resolve => setImmediate(resolve))
          }
          assertCurrent(); updateJob(current, job.id, 'completed')
        } catch (err) {
          // A disposed worker leaves durable checkpoints for the next server instance.
          try { pinned.assertCurrent(); if (!signal.aborted) updateJob(current, job.id, 'failed', errorCode(err)) } catch { /* The previous library is closed. */ }
        } finally {
          locks.forEach(lock => sourceOperationLocks.delete(lock))
          busy = false; controller = undefined; runningId = undefined; runningDb = undefined
        }
      })
    },
    dispose() { disposed = true; controller?.abort() },
  }
  return service
}
