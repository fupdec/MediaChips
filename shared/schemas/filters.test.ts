import { describe, expect, it } from 'vitest'
import {
  parseDynamicPlaylistSummaries,
  parseSavedFilterFindOrCreateHydrated,
  parseSavedFilterMediaResponse,
  parseSavedFilters,
  parseSavedFilterSummaryResponse,
} from '@shared/schemas'

describe('filter schemas', () => {
  it('parses saved filters', () => {
    const filters = parseSavedFilters([
      { id: 1, name: 'Favorites', filters: [], filtersJoin: 'or' },
    ])
    expect(filters[0]?.name).toBe('Favorites')
    expect(filters[0]?.filtersJoin).toBe('or')
  })

  it('parses saved filter find-or-create hydrated tuple', () => {
    const [savedFilter, created] = parseSavedFilterFindOrCreateHydrated([
      {
        id: 3,
        filters: [{
          id: 1,
          param: 'rating',
          type: 'rating',
          cond: '>',
          val: 5,
          active: true,
          lock: false,
          note: '',
        }],
      },
      false,
    ])
    expect(savedFilter.id).toBe(3)
    expect(savedFilter.filters).toHaveLength(1)
    expect(created).toBe(false)
  })

  it('parses dynamic playlist summaries', () => {
    const playlists = parseDynamicPlaylistSummaries([
      { id: 2, count: 5, previewIds: [10, 11] },
    ])
    expect(playlists[0]?.previewIds).toEqual([10, 11])
  })

  it('parses saved filter media and summary', () => {
    const media = parseSavedFilterMediaResponse({
      items: [{ id: 3, name: 'clip.mp4' }],
      count: 1,
    })
    expect(media.count).toBe(1)

    const summary = parseSavedFilterSummaryResponse({
      count: 2,
      previewIds: [3, 4],
    })
    expect(summary.previewIds).toEqual([3, 4])
  })

  it('rejects invalid playlist summary', () => {
    expect(() => parseDynamicPlaylistSummaries([{ id: 'bad' }])).toThrow()
  })
})
