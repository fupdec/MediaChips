import type { ApiDb } from '../types/db'
import type { ParsedChartStats, ParsedChartActivitySeries } from '@shared/schemas/home'
import { queryAll, queryGet } from '../db/utils/rawQuery'

export const CHART_PERIODS = [7, 30, 90, 365, 0] as const
export type ChartPeriod = typeof CHART_PERIODS[number]
export type ChartGranularity = 'day' | 'week' | 'month'

/** @deprecated use DEFAULT_CHART_PERIOD */
export const CHART_DAYS = 30
export const DEFAULT_CHART_PERIOD: ChartPeriod = 30
export const CHART_PERIOD_ALL: ChartPeriod = 0

type DayCountRow = {day: string; count: number}

type BucketAxis = {
  labels: string[]
  labelIndex: Map<string, number>
  granularity: ChartGranularity
}

function resolveChartPeriod(raw: unknown): ChartPeriod {
  if (raw === 'all' || raw === 'ALL') return CHART_PERIOD_ALL
  const value = Number(raw)
  return (CHART_PERIODS as readonly number[]).includes(value)
    ? value as ChartPeriod
    : DEFAULT_CHART_PERIOD
}

function granularityForSpanDays(spanDays: number): ChartGranularity {
  if (spanDays <= 30) return 'day'
  if (spanDays <= 90) return 'week'
  return 'month'
}

function granularityForPeriod(period: ChartPeriod, spanDays?: number): ChartGranularity {
  if (period === CHART_PERIOD_ALL) {
    return granularityForSpanDays(spanDays ?? 365)
  }
  if (period <= 30) return 'day'
  if (period === 90) return 'week'
  return 'month'
}

async function getHomeChartStats(
  db: ApiDb,
  periodInput: unknown = DEFAULT_CHART_PERIOD,
): Promise<ParsedChartStats> {
  const period = resolveChartPeriod(periodInput)

  const mediaTotal = Number(
    (queryGet(db, `SELECT COUNT(*) AS count FROM media`) as {count?: number} | undefined)?.count || 0,
  )
  const tagsTotal = Number(
    (queryGet(db, `SELECT COUNT(*) AS count FROM tags`) as {count?: number} | undefined)?.count || 0,
  )

  const emptySeries = (): ParsedChartActivitySeries => ({
    added: [],
    viewed: [],
    edited: [],
  })

  if (!mediaTotal && !tagsTotal) {
    return {
      days: [],
      period,
      granularity: period === CHART_PERIOD_ALL ? 'month' : granularityForPeriod(period),
      mediaTotal,
      tagsTotal,
      media: emptySeries(),
      tags: emptySeries(),
    }
  }

  const today = String(
    (queryGet(db, `SELECT date('now') AS day`) as {day?: string} | undefined)?.day || '',
  )
  const rangeStart = period === CHART_PERIOD_ALL
    ? getActivityStartDate(db) || today
    : shiftDate(today, -(period - 1))

  const spanDays = daysBetween(rangeStart, today)
  const granularity = granularityForPeriod(period, spanDays)
  const buckets = buildBucketAxis(rangeStart, today, granularity)
  const sinceExpr = `datetime('${rangeStart}')`

  const media: ParsedChartActivitySeries = {
    added: fillBucketSeries(buckets, countByDay(db, 'media', 'createdAt', sinceExpr)),
    viewed: fillBucketSeries(buckets, countByDay(db, 'media', 'viewedAt', sinceExpr, {
      requireNonEmpty: true,
    })),
    edited: fillBucketSeries(buckets, countEditedByDay(db, 'media', sinceExpr)),
  }

  const tags: ParsedChartActivitySeries = {
    added: fillBucketSeries(buckets, countByDay(db, 'tags', 'createdAt', sinceExpr)),
    viewed: fillBucketSeries(buckets, countByDay(db, 'tags', 'viewedAt', sinceExpr, {
      requireNonEmpty: true,
    })),
    edited: fillBucketSeries(buckets, countEditedByDay(db, 'tags', sinceExpr)),
  }

  return {
    days: buckets.labels,
    period,
    granularity,
    mediaTotal,
    tagsTotal,
    media,
    tags,
  }
}

