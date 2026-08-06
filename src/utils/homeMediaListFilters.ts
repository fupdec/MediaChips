import {getFilterObject} from '@/services/formatUtils'
import type {FilterObject} from '@/types/common'

/** Continue watching: resume position advanced past the start. */
export function buildContinueWatchingFilters(): FilterObject[] {
  return [
    getFilterObject({
      param: 'time',
      type: 'number',
      cond: '>',
      val: 0,
      note: 'home-continue',
    }),
  ]
}

/** Favorites list from the home widget. */
export function buildFavoritesFilters(): FilterObject[] {
  return [
    getFilterObject({
      param: 'favorite',
      type: 'boolean',
      cond: '=',
      val: null,
      note: 'home-favorites',
    }),
  ]
}
