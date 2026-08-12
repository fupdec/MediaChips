/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  buildContinueWatchingFilters,
  buildFavoritesFilters,
  buildMediaCreatedDayFilters,
  buildMediaCreatedMonthFilters,
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

  it('builds media-created day range and next day', () => {
    expect(nextIsoDay('2026-08-31')).toBe('2026-09-01')
    const filters = buildMediaCreatedDayFilters('2026-08-12')
    expect(filters).toHaveLength(2)
    expect(filters[0]).toMatchObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '>=',
      val: '2026-08-12',
      note: 'home-created-day',
    })
    expect(filters[1]).toMatchObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '<',
      val: '2026-08-13',
      note: 'home-created-day',
    })
    expect(buildMediaCreatedDayFilters('bad')).toEqual([])
  })

  it('builds media-created month range', () => {
    const filters = buildMediaCreatedMonthFilters(2026, 12)
    expect(filters).toEqual([
      expect.objectContaining({
        param: 'mediaCreatedAt',
        type: 'date',
        cond: '>=',
        val: '2026-12-01',
        note: 'home-created-month',
      }),
      expect.objectContaining({
        param: 'mediaCreatedAt',
        type: 'date',
        cond: '<',
        val: '2027-01-01',
        note: 'home-created-month',
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
