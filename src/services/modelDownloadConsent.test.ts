import {describe, expect, it} from 'vitest'
import {
  formatEtaLabel,
  formatModelDownloadConfirmText,
  formatModelDownloadProgressText,
  isModelStatusReady,
  MODEL_DOWNLOAD_SIZES_MB,
} from './modelDownloadConsent'

describe('modelDownloadConsent', () => {
  const t = (key: string, params: Record<string, string | number> = {}) => {
    if (key === 'ai.models.confirm_one') return `Download ${params.name} (~${params.size} MB)?`
    if (key === 'ai.models.list_item') return `• ${params.name} (~${params.size} MB)`
    if (key === 'ai.models.confirm_many') return `Download:\n${params.list}`
    if (key === 'ai.models.downloading') return `Downloading ${params.name} (~${params.size} MB)…`
    if (key === 'ai.models.downloading_progress') return `Downloading ${params.name}… ${params.percent}%`
    if (key === 'ai.models.downloading_progress_eta') {
      return `Downloading ${params.name}… ${params.percent}% (~${params.eta} left)`
    }
    return key
  }

  it('formats single and multi confirm text', () => {
    expect(formatModelDownloadConfirmText(
      [{name: 'CLIP', sizeMb: 150}],
      t,
    )).toContain('CLIP')
    expect(formatModelDownloadConfirmText(
      [
        {name: 'Face', sizeMb: 16},
        {name: 'CLIP', sizeMb: 150},
      ],
      t,
    )).toContain('Face')
  })

  it('formats progress with percent and ETA', () => {
    expect(formatModelDownloadProgressText(
      {name: 'CLIP', sizeMb: 150},
      null,
      t,
    )).toContain('150')
    expect(formatModelDownloadProgressText(
      {name: 'CLIP', sizeMb: 150},
      {percent: 42, message: '', etaSeconds: null},
      t,
    )).toContain('42%')
    expect(formatModelDownloadProgressText(
      {name: 'CLIP', sizeMb: 150},
      {percent: 42, message: '', etaSeconds: 65},
      t,
    )).toContain('1:05')
    expect(formatEtaLabel(3661)).toBe('1:01:01')
  })

  it('treats downloaded/loaded as ready', () => {
    expect(isModelStatusReady('downloaded')).toBe(true)
    expect(isModelStatusReady('loaded')).toBe(true)
    expect(isModelStatusReady('not_downloaded')).toBe(false)
  })

  it('exposes size table for known models', () => {
    expect(MODEL_DOWNLOAD_SIZES_MB.clip).toBe(150)
    expect(MODEL_DOWNLOAD_SIZES_MB.faceEmbed).toBe(170)
  })
})
