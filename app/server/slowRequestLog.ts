import {monitorEventLoopDelay} from 'perf_hooks'
import type {NextFunction, Request, Response} from 'express'

/** Requests whose response starts later than this are written to the server log. 0 disables. */
export const DEFAULT_SLOW_REQUEST_MS = 150
/** The event loop counts as blocked when its longest stall in a window exceeds this. */
export const DEFAULT_EVENT_LOOP_BLOCK_MS = 200

const THROTTLE_MS = 1000
const MONITOR_INTERVAL_MS = 10_000
const UNMATCHED_ROUTE = '(unmatched)'

type LogFn = (message: string) => void

export function parseThresholdMs(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback
}

/**
 * Route pattern (`/api/media/:id`) rather than the URL, so query strings, search terms and
 * file paths never reach the log file.
 */
export function describeRoute(req: Pick<Request, 'method' | 'baseUrl' | 'route'>): string {
  const pattern = typeof req.route?.path === 'string' ? `${req.baseUrl || ''}${req.route.path}` : UNMATCHED_ROUTE
  return `${req.method} ${pattern}`
}

/**
 * Logs requests that take a long time to start answering and exposes the same number as a
 * `Server-Timing` header, which browser DevTools show in the Network tab. Time is measured up
 * to the response headers, so long downloads and video streams are not reported as slow.
 */
export function createSlowRequestLogger(options: {
  thresholdMs: number
  log: LogFn
  now?: () => number
}) {
  const now = options.now ?? (() => performance.now())
  const lastLogged = new Map<string, {at: number; suppressed: number}>()

  function report(route: string, status: number, elapsed: number) {
    const at = now()
    const previous = lastLogged.get(route)
    if (previous && at - previous.at < THROTTLE_MS) {
      previous.suppressed += 1
      return
    }
    const extra = previous?.suppressed ? ` (+${previous.suppressed} similar since the last line)` : ''
    lastLogged.set(route, {at, suppressed: 0})
    options.log(`[slow-request] ${route} -> ${status} in ${Math.round(elapsed)} ms${extra}`)
  }

  return function slowRequestLogger(req: Request, res: Response, next: NextFunction) {
    if (options.thresholdMs <= 0) return next()
    const started = now()
    const writeHead = res.writeHead.bind(res) as (...args: unknown[]) => Response
    let measured = false

    res.writeHead = ((...args: unknown[]) => {
      if (!measured) {
        measured = true
        const elapsed = now() - started
        if (!res.headersSent) res.setHeader('Server-Timing', `app;dur=${elapsed.toFixed(1)}`)
        if (elapsed >= options.thresholdMs) report(describeRoute(req), res.statusCode, elapsed)
      }
      return writeHead(...args)
    }) as typeof res.writeHead

    next()
  }
}

/**
 * Warns when the server's event loop was blocked for a long time, for example by a synchronous
 * database query or file operation. Synchronous work freezes every request, so this points at
 * stalls that a single slow-request line would not explain.
 */
export function startEventLoopLagMonitor(options: {
  thresholdMs: number
  log: LogFn
  intervalMs?: number
}): () => void {
  if (options.thresholdMs <= 0) return () => {}
  const histogram = monitorEventLoopDelay({resolution: 10})
  histogram.enable()
  const timer = setInterval(() => {
    const maxMs = histogram.max / 1e6
    if (maxMs >= options.thresholdMs) {
      options.log(`[event-loop] blocked for up to ${Math.round(maxMs)} ms in the last ${Math.round((options.intervalMs ?? MONITOR_INTERVAL_MS) / 1000)} s`)
    }
    histogram.reset()
  }, options.intervalMs ?? MONITOR_INTERVAL_MS)
  timer.unref()
  return () => {
    clearInterval(timer)
    histogram.disable()
  }
}
