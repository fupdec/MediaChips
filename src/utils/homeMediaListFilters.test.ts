/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  buildContinueWatchingFilters,
  buildFavoritesFilters,
  buildLibraryAddedDayFilters,
  buildLibraryAddedMonthFilters,
  buildInboxFilters,
  nextIsoDay,
} from '@/utils/homeMediaListFilters'

describe('homeMediaListFilters', () => {
  it('builds continue watching filter for resume time > 0', () => {
    const filters = buildContinueWatchingFilters()
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 'time',
      type: 'number',
      cond: '>',
      val: 0,
      active: true,
      lock: false,
      note: 'home-continue',
    })
  })

  it('builds favorites filter for favorite = yes', () => {
    const filters = buildFavoritesFilters()
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 'favorite',
      type: 'boolean',
      cond: '=',
      active: true,
      lock: false,
      note: 'home-favorites',
    })
  })

  it('builds library-added day range and next day', () => {
    expect(nextIsoDay('2026-08-31')).toBe('2026-09-01')
    const filters = buildLibraryAddedDayFilters('2026-08-12')
    expect(filters).toHaveLength(2)
    expect(filters[0]).toMatchObject({
      param: 'createdAt',
      type: 'date',
      cond: '>=',
      val: '2026-08-12',
      note: 'home-added-day',
    })
    expect(filters[1]).toMatchObject({
      param: 'createdAt',
      type: 'date',
      cond: '<',
      val: '2026-08-13',
      note: 'home-added-day',
    })
    expect(buildLibraryAddedDayFilters('bad')).toEqual([])
  })

  it('builds library-added month range', () => {
    const filters = buildLibraryAddedMonthFilters(2026, 12)
    expect(filters).toEqual([
      expect.objectContaining({
        param: 'createdAt',
        type: 'date',
        cond: '>=',
        val: '2026-12-01',
        note: 'home-added-month',
      }),
      expect.objectContaining({
        param: 'createdAt',
        type: 'date',
        cond: '<',
        val: '2027-01-01',
        note: 'home-added-month',
      }),
    ])
  })

  it('builds inbox filter for unrated media', () => {
    const filters = buildInboxFilters()
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 'rating',
      type: 'number',
      cond: '<=',
      val: 0,
      active: true,
      lock: false,
      note: 'home-inbox',
    })
  })
})
