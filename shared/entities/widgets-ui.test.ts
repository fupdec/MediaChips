import { describe, expect, it } from 'vitest'
import {
  emptyExtendedStatsUi,
  emptyHomeHealthUi,
  toExtendedStatsUi,
  toHomeHealthUi,
} from '@shared/entities/widgets-ui'

describe('widget ui normalizers', () => {
  it('normalizes partial extended stats', () => {
    const ui = toExtendedStatsUi({ total: 12, averageRating: 4.2 })
    expect(ui.total).toBe(12)
    expect(ui.averageRating).toBe(4.2)
    expect(ui.byType).toEqual([])
  })

  it('normalizes partial home health', () => {
    const ui = toHomeHealthUi({
      duplicates: { byFilesize: 1, byContentHash: 2, byOshash: 3 },
      videoCodec: { total: 5, pending: 1, filled: 4 },
    })
    expect(ui.duplicates.byContentHash).toBe(2)
    expect(ui.duplicates.byFingerprint).toBe(3)
    expect(ui.videoCodec.pending).toBe(1)
    expect(ui.contentHash.total).toBe(0)
    expect(ui.oshash.total).toBe(0)
    expect(ui.fingerprint.pending).toBe(0)
  })

  it('provides empty defaults', () => {
    expect(emptyExtendedStatsUi().total).toBe(0)
    expect(emptyHomeHealthUi().database.id).toBeNull()
  })
})
