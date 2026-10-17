import {updateVerifiedCopyPath} from '../mediaSources/copyPathUpdates'
import fs from 'fs'
import path from 'path'
import {createHash, randomUUID} from 'crypto'
import {Readable, Transform} from 'stream'
import {pipeline} from 'stream/promises'
import {eq, sql} from 'drizzle-orm'
import type {ApiDb} from '../../types/db'
import {originalOperationJobs, mediaLocations, offlineCopies, sourceConnections} from '../../db/schema/mediaSources'
import {media} from '../../db/schema/media'
import {createMediaRepository} from '../../db/repositories/media'
import {OriginalBatchSchema, type OriginalJob, type OriginalItem, type OriginalTarget} from '../../../shared/originalOperations'
import {nasMediaPath, isRemoteMediaPath} from '../../../shared/remoteMedia'
import {resolveMediaLocation, nasVersionMatches} from '../mediaSources/locations'
import {openSource, pinSourceDb, sourceError} from '../mediaSources/context'
import {offlineDirectory} from '../mediaSources/offline'
import {createLocalOriginalAdapter, localOriginalKey} from '../mediaSources/localAdapter'
import {normalizeNasRelativePath} from '../nas/transport'
import type {SourceWriteAdapter, SourceObject} from '../mediaSources/adapter'
import {clearResolvedPathCache} from '../../../app/server/resolvePathCache'
import {sourceOperationLocks} from '../mediaSources/operationLocks'
import {invalidateMediaDerivedCaches} from '../mediaCacheInvalidation'
import {sourceFailure} from '../../../shared/sourceErrors'
import {DriveFileIdSchema} from '../../../shared/cloudDrive'
import {runDriveOriginal} from './driveOperation'
import {loadInheritedFolderTagsForMediaRows} from '../mediaInheritedFolderTags'
import {tagsInMedia} from '../../db/schema/tagsInMedia'

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const terminal = (item: OriginalItem) => item.state === 'completed' || item.state === 'skipped'
const absent = (err: unknown) => {
  const error = err as {code?: string | number; status?: number}
  return error.code === 'ENOENT' || error.code === 2 || error.code === 'not_found' || error.status === 404
}
const errorCode = (err: unknown) => {
  if (sourceFailure(err)) return sourceFailure(err)!
  const code = (err as {code?: string}).code || ''
  if (['EEXIST', 'EXISTS', 'conflict'].includes(code)) return 'conflict'
  if (code === 'file_changed') return 'source_changed'
  if (['ENOSPC', 'EDQUOT'].includes(code)) return 'no_space'
  if (['EACCES', 'EPERM', 'permission_denied'].includes(code)) return 'permission_denied'
  if (absent(err)) return 'not_found'
  return ['invalid_path', 'invalid_file', 'source_changed', 'card_changed', 'size_mismatch', 'read_only', 'library_changed',
    'cross_connection_move', 'ambiguous_result', 'upload_required', 'no_space', 'cancelled', 'auth_required', 'drive_write_authorization'].includes(code) ? code : 'operation_failed'
}

