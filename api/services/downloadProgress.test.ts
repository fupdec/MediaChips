import {describe, expect, it} from 'vitest'
import {
  estimateDownloadEtaSeconds,
  formatEtaClock,
  formatLoadedTotalMb,
  resolveDownloadPercent,
} from './downloadProgress'

describe('downloadProgress', () => {
  it('computes percent from total or expected size', () => {
    expect(resolveDownloadPercent({
      loaded: 50,
      total: 100,
      expectedBytes: 1000,
    })).toBe(50)
    expect(resolveDownloadPercent({
      loaded: 5 * 1024 * 1024,
      total: null,
      expectedBytes: 10 * 1024 * 1024,
    })).toBe(50)
    expect(resolveDownloadPercent({
      loaded: 999,
      total: 100,
      expectedBytes: 100,
    })).toBe(99)
  })

  it('estimates ETA after enough bytes', () => {
    expect(estimateDownloadEtaSeconds({
      loaded: 100,
      total: 1000,
      expectedBytes: 1000,
      elapsedMs: 100,
    })).toBeNull()
    expect(estimateDownloadEtaSeconds({
      loaded: 5 * 1024 * 1024,
      total: 10 * 1024 * 1024,
      expectedBytes: 10 * 1024 * 1024,
      elapsedMs: 5000,
    })).toBe(5)
  })

  it('formats ETA and size labels', () => {
    expect(formatEtaClock(65)).toBe('1:05')
    expect(formatEtaClock(3661)).toBe('1:01:01')
    expect(formatLoadedTotalMb(5 * 1024 * 1024, 10 * 1024 * 1024, 10 * 1024 * 1024))
      .toContain('/')
  })
})
