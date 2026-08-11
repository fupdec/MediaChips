import {postApiNdjsonStream} from './ndjsonStream'

export type ModelDownloadProgressEvent = {
  type?: string
  phase?: string
  message?: string
  percent?: number
  loaded?: number
  total?: number | null
  etaSeconds?: number | null
  sizeMb?: number
  parsed?: {status?: unknown}
}

export type ModelDownloadProgress = {
  percent: number
  message: string
  etaSeconds: number | null
  loaded?: number
  total?: number | null
}

/**
 * Consume an NDJSON model-download endpoint; resolve with final status payload.
 */
export async function streamModelDownload(
  path: string,
  options: {
    body?: unknown
    signal?: AbortSignal
    onProgress?: (progress: ModelDownloadProgress) => void
    errorMessage?: string
  } = {},
): Promise<{status?: unknown}> {
  let status: unknown
  let streamError: string | null = null
  let aborted = false

  await postApiNdjsonStream<ModelDownloadProgressEvent>(
    path,
    {
      body: options.body ?? {},
      signal: options.signal,
      errorMessage: options.errorMessage || 'Model download failed',
    },
    (event) => {
      if (event.type === 'status') {
        const percent = typeof event.percent === 'number' ? event.percent : 0
        options.onProgress?.({
          percent,
          message: String(event.message || ''),
          etaSeconds: typeof event.etaSeconds === 'number' ? event.etaSeconds : null,
          loaded: typeof event.loaded === 'number' ? event.loaded : undefined,
          total: event.total === undefined ? undefined : event.total,
        })
        return
      }
      if (event.type === 'done') {
        status = event.parsed?.status
        options.onProgress?.({
          percent: 100,
          message: String(event.message || ''),
          etaSeconds: 0,
        })
        return
      }
      if (event.type === 'aborted') {
        aborted = true
        return
      }
      if (event.type === 'error') {
        streamError = String(event.message || options.errorMessage || 'Model download failed')
      }
    },
  )

  if (aborted) {
    const error = new Error('aborted')
    error.name = 'AbortError'
    throw error
  }
  if (streamError) throw new Error(streamError)
  return {status}
}
