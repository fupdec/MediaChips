import {
  estimateDownloadEtaSeconds,
  resolveDownloadPercent,
  formatEtaClock,
  formatLoadedTotalMb,
} from './downloadProgress'

export type XenovaProgressCallbackData = {
  status?: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
}

export type XenovaDownloadProgress = {
  loaded: number
  total: number | null
  percent: number
}

/** Aggregate @xenova/transformers per-file progress into overall bytes/%. */
export function createXenovaDownloadTracker(expectedBytes: number) {
  const files = new Map<string, {loaded: number; total: number}>()
  let snapshot: XenovaDownloadProgress = {
    loaded: 0,
    total: null,
    percent: 0,
  }

  const refresh = () => {
    let loaded = 0
    let total = 0
    let hasTotal = false
    for (const entry of files.values()) {
      loaded += entry.loaded
      if (entry.total > 0) {
        total += entry.total
        hasTotal = true
      }
    }
    snapshot = {
      loaded,
      total: hasTotal ? total : null,
      percent: resolveDownloadPercent({
        loaded,
        total: hasTotal ? total : null,
        expectedBytes,
      }),
    }
  }

  return {
    handle(data: XenovaProgressCallbackData) {
      if (data?.status !== 'progress') return
      const key = String(data.file || data.status || 'file')
      files.set(key, {
        loaded: Math.max(0, Number(data.loaded) || 0),
        total: Math.max(0, Number(data.total) || 0),
      })
      refresh()
    },
    get(): XenovaDownloadProgress {
      return snapshot
    },
    buildMessage(label: string, startedAt: number): string {
      const {loaded, total, percent} = snapshot
      const size = formatLoadedTotalMb(loaded, total, expectedBytes)
      const etaSeconds = estimateDownloadEtaSeconds({
        loaded,
        total,
        expectedBytes,
        elapsedMs: Date.now() - startedAt,
      })
      const eta = formatEtaClock(etaSeconds)
      if (eta) return `Downloading ${label}… ${percent}% (${size}, ~${eta} left)`
      if (percent > 0) return `Downloading ${label}… ${percent}% (${size})`
      return `Downloading ${label}…`
    },
  }
}
