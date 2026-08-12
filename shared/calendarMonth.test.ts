import {describe, expect, it} from 'vitest'
import {
  clampCalendarMonth,
  monthBounds,
  nextIsoDay,
  shiftCalendarMonth,
} from './calendarMonth'

describe('calendarMonth', () => {
  it('clamps and shifts months', () => {
    expect(clampCalendarMonth(2026, 0)).toEqual({year: 2025, month: 12})
    expect(clampCalendarMonth(2026, 13)).toEqual({year: 2027, month: 1})
    expect(shiftCalendarMonth(2026, 12, 1)).toEqual({year: 2027, month: 1})
    expect(shiftCalendarMonth(2026, 1, -1)).toEqual({year: 2025, month: 12})
  })

  it('builds bounds and next day', () => {
    expect(monthBounds(2026, 8)).toEqual({start: '2026-08-01', end: '2026-09-01'})
    expect(nextIsoDay('2026-02-28')).toBe('2026-03-01')
  })
})
