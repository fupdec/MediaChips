import {runLibraryOperation, bindLibraryOperation} from '../libraryMaintenance'
import {getFfmpegPath} from '../../utils/ffmpegPaths'
import fs from 'fs'
import os from 'os'
import path from 'path'
import {randomUUID} from 'crypto'
import {Readable, Transform} from 'stream'
import {pipeline} from 'stream/promises'
import type {ApiDb} from '../../types/db'
import {createProcessingQueue, DEFAULT_PROCESSING_LIMITS, type ProcessingLimits} from '../../../packages/processing-core/src'
import {transcodeRemote} from '../../../packages/remote-transcode/src'
import {createBackgroundStoryboard} from '../../../packages/background-storyboard/src'
import {extractFrame} from '../../../packages/frame-extraction/src'
import {RemoteProcessingInputSchema, type RemoteProcessingJob} from '../../../shared/remoteProcessing'
import {resolveMediaLocation} from '../mediaSources/locations'
import {pinSourceDb, openSource, sourceError} from '../mediaSources/context'
import type {SourceReadAdapter} from '../mediaSources/adapter'

// One queue per API process, shared across libraries and providers.
export function createRemoteProcessing(options: {limits?: ProcessingLimits; ffmpeg?: string; open?: typeof openSource; base?: string} = {}) {
  const base = options.base || path.join(process.env.MEDIA_CHIPS_DATA_DIR || process.app_folder || path.join(os.homedir(), '.mediachips'), 'remote-processing')
  fs.mkdirSync(base, {recursive: true, mode: 0o700})
  // Expired artifacts from a previous process are not addressable and may be reclaimed.
  for (const name of fs.readdirSync(base)) if (/^mc-processing-[A-Za-z0-9]+$/.test(name)) {
    const target = path.join(base, name)
    if (fs.lstatSync(target).mtimeMs < Date.now() - 60 * 60_000) fs.rmSync(target, {recursive: true, force: true})
  }
  const queue = createProcessingQueue(options.limits || DEFAULT_PROCESSING_LIMITS)
  const jobs = new Map<string, {job: RemoteProcessingJob; controller: AbortController; db: ApiDb['sqlite']; directory?: string; file?: string; expires: number; assertCurrent: () => void}>()
  const cleanup = () => {
    for (const [id, entry] of jobs) if (entry.expires < Date.now() && !['queued', 'running'].includes(entry.job.state)) {
      if (entry.directory) fs.rmSync(entry.directory, {recursive: true, force: true})
      jobs.delete(id)
    }
  }
  const cleanupTimer = setInterval(cleanup, 60_000)
  cleanupTimer.unref()
  const find = (db: ApiDb, id: string) => {
    cleanup()
    const entry = jobs.get(id)
    if (!entry || entry.db !== pinSourceDb(db).db.sqlite) throw sourceError('processing_job_not_found', 404)
    return entry
  }
  return {
    limits: queue.limits,
    dispose() { clearInterval(cleanupTimer); for (const entry of jobs.values()) entry.controller.abort() },
    submit(db: ApiDb, raw: unknown) {
      cleanup()
      if (jobs.size >= 32) throw sourceError('processing_storage_full', 429)
      const input = RemoteProcessingInputSchema.parse(raw), pinned = pinSourceDb(db)
      const resolved = resolveMediaLocation(pinned.db, input.mediaId)
      if (resolved.provider === 'local') throw sourceError('unsupported_source', 400)
      const originalPath = resolved.card.path, connectionId = resolved.connection.id, key = resolved.location.resourceKey
      const version = resolved.location.version
      const controller = new AbortController()
      const job: RemoteProcessingJob = {id: randomUUID(), mediaId: input.mediaId, kind: input.kind, state: 'queued'}
      const assertCurrent = () => {
        pinned.assertCurrent()
        const current = resolveMediaLocation(pinned.db, input.mediaId)
        if (current.provider === 'local' || current.card.path !== originalPath || current.location.version !== version) throw sourceError('source_changed')
      }
      const entry: typeof jobs extends Map<string, infer T> ? T : never = {job, controller, db: pinned.db.sqlite, expires: Date.now() + 30 * 60_000, assertCurrent}
      jobs.set(job.id, entry)
      void runLibraryOperation(() => queue.run(bindLibraryOperation(async (signal: AbortSignal) => {
        job.state = 'running'
        let adapter: SourceReadAdapter | undefined
        try {
          assertCurrent()
          adapter = await (options.open || openSource)(pinned.db, connectionId, signal)
          const before = await adapter.stat(key, signal)
          if (before.isDirectory || !before.contentType.startsWith('video/') || before.version !== version) throw sourceError('source_changed')
          if (!Number.isSafeInteger(before.size) || before.size <= 0 || before.size > queue.limits.maxInputBytes) throw sourceError('processing_input_limit', 413)
          fs.mkdirSync(base, {recursive: true, mode: 0o700})
          const directory = fs.mkdtempSync(path.join(base, 'mc-processing-'))
          entry.directory = directory
          const inputFile = path.join(directory, 'input.media')
          const result = await adapter.read(key, undefined, signal)
          if (result.status !== 200) throw sourceError('processing_download_failed')
          let size = 0
          const bound = new Transform({transform(chunk, _encoding, callback) {
            size += chunk.length
            callback(size > before.size || size > queue.limits.maxInputBytes ? sourceError('processing_input_limit', 413) : null, chunk)
          }})
          await pipeline(Buffer.isBuffer(result.body) ? Readable.from([result.body]) : result.body, bound, fs.createWriteStream(inputFile, {flags: 'wx', mode: 0o600}), {signal})
          const after = await adapter.stat(key, signal)
          assertCurrent()
          if (size !== before.size || after.version !== before.version || after.size !== size) throw sourceError('source_changed')
          const ffmpeg = options.ffmpeg || getFfmpegPath()
          const context = {input: inputFile, directory, ffmpeg, limits: queue.limits, signal}
          entry.file = input.kind === 'transcode' ? await transcodeRemote(context)
            : input.kind === 'storyboard' ? await createBackgroundStoryboard(context, input.intervalSeconds) : await extractFrame(context, input.seconds)
          signal.throwIfAborted(); assertCurrent()
          fs.rmSync(inputFile, {force: true})
          job.state = 'completed'; job.resultUrl = `/api/remote-processing/jobs/${job.id}/result`
          entry.expires = Date.now() + 30 * 60_000
        } finally {
          adapter?.close()
          if (job.state !== 'completed' && entry.directory) fs.rmSync(entry.directory, {recursive: true, force: true})
        }
      }), controller.signal)).catch(err => {
        job.state = controller.signal.aborted ? 'cancelled' : 'failed'
        const code = (err as {code?: string; message?: string})?.code || (err as Error)?.message
        job.error = typeof code === 'string' && /^[a-z_]+$/.test(code) ? code : 'processing_failed'
        entry.expires = Date.now() + 30 * 60_000
      })
      return {...job}
    },
    list(db: ApiDb) { cleanup(); return [...jobs.values()].filter(entry => entry.db === pinSourceDb(db).db.sqlite).map(entry => ({...entry.job})) },
    job(db: ApiDb, id: string) { return {...find(db, id).job} },
    cancel(db: ApiDb, id: string) { const entry = find(db, id); if (['queued', 'running'].includes(entry.job.state)) entry.controller.abort() },
    result(db: ApiDb, id: string) {
      const entry = find(db, id)
      entry.assertCurrent()
      if (entry.job.state !== 'completed' || !entry.file || !fs.existsSync(entry.file)) throw sourceError('processing_result_unavailable')
      return entry.file
    },
    remove(db: ApiDb, id: string) {
      const entry = find(db, id)
      if (['queued', 'running'].includes(entry.job.state)) throw sourceError('processing_busy')
      if (entry.directory) fs.rmSync(entry.directory, {recursive: true, force: true})
      jobs.delete(id)
    },
  }
}
let singleton: ReturnType<typeof createRemoteProcessing> | undefined
export const getRemoteProcessing = () => singleton ||= createRemoteProcessing()
