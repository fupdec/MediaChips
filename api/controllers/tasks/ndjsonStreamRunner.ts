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

export type NdjsonIterate = (
  shouldStop: () => boolean,
) => AsyncIterable<unknown> | Promise<AsyncIterable<unknown>>

/**
 * Run an async generator as an NDJSON HTTP response with shared abort wiring.
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
    for await (const event of iterable) {
      writeEvent(event)
    }
    res.end()
  } catch (err) {
    writeEvent({
      type: 'error',
      message: apiErrorMessage(err) || errorMessage,
    })
    res.end()
  }
}
