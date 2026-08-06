/**
 * @vitest-environment node
 */
import {describe, expect, it} from 'vitest'
import {
  buildContinueWatchingFilters,
  buildFavoritesFilters,
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
})
