import {describe, expect, it} from 'vitest'
import {
  compareMarksForSort,
  matchesMarkSearch,
  matchesMarkTypeFilter,
  normalizeMark,
  sortMarksList,
} from './markItemsFilter'

describe('markItemsFilter', () => {
  it('normalizes media alias onto medium', () => {
    expect(normalizeMark({
      id: 1,
      media: {name: 'A'},
    } as never)).toMatchObject({
      medium: {name: 'A'},
    })
  })

  it('filters by type and search', () => {
    expect(matchesMarkTypeFilter({type: 'favorite'} as never, ['favorite'])).toBe(true)
    expect(matchesMarkTypeFilter({
      type: 'meta',
      tag: {metaId: 3},
    } as never, [3])).toBe(true)
    expect(matchesMarkTypeFilter({type: 'bookmark'} as never, [])).toBe(false)

    expect(matchesMarkSearch({
      text: 'Hello',
      medium: {name: 'Clip'},
    } as never, 'clip')).toBe(true)
    expect(matchesMarkSearch({text: 'Hello'} as never, 'zzz')).toBe(false)
  })

  it('sorts by time and supports shuffle callback', () => {
    const items = [
      {id: 2, time: 10},
      {id: 1, time: 5},
    ] as never[]
    expect(sortMarksList(items, 'time', 'asc').map((m) => m.id)).toEqual([1, 2])
    expect(compareMarksForSort(items[0], items[1], 'time', 'desc')).toBeLessThan(0)
    expect(sortMarksList(items, 'shuffle', 'asc', (list) => [...list].reverse()).map((m) => m.id))
      .toEqual([1, 2])
  })
})
