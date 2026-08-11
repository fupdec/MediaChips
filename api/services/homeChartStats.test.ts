import {beforeEach, describe, expect, it, vi} from 'vitest'
import type {ApiDb} from '../types/db'

const {queryAll, queryGet} = vi.hoisted(() => ({
  queryAll: vi.fn(),
  queryGet: vi.fn(),
}))

vi.mock('../db/utils/rawQuery', () => ({
  queryAll,
  queryGet,
}))

import {getHomeChartStats, resolveChartPeriod} from './homeChartStats'

describe('getHomeChartStats', () => {
  const db = {} as ApiDb

  beforeEach(() => {
    vi.clearAllMocks()
    queryGet.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes(`SELECT date('now')`)) return {day: '2026-08-30'}
      if (sql.includes('COUNT(*) AS count FROM media')) return {count: 0}
      if (sql.includes('COUNT(*) AS count FROM tags')) return {count: 0}
      if (sql.includes('MIN(day)')) return {day: '2026-01-01'}
      return {count: 0}
    })
    queryAll.mockReturnValue([])
  })

  it('resolves supported periods including all-time', () => {
    expect(resolveChartPeriod(7)).toBe(7)
    expect(resolveChartPeriod('90')).toBe(90)
    expect(resolveChartPeriod(0)).toBe(0)
    expect(resolveChartPeriod('all')).toBe(0)
    expect(resolveChartPeriod(12)).toBe(30)
  })

  it('returns empty series for an empty library', async () => {
    const stats = await getHomeChartStats(db, 30)

    expect(stats.period).toBe(30)
    expect(stats.granularity).toBe('day')
    expect(stats.days).toEqual([])
    expect(stats.media.added).toEqual([])
  })

  it('maps media and tags counts onto the day axis for 30 days', async () => {
    queryGet.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes(`SELECT date('now')`)) return {day: '2026-08-30'}
      if (sql.includes('COUNT(*) AS count FROM media')) return {count: 4}
      if (sql.includes('COUNT(*) AS count FROM tags')) return {count: 2}
      return {count: 0}
    })

    queryAll.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes('FROM media') && sql.includes('createdAt') && !sql.includes('updatedAt')) {
        return [{day: '2026-08-01', count: 2}, {day: '2026-08-03', count: 1}]
      }
      if (sql.includes('FROM media') && sql.includes('viewedAt')) {
        return [{day: '2026-08-02', count: 3}]
      }
      if (sql.includes('FROM media') && sql.includes('updatedAt')) {
        return [{day: '2026-08-03', count: 4}]
      }
      if (sql.includes('FROM tags') && sql.includes('createdAt') && !sql.includes('updatedAt')) {
        return [{day: '2026-08-01', count: 5}]
      }
      if (sql.includes('FROM tags') && sql.includes('viewedAt')) {
        return [{day: '2026-08-01', count: 1}]
      }
      if (sql.includes('FROM tags') && sql.includes('updatedAt')) {
        return [{day: '2026-08-02', count: 2}]
      }
      return []
    })

    const stats = await getHomeChartStats(db, 30)

    expect(stats.days).toHaveLength(30)
    expect(stats.days[0]).toBe('2026-08-01')
    expect(stats.days[29]).toBe('2026-08-30')
    expect(stats.media.added[0]).toBe(2)
    expect(stats.media.added[2]).toBe(1)
    expect(stats.media.viewed[1]).toBe(3)
    expect(stats.media.edited[2]).toBe(4)
    expect(stats.tags.added[0]).toBe(5)
    expect(stats.tags.viewed[0]).toBe(1)
    expect(stats.tags.edited[1]).toBe(2)
  })

  it('aggregates 90-day range into weekly buckets', async () => {
    queryGet.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes(`SELECT date('now')`)) return {day: '2026-03-31'}
      if (sql.includes('COUNT(*) AS count FROM media')) return {count: 1}
      if (sql.includes('COUNT(*) AS count FROM tags')) return {count: 0}
      return {count: 0}
    })

    queryAll.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes('FROM media') && sql.includes('createdAt') && !sql.includes('updatedAt')) {
        return [
          {day: '2026-01-01', count: 1},
          {day: '2026-01-02', count: 2},
          {day: '2026-01-08', count: 4},
        ]
      }
      return []
    })

    const stats = await getHomeChartStats(db, 90)

    expect(stats.period).toBe(90)
    expect(stats.granularity).toBe('week')
    expect(stats.days.length).toBeGreaterThan(10)
    expect(stats.days.length).toBeLessThan(90)
    expect(stats.media.added[0]).toBe(3)
    expect(stats.media.added[1]).toBe(4)
  })

  it('uses all-time range from earliest createdAt', async () => {
    queryGet.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes(`SELECT date('now')`)) return {day: '2026-08-30'}
      if (sql.includes('COUNT(*) AS count FROM media')) return {count: 2}
      if (sql.includes('COUNT(*) AS count FROM tags')) return {count: 0}
      if (sql.includes('MIN(day)')) return {day: '2025-01-15'}
      return {count: 0}
    })

    queryAll.mockImplementation((...args: unknown[]) => {
      const sql = String(args[1] || '')
      if (sql.includes('FROM media') && sql.includes('createdAt') && !sql.includes('updatedAt')) {
        return [
          {day: '2025-01-20', count: 1},
          {day: '2025-02-10', count: 2},
        ]
      }
      return []
    })

    const stats = await getHomeChartStats(db, 'all')

    expect(stats.period).toBe(0)
    expect(stats.granularity).toBe('month')
    expect(stats.days[0]).toBe('2025-01-01')
    expect(stats.days[stats.days.length - 1]).toBe('2026-08-01')
    expect(stats.media.added[0]).toBe(1)
    expect(stats.media.added[1]).toBe(2)
  })
})
