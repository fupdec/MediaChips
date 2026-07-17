import {describe, expect, it} from 'vitest'
import {
  formatSynonyms,
  joinStashFilePath,
  mapStashRatingToMediaChips,
  markerTimeSeconds,
  stashOldId,
} from './mapEntities'

describe('stashImport mapEntities', () => {
  it('maps stash 1-100 ratings to 0-5', () => {
    expect(mapStashRatingToMediaChips(null)).toBe(0)
    expect(mapStashRatingToMediaChips(0)).toBe(0)
    expect(mapStashRatingToMediaChips(20)).toBe(1)
    expect(mapStashRatingToMediaChips(50)).toBe(3)
    expect(mapStashRatingToMediaChips(100)).toBe(5)
  })

  it('keeps legacy 1-5 stash ratings as-is', () => {
    expect(mapStashRatingToMediaChips(1)).toBe(1)
    expect(mapStashRatingToMediaChips(5)).toBe(5)
  })

  it('builds stable stash oldIds', () => {
    expect(stashOldId('performer', 12)).toBe('stash:performer:12')
    expect(stashOldId('scene', 3)).toBe('stash:scene:3')
  })

  it('joins stash folder + basename with the source separator', () => {
    expect(joinStashFilePath('/media/videos', 'clip.mp4')).toBe('/media/videos/clip.mp4')
    expect(joinStashFilePath('C:\\Videos', 'clip.mp4')).toBe('C:\\Videos\\clip.mp4')
    expect(joinStashFilePath('/media/videos/', 'clip.mp4')).toBe('/media/videos/clip.mp4')
    expect(joinStashFilePath(null, 'clip.mp4')).toBe('clip.mp4')
    expect(joinStashFilePath('/media', null)).toBeNull()
  })

  it('formats aliases as comma-separated synonyms', () => {
    expect(formatSynonyms([' Angie ', '', 'Annie'])).toBe('Angie, Annie')
    expect(formatSynonyms([])).toBeNull()
  })

  it('rounds marker seconds', () => {
    expect(markerTimeSeconds(10.4)).toBe(10)
    expect(markerTimeSeconds(10.6)).toBe(11)
    expect(markerTimeSeconds(null)).toBe(0)
  })
})
