import {describe, expect, it} from 'vitest'
import {mergeNlPlaylistIds, uniquePositiveIds, goalRowsToFilterObjects} from './nlPlaylistMix'

describe('nlPlaylistMix merge', () => {
  it('dedupes positive ids', () => {
    expect(uniquePositiveIds([1, '2', 0, -1, 2, null, 1])).toEqual([1, 2])
  })

  it('uses filters only when CLIP empty', () => {
    expect(mergeNlPlaylistIds({filterIds: [3, 1, 2], clipIds: []})).toEqual({
      ids: [3, 1, 2],
      source: 'filters',
    })
  })

  it('uses semantic order when filters empty', () => {
    expect(mergeNlPlaylistIds({filterIds: [], clipIds: [9, 8, 7]})).toEqual({
      ids: [9, 8, 7],
      source: 'semantic',
    })
  })

  it('intersects keeping CLIP rank', () => {
    expect(mergeNlPlaylistIds({
      filterIds: [1, 2, 3, 4],
      clipIds: [4, 9, 2, 1],
    })).toEqual({
      ids: [4, 2, 1],
      source: 'hybrid',
    })
  })

  it('falls back to filters when intersection empty', () => {
    expect(mergeNlPlaylistIds({
      filterIds: [1, 2],
      clipIds: [9, 8],
    })).toEqual({
      ids: [1, 2],
      source: 'filters_fallback',
    })
  })

  it('returns empty when both sides empty', () => {
    expect(mergeNlPlaylistIds({filterIds: [], clipIds: []})).toEqual({
      ids: [],
      source: 'filters',
    })
  })

  it('maps goal rows to filter objects', () => {
    const rows = goalRowsToFilterObjects([
      {param: 'favorite', type: 'boolean', cond: '=', val: true, active: true},
      {param: 'views', type: 'number', cond: '=', val: 0},
    ])
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({param: 'favorite', type: 'boolean', cond: '=', val: true, active: true})
    expect(rows[1]).toMatchObject({param: 'views', cond: '=', val: 0})
  })
})
