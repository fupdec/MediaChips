import {describe, expect, it} from 'vitest'
import {
  buildLocalAiDownloadProgressMessage,
  buildLocalAiDownloadStartMessage,
  resolveDownloadPercent,
} from './localLlmDownload'

describe('localLlmDownload', () => {
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

  it('builds download status copy', () => {
    expect(buildLocalAiDownloadStartMessage(1066)).toContain('1066')
    expect(buildLocalAiDownloadProgressMessage(42)).toContain('42%')
  })
})
