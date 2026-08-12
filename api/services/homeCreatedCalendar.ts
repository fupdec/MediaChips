import type { ApiDb } from '../types/db'
import { queryAll } from '../db/utils/rawQuery'
import {clampCalendarMonth, monthBounds} from '../../shared/calendarMonth'

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
}

export {monthBounds, clampCalendarMonth}

/**
 * Day density for Media Created dates in a month.
 * Uses leading YYYY-MM-DD of mediaCreatedAt (ISO / SQLite datetime).
 */
export function getCreatedCalendarMonth(
  db: ApiDb,
  year: number,
  month: number,
): CreatedCalendarMonthResult {
  const {year: y, month: m} = clampCalendarMonth(year, month)
  const {start, end} = monthBounds(y, m)

  const dayRows = queryAll(db, `
    SELECT substr(mediaCreatedAt, 1, 10) AS day, COUNT(*) AS count
    FROM media
    WHERE mediaCreatedAt IS NOT NULL
      AND mediaCreatedAt != ''
      AND mediaCreatedAt >= :start
      AND mediaCreatedAt < :end
    GROUP BY day
    ORDER BY day ASC
  `, {start, end}) as Array<{day?: string; count?: number}>

  const days: CreatedCalendarDayCount[] = dayRows
    .map((row) => ({
      day: String(row.day || ''),
      count: Number(row.count) || 0,
    }))
    .filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && row.count > 0)

  const totals = queryAll(db, `
    SELECT
      SUM(CASE WHEN mediaCreatedAt IS NOT NULL AND mediaCreatedAt != '' THEN 1 ELSE 0 END) AS withDate,
      SUM(CASE WHEN mediaCreatedAt IS NULL OR mediaCreatedAt = '' THEN 1 ELSE 0 END) AS missingDate
    FROM media
  `)[0] as {withDate?: number; missingDate?: number} | undefined

  const totalInMonth = days.reduce((sum, row) => sum + row.count, 0)

  return {
    year: y,
    month: m,
    days,
    totalInMonth,
    totalWithDate: Number(totals?.withDate) || 0,
    totalMissingDate: Number(totals?.missingDate) || 0,
  }
}
