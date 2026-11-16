import type {ApiRequest, ApiResponse} from '../types/http'

/**
 * Abort when the client drops a GET (scroll unmount / HEAD cancel).
 * Prefer `aborted` + unfinished `res.close` — plain `req.close` fires too early
 * on Windows after the request body/headers are consumed (see ndjsonStreamRunner).
 */
export function createRequestAbortSignal(
  req: ApiRequest,
  res: ApiResponse,
): AbortSignal {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort()
  }

  req.on('aborted', abort)
  res.on('close', () => {
    if (!res.writableFinished) abort()
  })

  return controller.signal
}
