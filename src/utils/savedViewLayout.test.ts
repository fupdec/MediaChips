import {describe, expect, it} from 'vitest'
import {
  captureSavedViewLayout,
  describeSavedViewLayout,
  hasSavedViewLayout,
  parseSavedViewGroupBy,
  pickSavedViewLayout,
} from './savedViewLayout'

describe('savedViewLayout', () => {
  it('captures layout from items state', () => {
    const layout = captureSavedViewLayout({
      sortBy: 'rating',
      sortDir: 'desc',
      size: 4,
      view: 1,
      groupBy: 'pinnedMeta',
      groupByMetaId: 9,
      filtersJoin: 'or',
    })
    expect(layout).toEqual({
      sortBy: 'rating',
      sortDir: 'desc',
      size: 4,
      view: 1,
      groupBy: 'pinnedMeta:9',
      filtersJoin: 'or',
    })
    expect(hasSavedViewLayout(layout)).toBe(true)
  })

  it('picks layout fields from a saved filter row', () => {
    expect(pickSavedViewLayout({
      id: 1,
      name: 'Favorites',
      sortBy: 'name',
      sortDir: 'asc',
      size: 2,
      view: 2,
      groupBy: 'favorite',
      filtersJoin: 'or',
      filters: [],
    })).toEqual({
      sortBy: 'name',
      sortDir: 'asc',
      size: 2,
      view: 2,
      groupBy: 'favorite',
      filtersJoin: 'or',
    })
  })

  it('parses group-by and describes layout', () => {
    expect(parseSavedViewGroupBy({groupBy: 'pinnedMeta:3'})).toEqual({
      groupBy: 'pinnedMeta',
      groupByMetaId: 3,
      firstChar: 'pinnedMeta:3',
    })
    expect(describeSavedViewLayout(
      {size: 3, sortBy: 'rating', sortDir: 'desc', groupBy: 'rating', filtersJoin: 'or'},
      {
        size: (size) => `S${size}`,
        sort: (sortBy, dir) => `${sortBy}/${dir}`,
        group: (groupBy) => `g:${groupBy}`,
        join: (mode) => mode.toUpperCase(),
      },
    )).toEqual(['S3', 'rating/desc', 'g:rating', 'OR'])
    expect(hasSavedViewLayout({})).toBe(false)
    expect(hasSavedViewLayout({filtersJoin: 'or'})).toBe(true)
    expect(hasSavedViewLayout({filtersJoin: 'and'})).toBe(true)
  })
})
