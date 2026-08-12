import {getFilterObject} from '@/services/formatUtils'
import type {FilterObject} from '@/types/common'
import {monthBounds, nextIsoDay} from '@shared/calendarMonth'

export {nextIsoDay}

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

/** Media created on a specific calendar day. */
export function buildMediaCreatedDayFilters(day: string): FilterObject[] {
  const start = String(day || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return []
  return [
    getFilterObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '>=',
      val: start,
      note: 'home-created-day',
    }),
    getFilterObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '<',
      val: nextIsoDay(start),
      note: 'home-created-day',
    }),
  ]
}

/** Media created within a calendar month. */
export function buildMediaCreatedMonthFilters(year: number, month: number): FilterObject[] {
  const {start, end} = monthBounds(year, month)
  return [
    getFilterObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '>=',
      val: start,
      note: 'home-created-month',
    }),
    getFilterObject({
      param: 'mediaCreatedAt',
      type: 'date',
      cond: '<',
      val: end,
      note: 'home-created-month',
    }),
  ]
}
