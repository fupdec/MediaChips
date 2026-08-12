import {describe, expect, it} from 'vitest'
import {
  estimateLiveEtaSeconds,
  estimateStageEtaSeconds,
  estimateTaskEtaSeconds,
  formatLibrarySetupEta,
} from './librarySetupEta'
import {emptyHomeHealthUi} from '@/types/widgets'

describe('librarySetupEta', () => {
  it('estimates stage ETA from pending × rate', () => {
    const health = emptyHomeHealthUi()
    health.fingerprint = {total: 100, pending: 100, hashed: 0}
    expect(estimateStageEtaSeconds('fingerprint', health)).toBeGreaterThan(0)
    expect(estimateStageEtaSeconds('fingerprint', health, 0)).toBe(0)
  })

  it('sums visual task ETA from preview/grid/marks/thumbs', () => {
    const health = emptyHomeHealthUi()
    health.generatedImages = {
      byType: {
        preview: {total: 10, pending: 10},
        grid: {total: 10, pending: 10},
        marks: {total: 10, pending: 0},
      },
      totalPending: 20,
    }
    health.imageThumbs = {total: 5, generated: 0, pending: 5}
    expect(estimateTaskEtaSeconds('visuals', health)).toBeGreaterThan(
      estimateStageEtaSeconds('preview', health),
    )
  })

  it('computes live ETA from throughput', () => {
    expect(estimateLiveEtaSeconds({processed: 10, total: 100, elapsedSeconds: 20})).toBe(180)
    expect(estimateLiveEtaSeconds({processed: 0, total: 100, elapsedSeconds: 5})).toBe(0)
  })

  it('formats duration labels', () => {
    expect(formatLibrarySetupEta(65)).toBe('01:05')
    expect(formatLibrarySetupEta(0)).toBe('')
  })
})
