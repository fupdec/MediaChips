/** Work done so far in one phase; `total` is 0 while it is not known yet. */
export type ProgressSample = {done: number; total: number; startedAt: number}

/** Below this many finished units, or this much elapsed time, a rate is too noisy to quote. */
const MIN_DONE = 3
const MIN_ELAPSED_MS = 1500

/** Milliseconds left at the average pace since `startedAt`, or null while the estimate would be a guess. */
export function estimateRemainingMs(sample: ProgressSample, now = Date.now()): number | null {
  const {done, total, startedAt} = sample
  if (total <= 0 || done <= 0 || done >= total) return done >= total && total > 0 ? 0 : null
  const elapsed = now - startedAt
  if (done < MIN_DONE || elapsed < MIN_ELAPSED_MS) return null
  return Math.round((elapsed / done) * (total - done))
}

/** `m:ss` or `h:mm:ss`; the same in every language. */
export function formatClock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}
