/** Pure helpers for Local AI model download progress. */

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

export function buildLocalAiDownloadStartMessage(sizeMb: number): string {
  return `Downloading Local AI model (~${sizeMb} MB)…`
}

export function buildLocalAiDownloadProgressMessage(percent: number): string {
  return `Downloading Local AI model… ${percent}%`
}
