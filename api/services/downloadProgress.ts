import {
  downloadHttpFile,
  downloadHttpFileWithRetries,
  type DownloadHttpFileOptions,
  type DownloadHttpFileRetryOptions,
} from './httpFileDownload'

/** Pure helpers for HTTP model/file download progress (% + ETA). */

export function resolveDownloadPercent(input: {
  loaded: number
  total: number | null | undefined
  expectedBytes: number
}): number {
  const loaded = Math.max(0, Number(input.loaded) || 0)
  const total = input.total != null && Number(input.total) > 0
    ? Number(input.total)
    : Math.max(1, Number(input.expectedBytes) || 1)
  return Math.min(99, Math.round((loaded / total) * 100))
}

/** ETA in whole seconds from average speed so far; null until enough data. */
export function estimateDownloadEtaSeconds(input: {
  loaded: number
  total: number | null | undefined
  expectedBytes: number
  elapsedMs: number
}): number | null {
  const loaded = Math.max(0, Number(input.loaded) || 0)
  const elapsedMs = Math.max(0, Number(input.elapsedMs) || 0)
  if (loaded < 64 * 1024 || elapsedMs < 800) return null
  const total = input.total != null && Number(input.total) > 0
    ? Number(input.total)
    : Math.max(loaded + 1, Number(input.expectedBytes) || loaded + 1)
  const remaining = Math.max(0, total - loaded)
  if (remaining <= 0) return 0
  const bytesPerMs = loaded / elapsedMs
  if (!(bytesPerMs > 0)) return null
  return Math.max(1, Math.round(remaining / bytesPerMs / 1000))
}

export function formatEtaClock(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null
  const total = Math.round(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatLoadedTotalMb(loaded: number, total: number | null | undefined, expectedBytes: number): string {
  const toMb = (bytes: number) => Math.max(0, bytes) / (1024 * 1024)
  const loadedMb = toMb(loaded)
  const totalBytes = total != null && total > 0 ? total : expectedBytes
  const totalMb = toMb(totalBytes)
  if (totalMb >= 1) {
    return `${loadedMb.toFixed(loadedMb >= 100 ? 0 : 1)} / ${totalMb.toFixed(totalMb >= 100 ? 0 : 0)} MB`
  }
  return `${Math.round(loaded / 1024)} KB`
}

export type DownloadProgressEvent = {
  type: 'status'
  phase: 'downloading'
  message: string
  percent: number
  loaded: number
  total: number | null
  etaSeconds: number | null
}

export type IterateTrackedHttpDownloadInput = {
  url: string
  destination: string
  expectedBytes: number
  errorLabel: string
  /** Short label for status messages, e.g. "CLIP". */
  label: string
  shouldStop?: () => boolean
  pollMs?: number
  /** When set, use downloadHttpFileWithRetries. */
  retries?: Omit<DownloadHttpFileRetryOptions, 'onProgress' | 'signal' | 'errorLabel'>
  downloadOptions?: Omit<DownloadHttpFileOptions, 'onProgress' | 'signal' | 'errorLabel'>
}

function buildProgressMessage(input: {
  label: string
  percent: number
  loaded: number
  total: number | null
  expectedBytes: number
  etaSeconds: number | null
}): string {
  const size = formatLoadedTotalMb(input.loaded, input.total, input.expectedBytes)
  const eta = formatEtaClock(input.etaSeconds)
  if (eta) return `Downloading ${input.label}… ${input.percent}% (${size}, ~${eta} left)`
  if (input.percent > 0) return `Downloading ${input.label}… ${input.percent}% (${size})`
  return `Downloading ${input.label}…`
}

/**
 * Download a file while yielding NDJSON-friendly progress events (~every pollMs).
 */
export async function* iterateTrackedHttpDownload(
  input: IterateTrackedHttpDownloadInput,
): AsyncGenerator<DownloadProgressEvent> {
  const pollMs = Math.max(200, Number(input.pollMs) || 400)
  const signal = {aborted: false}
  const startedAt = Date.now()
  const progressState: {
    loaded: number
    total: number | null
    done: boolean
    error: Error | null
  } = {
    loaded: 0,
    total: null,
    done: false,
    error: null,
  }

  const onProgress = (loaded: number, total: number | null) => {
    progressState.loaded = loaded
    progressState.total = total
  }

  yield {
    type: 'status',
    phase: 'downloading',
    message: buildProgressMessage({
      label: input.label,
      percent: 0,
      loaded: 0,
      total: null,
      expectedBytes: input.expectedBytes,
      etaSeconds: null,
    }),
    percent: 0,
    loaded: 0,
    total: null,
    etaSeconds: null,
  }

  const downloadPromise = (
    input.retries
      ? downloadHttpFileWithRetries(input.url, input.destination, {
        ...input.retries,
        ...input.downloadOptions,
        errorLabel: input.errorLabel,
        onProgress,
        signal,
      })
      : downloadHttpFile(input.url, input.destination, {
        ...input.downloadOptions,
        errorLabel: input.errorLabel,
        onProgress,
        signal,
      })
  )
    .then(() => {
      progressState.done = true
    })
    .catch((error: unknown) => {
      progressState.error = error instanceof Error ? error : new Error(String(error))
      progressState.done = true
    })

  let lastPercent = -1
  let lastEtaBucket = -1
  while (!progressState.done) {
    if (input.shouldStop?.()) {
      signal.aborted = true
      await downloadPromise.catch(() => undefined)
      throw new Error('aborted')
    }
    const percent = resolveDownloadPercent({
      loaded: progressState.loaded,
      total: progressState.total,
      expectedBytes: input.expectedBytes,
    })
    const etaSeconds = estimateDownloadEtaSeconds({
      loaded: progressState.loaded,
      total: progressState.total,
      expectedBytes: input.expectedBytes,
      elapsedMs: Date.now() - startedAt,
    })
    const etaBucket = etaSeconds == null ? -1 : Math.round(etaSeconds / 5)
    if (percent !== lastPercent || etaBucket !== lastEtaBucket) {
      lastPercent = percent
      lastEtaBucket = etaBucket
      yield {
        type: 'status',
        phase: 'downloading',
        message: buildProgressMessage({
          label: input.label,
          percent,
          loaded: progressState.loaded,
          total: progressState.total,
          expectedBytes: input.expectedBytes,
          etaSeconds,
        }),
        percent,
        loaded: progressState.loaded,
        total: progressState.total,
        etaSeconds,
      }
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs))
  }

  if (progressState.error) {
    if (progressState.error.message === 'aborted' || input.shouldStop?.()) {
      throw new Error('aborted')
    }
    throw progressState.error
  }

  yield {
    type: 'status',
    phase: 'downloading',
    message: `Downloading ${input.label}… 100%`,
    percent: 100,
    loaded: progressState.loaded || input.expectedBytes,
    total: progressState.total ?? input.expectedBytes,
    etaSeconds: 0,
  }
}