function getActivityStartDate(db: ApiDb): string | null {
  const row = queryGet(db, `
    SELECT MIN(day) AS day FROM (
      SELECT date(MIN(createdAt)) AS day
      FROM media
      WHERE createdAt IS NOT NULL AND TRIM(createdAt) != ''
      UNION ALL
      SELECT date(MIN(createdAt)) AS day
      FROM tags
      WHERE createdAt IS NOT NULL AND TRIM(createdAt) != ''
    )
  `) as {day?: string | null} | undefined

  return row?.day ? String(row.day) : null
}

function shiftDate(isoDay: string, deltaDays: number): string {
  const date = new Date(`${isoDay}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + deltaDays)
  return date.toISOString().slice(0, 10)
}

function daysBetween(start: string, end: string): number {
  const a = Date.parse(`${start}T00:00:00.000Z`)
  const b = Date.parse(`${end}T00:00:00.000Z`)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 1
  return Math.round((b - a) / 86_400_000) + 1
}

function bucketKey(day: string, granularity: ChartGranularity): string {
  if (granularity === 'week') return weekStartUtc(day)
  if (granularity === 'month') return monthStart(day)
  return day
}

function buildBucketAxis(start: string, end: string, granularity: ChartGranularity): BucketAxis {
  const labels: string[] = []
  const labelIndex = new Map<string, number>()

  let cursor = bucketKey(start, granularity)
  const last = bucketKey(end, granularity)

  while (cursor <= last) {
    labelIndex.set(cursor, labels.length)
    labels.push(cursor)
    cursor = nextBucket(cursor, granularity)
  }

  return {labels, labelIndex, granularity}
}

function nextBucket(current: string, granularity: ChartGranularity): string {
  const date = new Date(`${current}T00:00:00.000Z`)
  if (granularity === 'day') {
    date.setUTCDate(date.getUTCDate() + 1)
  } else if (granularity === 'week') {
    date.setUTCDate(date.getUTCDate() + 7)
  } else {
    date.setUTCMonth(date.getUTCMonth() + 1)
  }
  return date.toISOString().slice(0, 10)
}

function weekStartUtc(isoDay: string): string {
  const date = new Date(`${isoDay}T00:00:00.000Z`)
  const weekday = date.getUTCDay()
  const diff = weekday === 0 ? -6 : 1 - weekday
  date.setUTCDate(date.getUTCDate() + diff)
  return date.toISOString().slice(0, 10)
}

function monthStart(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`
}

function countByDay(
  db: ApiDb,
  table: 'media' | 'tags',
  column: 'createdAt' | 'viewedAt' | 'updatedAt',
  sinceExpr: string,
  options: {requireNonEmpty?: boolean} = {},
): DayCountRow[] {
  const nonEmpty = options.requireNonEmpty
    ? `AND ${column} IS NOT NULL AND TRIM(${column}) != ''`
    : ''

  return queryAll<DayCountRow>(db, `
    SELECT date(${column}) AS day, COUNT(*) AS count
    FROM ${table}
    WHERE ${column} >= ${sinceExpr}
      ${nonEmpty}
    GROUP BY date(${column})
  `)
}

function countEditedByDay(
  db: ApiDb,
  table: 'media' | 'tags',
  sinceExpr: string,
): DayCountRow[] {
  return queryAll<DayCountRow>(db, `
    SELECT date(updatedAt) AS day, COUNT(*) AS count
    FROM ${table}
    WHERE updatedAt >= ${sinceExpr}
      AND datetime(updatedAt) > datetime(createdAt)
    GROUP BY date(updatedAt)
  `)
}

function fillBucketSeries(buckets: BucketAxis, rows: DayCountRow[]): number[] {
  const series = Array.from({length: buckets.labels.length}, () => 0)
  for (const row of rows) {
    const key = bucketKey(String(row.day), buckets.granularity)
    const index = buckets.labelIndex.get(key)
    if (index == null) continue
    series[index] += Number(row.count || 0)
  }
  return series
}

export { getHomeChartStats, resolveChartPeriod, granularityForPeriod }
