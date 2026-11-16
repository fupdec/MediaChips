import type {ApiRequest, ApiResponse} from '../../types/http'
import {apiErrorMessage} from '../../types/errors'

export function createStreamAbortSignal(req: ApiRequest, res: ApiResponse): () => boolean {
  let stopped = false
  const stop = () => {
    stopped = true
  }

  // Do not use req 'close': on Windows it fires once the POST body is read,
  // which cancels long-running stream tasks before any work starts.
  req.on('aborted', stop)
  res.on('close', () => {
    if (!res.writableFinished) {
      stop()
    }
  })

  return () => stopped
}

export function setNdjsonStreamHeaders(res: ApiResponse) {
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('X-Accel-Buffering', 'no')
}

export function writeNdjson(res: ApiResponse, event: unknown) {
  res.write(`${JSON.stringify(event)}\n`)
}

function isProgressEvent(event: unknown): boolean {
  return Boolean(
    event
    && typeof event === 'object'
    && 'type' in event
    && (event as {type?: unknown}).type === 'progress',
  )
}

export type NdjsonIterate = (
  shouldStop: () => boolean,
) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>

const NDJSON_PROGRESS_MIN_MS = 100

/**
 * Run an async generator as an NDJSON HTTP response with shared abort wiring.
 * Progress events are coalesced (~100ms) so mass tasks do not flood the UI.
 */
export async function runNdjsonAsyncGenerator(
  req: ApiRequest,
  res: ApiResponse,
  {
    iterate,
    errorMessage,
    shouldStop,
  }: {
    iterate: NdjsonIterate
    errorMessage: string
    shouldStop?: () => boolean
  },
): Promise<void> {
  const writeEvent = (event: unknown) => writeNdjson(res, event)

  try {
    setNdjsonStreamHeaders(res)
    const stop = shouldStop ?? createStreamAbortSignal(req, res)
    const iterable = await iterate(stop)
    let lastProgressAt = 0
    let pendingProgress: unknown = null

    const flushProgress = () => {
      if (pendingProgress == null) return
      writeEvent(pendingProgress)
      pendingProgress = null
      lastProgressAt = Date.now()
    }

    for await (const event of iterable) {
      if (isProgressEvent(event)) {
        pendingProgress = event
        if (Date.now() - lastProgressAt >= NDJSON_PROGRESS_MIN_MS) {
          flushProgress()
        }
        continue
      }
      flushProgress()
      writeEvent(event)
    }
    flushProgress()
    res.end()
  } catch (err) {
    writeEvent({
      type: 'error',
      message: apiErrorMessage(err) || errorMessage,
    })
    res.end()
  }
}
