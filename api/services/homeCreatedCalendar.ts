import type {ApiDb} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {clampCalendarMonth, monthBounds} from '../../shared/calendarMonth'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../shared/mediaTrash'

export type CreatedCalendarDayCount = {
  day: string
  count: number
}

export type CreatedCalendarMonthResult = {
  year: number
  month: number
  days: CreatedCalendarDayCount[]
  totalInMonth: number
  totalWithDate: number
  totalMissingDate: number
  /** Latest local YYYY-MM that has library-added media, or null. */
  latestMonthKey: string | null
}

export {monthBounds, clampCalendarMonth}

const HAS_ADDED_DATE_SQL = `
  media.createdAt IS NOT NULL
  AND TRIM(media.createdAt) != ''
  AND julianday(media.createdAt) IS NOT NULL
`

/** Local calendar day key — matches dateDay group-by (strftime … localtime). */
const LOCAL_DAY_SQL = `strftime('%Y-%m-%d', media.createdAt, 'localtime')`
const LOCAL_MONTH_SQL = `strftime('%Y-%m', media.createdAt, 'localtime')`

/**
 * Day density for library add dates (`createdAt`) in a month.
 * Uses local timezone days to stay coherent with list group-by `dateDay`.
 */
export function getCreatedCalendarMonth(
  db: ApiDb,
  year: number,
  month: number,
): CreatedCalendarMonthResult {
  const {year: y, month: m} = clampCalendarMonth(year, month)
  const {start, end} = monthBounds(y, m)

  const dayRows = queryAll(db, `
    SELECT ${LOCAL_DAY_SQL} AS day, COUNT(*) AS count
    FROM media
    WHERE ${MEDIA_NOT_IN_TRASH_SQL}
      AND ${HAS_ADDED_DATE_SQL}
      AND ${LOCAL_DAY_SQL} >= :start
      AND ${LOCAL_DAY_SQL} < :end
    GROUP BY day
    ORDER BY day ASC
  `, {start, end}) as Array<{day?: string; count?: number}>

  const days: CreatedCalendarDayCount[] = dayRows
    .map((row) => ({
      day: String(row.day || ''),
      count: Number(row.count) || 0,
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && row.count > 0)

  const totals = queryGet<{withDate?: number; missingDate?: number}>(db, `
    SELECT
      SUM(CASE WHEN ${HAS_ADDED_DATE_SQL} THEN 1 ELSE 0 END) AS withDate,
      SUM(CASE WHEN NOT (${HAS_ADDED_DATE_SQL}) THEN 1 ELSE 0 END) AS missingDate
    FROM media
    WHERE ${MEDIA_NOT_IN_TRASH_SQL}
  `)

  const latest = queryGet<{ym?: string}>(db, `
    SELECT ${LOCAL_MONTH_SQL} AS ym
    FROM media
    WHERE ${MEDIA_NOT_IN_TRASH_SQL}
      AND ${HAS_ADDED_DATE_SQL}
    ORDER BY ${LOCAL_MONTH_SQL} DESC
    LIMIT 1
  `)

  const latestMonthKey = /^\d{4}-\d{2}$/.test(String(latest?.ym || ''))
    ? String(latest?.ym)
    : null

  const totalInMonth = days.reduce((sum, row) => sum + row.count, 0)

  return {
    year: y,
    month: m,
    days,
    totalInMonth,
    totalWithDate: Number(totals?.withDate) || 0,
    totalMissingDate: Number(totals?.missingDate) || 0,
    latestMonthKey,
  }
}
