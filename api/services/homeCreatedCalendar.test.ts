import {describe, expect, it} from 'vitest'
import {monthBounds} from '../../shared/calendarMonth'
import {getCreatedCalendarMonth} from './homeCreatedCalendar'

describe('homeCreatedCalendar', () => {
  it('builds month bounds and wraps December', () => {
    expect(monthBounds(2026, 8)).toEqual({
      start: '2026-08-01',
      end: '2026-09-01',
    })
    expect(monthBounds(2026, 12)).toEqual({
      start: '2026-12-01',
      end: '2027-01-01',
    })
  })

  it('aggregates day counts and totals from mediaCreatedAt', () => {
    const rowsBySql: Record<string, unknown[]> = {
      day: [
        {day: '2026-08-01', count: 2},
        {day: '2026-08-15', count: 5},
        {day: 'bad', count: 9},
      ],
      totals: [{withDate: 12, missingDate: 3}],
    }

    const db = {
      sqlite: {
        prepare(sql: string) {
          const key = sql.includes('GROUP BY day') ? 'day' : 'totals'
          const rows = rowsBySql[key]
          return {
            all: () => rows,
          }
        },
      },
    }

    const result = getCreatedCalendarMonth(db as never, 2026, 8)
    expect(result).toEqual({
      year: 2026,
      month: 8,
      days: [
        {day: '2026-08-01', count: 2},
        {day: '2026-08-15', count: 5},
      ],
      totalInMonth: 7,
      totalWithDate: 12,
      totalMissingDate: 3,
    })
  })
})
