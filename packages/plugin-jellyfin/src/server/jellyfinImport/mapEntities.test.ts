import {describe, expect, it} from 'vitest'
import {
  jellyfinOldId,
  mapJellyfinRatingToMediaChips,
  markerTimeSeconds,
  normalizeJellyfinBaseUrl,
  ticksToSeconds,
} from './mapEntities'

describe('jellyfin mapEntities', () => {
  it('normalizes base URL trailing slashes', () => {
    expect(normalizeJellyfinBaseUrl('http://localhost:8096/')).toBe('http://localhost:8096')
  })

  it('builds oldIds with provider prefix', () => {
    expect(jellyfinOldId('jellyfin', 'item', 'abc')).toBe('jellyfin:item:abc')
    expect(jellyfinOldId('emby', 'person', 12)).toBe('emby:person:12')
  })

  it('maps community ratings to 0–5', () => {
    expect(mapJellyfinRatingToMediaChips(null)).toBeNull()
    expect(mapJellyfinRatingToMediaChips(10)).toBe(5)
    expect(mapJellyfinRatingToMediaChips(8)).toBe(4)
    expect(mapJellyfinRatingToMediaChips(4)).toBe(4)
  })

  it('converts ticks and marker times', () => {
    expect(ticksToSeconds(120_000_000)).toBe(12)
    expect(markerTimeSeconds(12.6)).toBe(13)
  })
})
