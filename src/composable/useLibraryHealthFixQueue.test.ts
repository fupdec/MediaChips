import {describe, expect, it} from 'vitest'
import {hasOnlyVisualStages, stagesFromHealth} from './useLibraryHealthFixQueue'
import {emptyHomeHealthUi} from '@/types/widgets'

describe('stagesFromHealth', () => {
  it('builds visuals then fingerprint/codec/clip when auto-fixable', () => {
    const health = emptyHomeHealthUi()
    health.generatedImages = {
      byType: {preview: {total: 2, pending: 2}},
      totalPending: 2,
    }
    health.fingerprint = {total: 5, pending: 2, hashed: 3}
    health.videoCodec = {total: 5, pending: 1, filled: 4}
    health.clip = {
      total: 3,
      pending: 3,
      hashed: 0,
      modelStatus: 'downloaded',
      model: 'clip',
    }
    health.queue = [
      {id: 'visuals', severity: 'info', count: 2, autoFixable: true},
      {id: 'fingerprint', severity: 'info', count: 2, autoFixable: true},
      {id: 'codec', severity: 'info', count: 1, autoFixable: true},
      {id: 'clip', severity: 'info', count: 3, autoFixable: true},
    ]

    const stages = stagesFromHealth(health)
    expect(stages).toEqual(['preview', 'fingerprint', 'codec', 'clip'])
    expect(hasOnlyVisualStages(stages)).toBe(false)
  })

  it('skips clip when model is not ready', () => {
    const health = emptyHomeHealthUi()
    health.clip = {
      total: 3,
      pending: 3,
      hashed: 0,
      modelStatus: 'not_downloaded',
      model: 'clip',
    }
    health.queue = [
      {id: 'clip', severity: 'info', count: 3, autoFixable: false},
    ]
    expect(stagesFromHealth(health)).toEqual([])
  })

  it('detects visuals-only stage lists', () => {
    expect(hasOnlyVisualStages(['preview', 'grid'])).toBe(true)
    expect(hasOnlyVisualStages(['preview', 'clip'])).toBe(false)
  })
})