export function createOriginalOperationsService(publicDb: ApiDb, options: {
  open?: typeof openSource
  directory?: string
  checkpoint?: (item: OriginalItem) => void
} = {}) {
  let busy = false
  let disposed = false
  let controller: AbortController | undefined
  let runningJob: {id: string; sqlite: ApiDb['sqlite']} | undefined
  let initializedFor: unknown
  const uploads = new Set<string>()
  const directoryFor = (db: ApiDb) => options.directory || offlineDirectory(db) + '-uploads'
  const connectionVersion = (db: ApiDb, id: string) => {
    const row = db.drizzle.select().from(sourceConnections).where(eq(sourceConnections.id, id)).get()
    if (!row) throw sourceError('not_found', 404)
    return createHash('sha256').update(row.config + '\n' + row.credentialRef).digest('hex')
  }
  const persist = (db: ApiDb, job: OriginalJob) => db.drizzle.insert(originalOperationJobs).values({id: job.id, payload: JSON.stringify(job)})
    .onConflictDoUpdate({target: originalOperationJobs.id, set: {payload: JSON.stringify(job)}}).run()
  const readJobs = (db: ApiDb) => db.drizzle.select().from(originalOperationJobs).orderBy(sql`rowid`).all().map(row => JSON.parse(row.payload) as OriginalJob)
  const load = (db: ApiDb, id: string) => {
    const row = db.drizzle.select().from(originalOperationJobs).where(eq(originalOperationJobs.id, id)).get()
    if (!row) throw sourceError('not_found', 404)
    return JSON.parse(row.payload) as OriginalJob
  }
  function initialize(db: ApiDb) {
    if (initializedFor === db.sqlite) return
    initializedFor = db.sqlite
    for (const job of readJobs(db)) {
      let changed = false
      if (job.state === 'running' && !(runningJob?.id === job.id && runningJob.sqlite === db.sqlite)) {
        job.state = 'interrupted'; changed = true
        for (const item of job.items) if (item.state === 'running') item.state = 'failed'
      }
      for (const item of job.items.filter(item => item.kind === 'upload')) {
        if (terminal(item)) fs.rmSync(spool(db, item), {force: true})
        else if (job.state === 'awaiting_upload' && !item.readyUpload && fs.existsSync(spool(db, item)) && fs.statSync(spool(db, item)).size === item.uploadSize) {
          item.readyUpload = true; changed = true
        }
      }
      if (job.state === 'awaiting_upload' && job.items.every(item => item.kind !== 'upload' || item.readyUpload)) { job.state = 'queued'; changed = true }
      if (changed) persist(db, job)
    }
  }
  const open = async (db: ApiDb, ref: OriginalTarget, signal: AbortSignal) => ref.connectionId
    ? (options.open || openSource)(db, ref.connectionId, signal) : createLocalOriginalAdapter()
  async function using<T>(db: ApiDb, ref: OriginalTarget, signal: AbortSignal, action: (adapter: SourceWriteAdapter) => Promise<T>) {
    signal.throwIfAborted()
    const adapter = await open(db, ref, signal)
    try { return await action(adapter) } finally { adapter.close() }
  }
  const stat = (db: ApiDb, ref: OriginalTarget, signal: AbortSignal) => using(db, ref, signal, a => a.stat(ref.key, signal))
  const maybeStat = async (db: ApiDb, ref: OriginalTarget, signal: AbortSignal) => {
    try { return await stat(db, ref, signal) } catch (err) { if (absent(err)) return undefined; throw err }
  }
  const cleanTarget = (ref: OriginalTarget): OriginalTarget => ({...ref, key: ref.connectionId === 'google-drive' ? DriveFileIdSchema.parse(ref.key) : ref.connectionId ? normalizeNasRelativePath(ref.key) : localOriginalKey(ref.key)})
  const staged = (item: OriginalItem): OriginalTarget => {
    const target = item.target!
    const paths = target.connectionId ? path.posix : path
    return {...target, key: paths.join(paths.dirname(target.key), `.mediachips-${item.id}.part`)}
  }
  const spool = (db: ApiDb, item: OriginalItem) => path.join(directoryFor(db), `${item.id}.upload`)
  function snapshot(db: ApiDb, item: OriginalItem) {
    const resolved = resolveMediaLocation(db, item.mediaId!)
    if (resolved.provider === 'local') {
      if (isRemoteMediaPath(resolved.path)) throw sourceError('read_only')
      return {ref: cleanTarget({key: resolved.path}), path: resolved.path, version: ''}
    }
    return {ref: {connectionId: resolved.location.connectionId, key: resolved.location.resourceKey}, path: resolved.card.path, version: resolved.location.version}
  }
  async function hash(db: ApiDb, ref: OriginalTarget, signal: AbortSignal, progress?: (bytes: number) => void) {
    return using(db, ref, signal, async adapter => {
      const result = await adapter.read(ref.key, undefined, signal)
      if (result.status !== 200) { if (!Buffer.isBuffer(result.body)) result.body.destroy(); throw sourceError('size_mismatch') }
      const digest = createHash('sha256')
      let bytes = 0
      for await (const chunk of Buffer.isBuffer(result.body) ? Readable.from([result.body]) : result.body) { signal.throwIfAborted(); digest.update(chunk); bytes += chunk.length; progress?.(bytes) }
      return digest.digest('hex')
    })
  }
  function assertCard(db: ApiDb, item: OriginalItem, allowTarget = false) {
    if (!item.mediaId) return
    const card = createMediaRepository(db.drizzle).findById(item.mediaId)
    const next = item.target && (item.target.connectionId ? nasMediaPath(item.target.connectionId, item.target.key) : item.target.key)
    if (!card || card.deletedAt || (card.path !== item.sourcePath && !(allowTarget && card.path === next))) throw sourceError('card_changed')
  }
  function assertLinkedCard(db: ApiDb, item: OriginalItem) {
    const card = createMediaRepository(db.drizzle).findById(item.mediaId!)
    const next = item.target!.connectionId ? nasMediaPath(item.target!.connectionId, item.target!.key) : item.target!.key
    if (!card || card.deletedAt || card.path !== next) throw sourceError('card_changed')
  }
  async function linkCard(db: ApiDb, item: OriginalItem, object: SourceObject, guard: () => void) {
    if (!item.mediaId) return
    assertCard(db, item, true)
    const target = item.target!
    const nextPath = target.connectionId ? nasMediaPath(target.connectionId, target.key) : target.key
    const basename = target.connectionId ? path.posix.basename(target.key) : path.basename(target.key)
    const inherited = await loadInheritedFolderTagsForMediaRows(db, [{id: item.mediaId!, path: item.sourcePath!}])
    guard(); assertCard(db, item, true)
    // Update every card referring to this physical original; titles and all relations stay intact.
    db.sqlite.transaction(() => {
      const linkedCards = db.drizzle.select({id: media.id}).from(media).where(eq(media.path, item.sourcePath!)).all()
      for (const card of linkedCards) updateVerifiedCopyPath(db, card.id, item.sourcePath!, nextPath)
      db.drizzle.update(media).set({path: nextPath, basename, ext: target.connectionId ? path.extname(basename).slice(1).toLowerCase() : path.extname(basename)})
        .where(eq(media.path, item.sourcePath!)).run()
      for (const tag of inherited) db.drizzle.insert(tagsInMedia).values(tag).onConflictDoNothing().run()
      if (item.source?.connectionId) {
        const locations = db.drizzle.select().from(mediaLocations).where(eq(mediaLocations.connectionId, item.source.connectionId)).all()
          .filter(row => row.resourceKey === item.source!.key && row.mediaId === item.mediaId)
        for (const row of locations) {
          db.drizzle.update(mediaLocations).set({resourceKey: target.key, version: object.version, availability: 'available', lastVerifiedAt: new Date().toISOString()})
            .where(eq(mediaLocations.id, row.id)).run()
          // Same bytes remain valid after a rename, including existing offline copies.
          db.drizzle.update(offlineCopies).set({version: object.version}).where(eq(offlineCopies.locationId, row.id)).run()
        }
        // Inventory rows are advisory; clear old keys so a later reconcile cannot report the old path as a second original.
        db.sqlite.prepare('DELETE FROM sourceCatalogEntries WHERE resourceKey = ? AND rootId IN (SELECT id FROM sourceCatalogRoots WHERE connectionId = ?)').run(item.source.key, item.source.connectionId)
      }
    })()
    clearResolvedPathCache()
    invalidateMediaDerivedCaches()
  }
  async function runItem(db: ApiDb, job: OriginalJob, item: OriginalItem, signal: AbortSignal, assertCurrent: () => void) {
    const save = () => { assertCurrent(); persist(db, job); options.checkpoint?.(clone(item)) }
    const progress = (bytes: number) => { signal.throwIfAborted(); assertCurrent(); item.bytes = bytes; if (Date.now() - lastProgress > 250) { lastProgress = Date.now(); persist(db, job) } }
    let lastProgress = 0
    if ((item.source?.connectionId === 'google-drive' && item.kind !== 'download') || item.target?.connectionId === 'google-drive') {
      if (item.source && item.target && ['rename', 'move'].includes(item.kind) && item.source.connectionId !== item.target.connectionId) throw sourceError('cross_connection_move')
      assertCard(db, item)
      if (item.target) item.target = cleanTarget(item.target)
      const previous = job.items.slice(0, job.items.indexOf(item)).some(row => row.mediaId === item.mediaId && row.state === 'completed' && ['rename', 'move'].includes(row.kind))
      if (item.mediaId && previous && item.phase === 'pending') item.version = snapshot(db, item).version
      await using(db, item.source || item.target!, signal, async adapter => {
        if (!adapter.drive) throw sourceError('read_only')
        await runDriveOriginal({db, item, transport: adapter.drive, signal, save, spool: spool(db, item), progress,
          guard: () => { signal.throwIfAborted(); assertCurrent(); assertCard(db, item) }})
      })
      invalidateMediaDerivedCaches()
      return
    }
    if (item.phase === 'pending') {
      if (item.target) item.target = cleanTarget(item.target)
      if (item.mediaId) {
        const source = snapshot(db, item)
        const precedingMove = job.items.slice(0, job.items.indexOf(item)).reverse().find(previous => previous.mediaId === item.mediaId
          && previous.state === 'completed' && ['rename', 'move'].includes(previous.kind))
        const precedingPath = precedingMove?.target && (precedingMove.target.connectionId ? nasMediaPath(precedingMove.target.connectionId, precedingMove.target.key) : precedingMove.target.key)
        if (precedingPath === source.path) item.sourcePath = precedingPath
        if (item.sourcePath && item.sourcePath !== source.path) throw sourceError('card_changed')
        item.source = source.ref; item.sourcePath = source.path
        const info = await stat(db, source.ref, signal)
        if (info.isDirectory) throw sourceError('invalid_file')
        if (source.version && !nasVersionMatches(source.version, info.version)) throw sourceError('source_changed')
        item.version = info.version; item.total = info.size
        if (item.kind === 'rename' || item.kind === 'move') {
          if (item.target?.connectionId !== source.ref.connectionId) throw sourceError('cross_connection_move')
          if (item.kind === 'rename') {
            const p = source.ref.connectionId ? path.posix : path
            if (p.dirname(source.ref.key) !== p.dirname(item.target!.key)) throw sourceError('invalid_path')
          }
          if (source.ref.key === item.target!.key) { item.state = 'skipped'; save(); return }
        }
      }
      if (item.kind === 'upload') {
        if (!item.readyUpload) throw sourceError('upload_required')
        item.total = item.uploadSize!
        item.digest = await hash(db, {key: spool(db, item)}, signal)
      }
      if (item.target) {
        const target = item.target
        const exists = await maybeStat(db, target, signal)
        if (exists) {
          if (item.conflict === 'skip') {
            if (['download', 'upload'].includes(item.kind) || (item.source && !item.source.connectionId && item.localLink === false)) {
              const partial = staged(item)
              if (await maybeStat(db, partial, signal)) await using(db, partial, signal, async a => a.remove!(partial.key, signal))
            }
            item.state = 'skipped'; save(); return
          }
          if (item.conflict !== 'keep-both') throw sourceError('conflict')
          const p = target.connectionId ? path.posix : path
          const ext = item.kind === 'mkdir' ? '' : p.extname(target.key)
          const stem = target.key.slice(0, target.key.length - ext.length)
          let found = false
          for (let n = 1; n <= 10000; n++) {
            const key = `${stem} (${n})${ext}`
            if (!await maybeStat(db, {...target, key}, signal)) { target.key = key; found = true; break }
          }
          if (!found) throw sourceError('conflict')
        }
        // Do not publish into another card's location, even when its original is missing.
        if (['rename', 'move'].includes(item.kind)) {
          const next = target.connectionId ? nasMediaPath(target.connectionId, target.key) : target.key
          if (createMediaRepository(db.drizzle).findByPaths([next]).length) throw sourceError('conflict')
        }
      }
      item.phase = 'prepared'; save()
    }
    assertCard(db, item, ['published', 'linked', 'removed'].includes(item.phase) && ['rename', 'move'].includes(item.kind))
    const checkVersion = async () => {
      const current = await stat(db, item.source!, signal)
      if (current.version !== item.version || current.isDirectory || current.size !== item.total) throw sourceError('source_changed')
    }
    if (['rename', 'move'].includes(item.kind) && !item.source!.connectionId && item.localLink === undefined) {
      item.localLink = fs.statSync(item.source!.key).dev === fs.statSync(path.dirname(item.target!.key)).dev
      save()
    }
    if (item.kind === 'delete') {
      if (item.phase === 'prepared') { await checkVersion(); item.phase = 'mutating'; save() }
      const exists = await maybeStat(db, item.source!, signal)
      if (exists) {
        await checkVersion()
        assertCurrent(); assertCard(db, item)
        await using(db, item.source!, signal, async a => {
          if (!a.remove) throw sourceError('read_only')
          if ((await a.stat(item.source!.key, signal)).version !== item.version) throw sourceError('source_changed')
          await a.remove(item.source!.key, signal)
        })
      }
      // Deleting bytes never trashes/purges the card.
      if (item.source!.connectionId) {
        const rows = db.drizzle.select().from(mediaLocations).where(eq(mediaLocations.connectionId, item.source!.connectionId)).all()
        for (const row of rows.filter(row => row.resourceKey === item.source!.key)) db.drizzle.update(mediaLocations).set({availability: 'unavailable'}).where(eq(mediaLocations.id, row.id)).run()
      }
      item.phase = 'removed'; save()
    } else if (item.kind === 'mkdir') {
      if (item.phase === 'prepared') { item.phase = 'mutating'; save(); await using(db, item.target!, signal, async a => { if (!a.mkdir) throw sourceError('read_only'); await a.mkdir(item.target!.key, signal) }) }
      if (!(await stat(db, item.target!, signal)).isDirectory) throw sourceError('conflict')
      item.phase = 'published'; save()
    } else if (['rename', 'move'].includes(item.kind) && item.source!.connectionId) {
      if (item.phase === 'prepared' || item.phase === 'mutating') {
        const from = await maybeStat(db, item.source!, signal)
        const to = await maybeStat(db, item.target!, signal)
        if (from) {
          await checkVersion()
          if (to) throw sourceError('conflict')
          if (!item.digest) { item.digest = await hash(db, item.source!, signal, progress); await checkVersion(); save() }
          item.phase = 'mutating'; save()
          assertCurrent(); assertCard(db, item)
          await using(db, item.source!, signal, async a => {
            if (!a.move) throw sourceError('read_only')
            if ((await a.stat(item.source!.key, signal)).version !== item.version) throw sourceError('source_changed')
            await a.move(item.source!.key, item.target!.key, signal)
          })
        } else if (!to || !item.digest || to.size !== item.total || await hash(db, item.target!, signal) !== item.digest) throw sourceError('ambiguous_result')
        item.phase = 'published'; save()
      }
      const target = await stat(db, item.target!, signal)
      if (!item.digest || target.size !== item.total || await hash(db, item.target!, signal) !== item.digest) throw sourceError('source_changed')
      assertCurrent(); await linkCard(db, item, target, assertCurrent); item.phase = 'linked'; save()
    } else if (['rename', 'move'].includes(item.kind) && !item.source!.connectionId && item.localLink) {
      // Same-volume moves publish a hard link to the complete original. This
      // refuses a racing destination and needs no second full-sized copy.
      item.localLink = true
      let source = await maybeStat(db, item.source!, signal)
      let target = await maybeStat(db, item.target!, signal)
      const identity = (version: string) => version.split(':').slice(0, 4).join(':')
      const expected = identity(item.version!)
      if (source && identity(source.version) !== expected) throw sourceError('source_changed')
      if (target && item.phase === 'prepared') throw sourceError('conflict')
      if (target && identity(target.version) !== expected) throw sourceError(['published', 'linked', 'removed'].includes(item.phase) ? 'source_changed' : 'conflict')
      if (!target) {
        await checkVersion(); item.phase = 'mutating'; save()
        assertCurrent(); assertCard(db, item)
        try { await fs.promises.link(item.source!.key, item.target!.key) }
        catch (err) {
          if (['EXDEV', 'ENOTSUP', 'EOPNOTSUPP', 'EPERM'].includes((err as NodeJS.ErrnoException).code || '')) {
            item.localLink = false; item.phase = 'prepared'; save()
            return runItem(db, job, item, signal, assertCurrent)
          }
          throw err
        }
        target = await stat(db, item.target!, signal)
      }
      if (identity(target.version) !== expected) throw sourceError('source_changed')
      source = await maybeStat(db, item.source!, signal)
      if (source) {
        if (identity(source.version) !== expected) throw sourceError('source_changed')
        // Creating a hard link changes ctime, but not the inode or its content.
        item.version = source.version
      }
      if (item.phase !== 'linked' && item.phase !== 'removed') {
        item.phase = 'published'; save()
        await linkCard(db, item, target, assertCurrent); item.phase = 'linked'; save()
      }
      if (source) {
        if (identity((await stat(db, item.target!, signal)).version) !== expected) throw sourceError('source_changed')
        await checkVersion(); assertCurrent(); assertLinkedCard(db, item); signal.throwIfAborted()
        await fs.promises.unlink(item.source!.key)
      }
      item.phase = 'removed'; save()
    } else {
      // Copies publish only from a verified, uniquely owned staging file.
      const stage = staged(item)
      if (item.phase === 'prepared') {
        // Failed transfers can only remove their own UUID staging object.
        if (await maybeStat(db, stage, signal)) await using(db, stage, signal, async a => { if (!a.remove) throw sourceError('read_only'); await a.remove(stage.key, signal) })
        if (item.source) await checkVersion()
        if (!stage.connectionId) {
          const space = fs.statfsSync(path.dirname(stage.key))
          if (space.bavail * space.bsize < item.total) throw sourceError('no_space', 507)
        }
        const source = item.source || {key: spool(db, item)}
        const sourceAdapter = await open(db, source, signal)
        try {
          const read = await sourceAdapter.read(source.key, undefined, signal)
          if (read.status !== 200) { if (!Buffer.isBuffer(read.body)) read.body.destroy(); throw sourceError('size_mismatch') }
          const input = Buffer.isBuffer(read.body) ? Readable.from([read.body]) : read.body
          try {
            await using(db, stage, signal, async a => { if (!a.write || !a.move) throw sourceError('read_only'); await a.write(stage.key, input, item.total, progress, signal) })
          } finally { input.destroy() }
        } finally { sourceAdapter.close() }
        if (item.source) await checkVersion()
        item.digest = await hash(db, stage, signal)
        if (item.kind === 'upload' && item.digest !== await hash(db, source, signal)) throw sourceError('size_mismatch')
        if ((await stat(db, stage, signal)).size !== item.total) throw sourceError('size_mismatch')
        item.phase = 'mutating'; save()
      }
      if (item.phase === 'mutating') {
        const target = await maybeStat(db, item.target!, signal)
        if (target) {
          const leftStage = await maybeStat(db, stage, signal)
          if (leftStage) {
            if (stage.connectionId) throw sourceError('conflict')
            const a = fs.lstatSync(stage.key), b = fs.lstatSync(item.target!.key)
            if (a.ino !== b.ino || a.dev !== b.dev) throw sourceError('conflict')
          }
          if (target.isDirectory || target.size !== item.total || await hash(db, item.target!, signal) !== item.digest) throw sourceError('conflict')
        } else {
          if ((await stat(db, stage, signal)).size !== item.total || await hash(db, stage, signal) !== item.digest) throw sourceError('size_mismatch')
          assertCurrent(); assertCard(db, item)
          await using(db, stage, signal, async a => { if (!a.move) throw sourceError('read_only'); await a.move(stage.key, item.target!.key, signal) })
        }
        item.phase = 'published'; save()
      }
      if (['rename', 'move'].includes(item.kind)) {
        const published = await stat(db, item.target!, signal)
        if (published.isDirectory || published.size !== item.total || await hash(db, item.target!, signal) !== item.digest) throw sourceError('source_changed')
        if (item.phase === 'published') {
          assertCurrent(); await linkCard(db, item, await stat(db, item.target!, signal), assertCurrent); item.phase = 'linked'; save()
        }
        // The card already points to a complete target. A failed unlink is retryable.
        const source = await maybeStat(db, item.source!, signal)
        if (source) {
          const before = await stat(db, item.target!, signal)
          if (before.size !== item.total || await hash(db, item.target!, signal) !== item.digest
            || (await stat(db, item.target!, signal)).version !== before.version) throw sourceError('source_changed')
          await checkVersion(); assertCurrent(); assertLinkedCard(db, item)
          await using(db, item.source!, signal, async a => a.remove!(item.source!.key, signal))
        }
        item.phase = 'removed'; save()
      }
      // A crash between hard-link publication and unlink may leave a complete stage.
      if (await maybeStat(db, stage, signal)) await using(db, stage, signal, async a => a.remove!(stage.key, signal))
    }
    item.state = 'completed'; item.bytes = item.total; delete item.error; save()
    invalidateMediaDerivedCaches()
    if (item.kind === 'upload') fs.rmSync(spool(db, item), {force: true})
  }
  async function tick() {
    if (busy || disposed) return
    const pinned = pinSourceDb(publicDb)
    initialize(pinned.db)
    const job = readJobs(pinned.db).find(job => job.state === 'queued')
    if (!job) return
    const locks = [...new Set(job.items.flatMap(item => [item.source, item.target].filter((ref): ref is OriginalTarget => !!ref).map(ref => `${pinned.db.sqlite.name}:${ref.connectionId || 'local'}`)))]
    if (locks.some(lock => sourceOperationLocks.has(lock))) return
    locks.forEach(lock => sourceOperationLocks.add(lock))
    busy = true; controller = new AbortController(); runningJob = {id: job.id, sqlite: pinned.db.sqlite}
    const signal = controller.signal
    const assertCurrent = () => {
      pinned.assertCurrent()
      for (const [id, version] of Object.entries(job.connectionVersions || {})) if (connectionVersion(pinned.db, id) !== version) throw sourceError('source_changed')
    }
    try {
      job.state = 'running'; persist(pinned.db, job)
      for (const item of job.items) {
        if (terminal(item)) continue
        item.state = 'running'; persist(pinned.db, job)
        try {
          await runItem(pinned.db, job, item, signal, assertCurrent)
          if (item.kind === 'upload' && terminal(item)) fs.rmSync(spool(pinned.db, item), {force: true})
        } catch (err) { item.state = 'failed'; item.error = signal.aborted ? 'cancelled' : errorCode(err); persist(pinned.db, job); break }
        if (signal.aborted) break
        try { pinned.assertCurrent() } catch { break }
      }
      job.state = job.items.every(terminal) ? 'completed' : 'failed'; persist(pinned.db, job)
    } finally { busy = false; controller = undefined; runningJob = undefined; locks.forEach(lock => sourceOperationLocks.delete(lock)) }
  }
  const wake = () => { void Promise.resolve().then(tick).catch(() => {}) }
  return {
    jobs() { const {db} = pinSourceDb(publicDb); initialize(db); return clone(readJobs(db)) },
    job(id: string) { const {db} = pinSourceDb(publicDb); initialize(db); return clone(load(db, id)) },
    create(input: unknown) {
      const parsed = OriginalBatchSchema.parse(input)
      const {db} = pinSourceDb(publicDb); initialize(db)
      const job: OriginalJob = {id: randomUUID(), createdAt: new Date().toISOString(), state: parsed.items.some(item => item.kind === 'upload') ? 'awaiting_upload' : 'queued',
        items: parsed.items.map(item => ({...item, id: randomUUID(), state: 'pending', phase: 'pending', bytes: 0, total: item.uploadSize || 0}))}
      // Capture identity at submission; queued operations cannot silently act on a relinked card.
      for (const item of job.items) if (item.mediaId) { const initial = snapshot(db, item); item.sourcePath = initial.path; item.source = initial.ref; item.version = initial.version }
      job.connectionVersions = Object.fromEntries([...new Set(job.items.flatMap(item => [item.source?.connectionId, item.target?.connectionId]).filter((id): id is string => !!id))]
        .map(id => [id, connectionVersion(db, id)]))
      persist(db, job); wake(); return clone(job)
    },
    retry(id: string, conflict?: OriginalItem['conflict']) {
      const {db} = pinSourceDb(publicDb); initialize(db)
      const job = load(db, id)
      if (!['failed', 'interrupted'].includes(job.state)) throw sourceError('conflict')
      for (const item of job.items) if (!terminal(item)) {
        // A refused publication has not changed the original. Re-plan only
        // those destinations; an ambiguous or already published move keeps its checkpoint.
        if (item.error === 'conflict' && conflict && !item.drive && ['prepared', 'mutating'].includes(item.phase)) item.phase = 'pending'
        item.state = 'pending'; delete item.error
        if (conflict) item.conflict = conflict
      }
      job.state = job.items.some(item => item.kind === 'upload' && !item.readyUpload) ? 'awaiting_upload' : 'queued'
      persist(db, job); wake(); return clone(job)
    },
    async upload(id: string, itemId: string, input: Readable) {
      const pinned = pinSourceDb(publicDb); initialize(pinned.db)
      const job = load(pinned.db, id)
      const item = job.items.find(item => item.id === itemId && item.kind === 'upload')
      if (!item || job.state !== 'awaiting_upload' || item.readyUpload || uploads.size) throw sourceError('conflict')
      uploads.add(itemId)
      const dir = directoryFor(pinned.db)
      fs.mkdirSync(dir, {recursive: true, mode: 0o700})
      const filename = spool(pinned.db, item)
      const temporary = filename + '.part'
      let bytes = 0, last = 0
      try {
        fs.rmSync(temporary, {force: true})
        fs.rmSync(filename, {force: true})
        if (fs.statfsSync(dir).bavail * fs.statfsSync(dir).bsize < item.uploadSize!) throw sourceError('no_space')
        await pipeline(input, new Transform({transform(chunk: Buffer, _encoding, callback) {
          try {
            pinned.assertCurrent(); bytes += chunk.length
            if (bytes > item.uploadSize!) throw sourceError('size_mismatch')
            item.bytes = bytes
            if (Date.now() - last > 250) { last = Date.now(); persist(pinned.db, job) }
            callback(null, chunk)
          } catch (err) { callback(err as Error) }
        }}), fs.createWriteStream(temporary, {flags: 'w', mode: 0o600}))
        pinned.assertCurrent()
        if (bytes !== item.uploadSize) throw sourceError('size_mismatch')
        fs.renameSync(temporary, filename); item.readyUpload = true; item.bytes = 0; delete item.error
        if (job.items.every(row => row.kind !== 'upload' || row.readyUpload)) job.state = 'queued'
        persist(pinned.db, job); wake(); return clone(job)
      } catch (err) { item.error = errorCode(err); persist(pinned.db, job); throw err }
      finally { uploads.delete(itemId); fs.rmSync(temporary, {force: true}) }
    },
    cancel(id: string) {
      const {db} = pinSourceDb(publicDb)
      const job = load(db, id)
      if (job.state === 'running' && runningJob?.id === id && runningJob.sqlite === db.sqlite) { controller?.abort(); return }
      if (job.state === 'queued') { job.state = 'interrupted'; persist(db, job) }
    },
    tick,
    dispose() { disposed = true; controller?.abort() },
  }
}
