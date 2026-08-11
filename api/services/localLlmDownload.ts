/** Pure helpers for Local AI model download progress. */
import {
  estimateDownloadEtaSeconds,
  formatEtaClock,
  resolveDownloadPercent,
} from './downloadProgress'

export {resolveDownloadPercent, estimateDownloadEtaSeconds}

export function buildLocalAiDownloadStartMessage(sizeMb: number): string {
  return `Downloading Local AI model (~${sizeMb} MB)…`
}

export function buildLocalAiDownloadProgressMessage(
  percent: number,
  etaSeconds?: number | null,
): string {
  const eta = formatEtaClock(etaSeconds)
  if (eta) return `Downloading Local AI model… ${percent}% (~${eta} left)`
  return `Downloading Local AI model… ${percent}%`
}
