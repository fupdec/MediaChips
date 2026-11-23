import {createHash, randomUUID} from 'node:crypto'

/**
 * Server-side bulk job: processes unique ids in batches, can be stopped between batches,
 * keeps per-id results, retries only failed ids and resumes what was not reached.
 * An identical running job (same kind, options and ids) is returned instead of duplicated.
 */
export type BulkChunkResult = {done?: number[]; failed?: number[]}
export type BulkJobStatus = 'running' | 'stopping' | 'stopped' | 'completed'

export interface BulkJobSnapshot {
  id: string
  kind: string
  status: BulkJobStatus
  total: number
  processed: number
  doneIds: number[]
  failedIds: number[]
  doneCount: number
  failedCount: number
  /** Ids not reached yet (after a stop). */
  remaining: number
}

interface Job {
  id: string
  kind: string
  key: string
  status: BulkJobStatus
  queue: number[]
  total: number
  processed: number
  done: Set<number>
  failed: Set<number>
  runChunk: (ids: number[]) => Promise<BulkChunkResult>
  batchSize: number
  finishedAt: number | null
  loop: Promise<void> | null
}

const jobs = new Map<string, Job>()
const RETAIN_FINISHED_MS = 30 * 60_000

export function normalizeBulkIds(ids: unknown[]): number[] {
  return [...new Set(ids.map(Number).filter(id => Number.isInteger(id) && id > 0))]
}

function jobKey(kind: string, options: unknown, ids: number[]): string {
  const hash = createHash('sha1')
  hash.update(kind).update(JSON.stringify(options ?? null))
  for (const id of [...ids].sort((a, b) => a - b)) hash.update(`,${id}`)
  return hash.digest('hex')
}

function snapshot(job: Job, withIds = true): BulkJobSnapshot {
  const active = job.status === 'running' || job.status === 'stopping'
  return {
    id: job.id,
    kind: job.kind,
    status: job.status,
    total: job.total,
    processed: job.processed,
    // Id lists can reach hundreds of thousands: send them only once the job is no longer active,
    // and let pollers that only need counters skip them entirely (withIds = false).
    doneIds: active || !withIds ? [] : [...job.done],
    failedIds: active || !withIds ? [] : [...job.failed],
    doneCount: job.done.size,
    failedCount: job.failed.size,
    remaining: job.queue.length,
  }
}

function pruneFinished(now = Date.now()) {
  for (const [id, job] of jobs) {
    if (job.finishedAt && now - job.finishedAt > RETAIN_FINISHED_MS) jobs.delete(id)
  }
}

function drive(job: Job) {
  job.status = 'running'
  job.finishedAt = null
  job.loop = (async () => {
    while (job.queue.length) {
      if (job.status === 'stopping') break
      const chunk = job.queue.splice(0, job.batchSize)
      try {
        const result = await job.runChunk(chunk)
        const failed = new Set(result.failed ?? [])
        const done = new Set(result.done ?? [])
        for (const id of chunk) {
          // Ids the runner did not mention count as failed: never report unconfirmed work as done.
          if (failed.has(id) || !done.has(id)) job.failed.add(id)
          else job.done.add(id)
        }
      } catch {
        for (const id of chunk) job.failed.add(id)
      }
      job.processed += chunk.length
    }
    job.status = job.queue.length ? 'stopped' : 'completed'
    job.finishedAt = Date.now()
    job.loop = null
  })()
}

export function startBulkJob(input: {
  kind: string
  ids: number[]
  options?: unknown
  runChunk: Job['runChunk']
  batchSize?: number
}): BulkJobSnapshot {
  pruneFinished()
  const ids = normalizeBulkIds(input.ids)
  const key = jobKey(input.kind, input.options, ids)
  for (const job of jobs.values()) {
    if (job.key === key && (job.status === 'running' || job.status === 'stopping')) return snapshot(job)
  }
  const job: Job = {
    id: randomUUID(), kind: input.kind, key, status: 'running', queue: ids, total: ids.length,
    processed: 0, done: new Set(), failed: new Set(), runChunk: input.runChunk,
    batchSize: Math.max(1, input.batchSize ?? 500), finishedAt: null, loop: null,
  }
  jobs.set(job.id, job)
  drive(job)
  return snapshot(job)
}

export function getBulkJob(id: string, opts: {withIds?: boolean} = {}): BulkJobSnapshot | null {
  const job = jobs.get(id)
  return job ? snapshot(job, opts.withIds !== false) : null
}

/** Stops after the current batch. */
export function stopBulkJob(id: string): BulkJobSnapshot | null {
  const job = jobs.get(id)
  if (!job) return null
  if (job.status === 'running') job.status = 'stopping'
  return snapshot(job)
}

/** Continues the unreached ids and retries failed ones. No-op while the job is active. */
export function resumeBulkJob(id: string, opts: {retryFailed?: boolean} = {}): BulkJobSnapshot | null {
  const job = jobs.get(id)
  if (!job) return null
  if (job.status === 'running' || job.status === 'stopping') return snapshot(job)
  if (opts.retryFailed !== false) {
    job.queue.push(...job.failed)
    job.total += job.failed.size
    job.failed.clear()
  }
  if (job.queue.length) drive(job)
  return snapshot(job)
}

export async function waitForBulkJobForTests(id: string) {
  await jobs.get(id)?.loop
}

export function resetBulkJobsForTests() {
  jobs.clear()
}
