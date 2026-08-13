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

/** Media added to the library on a specific calendar day. */
export function buildLibraryAddedDayFilters(day: string): FilterObject[] {
  const start = String(day || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) return []
  return [
    getFilterObject({
      param: 'createdAt',
      type: 'date',
      cond: '>=',
      val: start,
      note: 'home-added-day',
    }),
    getFilterObject({
      param: 'createdAt',
      type: 'date',
      cond: '<',
      val: nextIsoDay(start),
      note: 'home-added-day',
    }),
  ]
}

/** Media added to the library within a calendar month. */
export function buildLibraryAddedMonthFilters(year: number, month: number): FilterObject[] {
  const {start, end} = monthBounds(year, month)
  return [
    getFilterObject({
      param: 'createdAt',
      type: 'date',
      cond: '>=',
      val: start,
      note: 'home-added-month',
    }),
    getFilterObject({
      param: 'createdAt',
      type: 'date',
      cond: '<',
      val: end,
      note: 'home-added-month',
    }),
  ]
}

/** @deprecated Use buildLibraryAddedDayFilters */
export const buildMediaCreatedDayFilters = buildLibraryAddedDayFilters
/** @deprecated Use buildLibraryAddedMonthFilters */
export const buildMediaCreatedMonthFilters = buildLibraryAddedMonthFilters

/**
 * Inbox triage list: unrated media.
 * Untagged is applied server-side for the home strip; View all scopes by inbox ids.
 */
export function buildInboxFilters(): FilterObject[] {
  return [
    getFilterObject({
      param: 'rating',
      type: 'number',
      cond: '<=',
      val: 0,
      note: 'home-inbox',
    }),
  ]
}
