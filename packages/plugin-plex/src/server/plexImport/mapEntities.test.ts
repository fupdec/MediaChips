import {describe, expect, it} from 'vitest'
import {mapPlexRating, msToSeconds, plexOldId} from './mapEntities'

describe('plexImport mapEntities', () => {
  it('builds stable Plex oldIds', () => {
    expect(plexOldId('item', 12)).toBe('plex:item:12')
  })

  it('maps ratings and millisecond timestamps', () => {
    expect(mapPlexRating(10)).toBe(5)
    expect(mapPlexRating(7.5)).toBe(3.8)
    expect(mapPlexRating(null)).toBeNull()
    expect(msToSeconds(12_600)).toBe(13)
    expect(msToSeconds(null)).toBeNull()
  })
})
