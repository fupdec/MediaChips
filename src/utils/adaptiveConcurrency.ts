export type AdaptiveOptions<T> = {
  /** Jobs run together at first; the limit then grows and shrinks between `min` and `max`. */
  start?: number
  min?: number
  max?: number
  /** Successful jobs in a row before one more may run at once. */
  growEvery?: number
  /** Extra attempts for a job that failed because the service throttled it. */
  retries?: number
  /** Pause before new jobs start after a throttling failure. */
  cooldownMs?: number
  /** True for failures that mean "slow down" (rate limit, timeout, network drop), not "this job is wrong". */
  isThrottled: (err: unknown) => boolean
  /** A job that failed for good: not throttled, or out of retries. */
  onFailure: (item: T, err: unknown) => void
}

/**
 * Runs `run` over `items` with as many at once as the service tolerates: slow start, grow while jobs succeed,
 * halve and pause on a throttling failure (retrying that job). Returns the highest number that ran together.
 */
export async function runAdaptive<T>(items: T[], run: (item: T) => Promise<void>, options: AdaptiveOptions<T>): Promise<{peak: number}> {
  const {min = 1, max = 8, growEvery = 4, retries = 2, cooldownMs = 2000} = options
  const queue = items.map((item) => ({item, attempts: 0}))
  let limit = Math.min(max, Math.max(min, options.start ?? 3))
  let active = 0
  let streak = 0
  let peak = 0
  let pausedUntil = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  return new Promise((resolve) => {
    const pump = () => {
      if (!queue.length && active === 0) { resolve({peak}); return }
      const wait = pausedUntil - Date.now()
      if (wait > 0) {
        if (queue.length && timer === undefined) timer = setTimeout(() => { timer = undefined; pump() }, wait)
        return
      }
      while (active < limit && queue.length) {
        const job = queue.shift()!
        active += 1
        peak = Math.max(peak, active)
        run(job.item).then(() => {
          streak += 1
          if (streak >= growEvery && limit < max) { limit += 1; streak = 0 }
        }, (err: unknown) => {
          if (options.isThrottled(err)) {
            limit = Math.max(min, Math.floor(limit / 2))
            streak = 0
            pausedUntil = Date.now() + cooldownMs
            if (job.attempts < retries) { job.attempts += 1; queue.unshift(job); return }
          }
          options.onFailure(job.item, err)
        }).finally(() => { active -= 1; pump() })
      }
    }
    pump()
  })
}

/** HTTP and network failures that mean the service (or the connection) is overloaded rather than the request being wrong. */
export function isThrottleError(err: unknown): boolean {
  const e = err as {response?: {status?: number, data?: {message?: string, code?: string}}, code?: string, message?: string} | null
  const status = e?.response?.status
  if (status === 429 || status === 502 || status === 503 || status === 504) return true
  if (!e?.response && (e?.code === 'ECONNABORTED' || e?.code === 'ERR_NETWORK')) return true
  const text = `${e?.response?.data?.code || ''} ${e?.response?.data?.message || ''} ${e?.message || ''}`
  return /rate.?limit|quota|too many requests|timed? ?out|ETIMEDOUT|ECONNRESET|socket hang up/i.test(text)
}
