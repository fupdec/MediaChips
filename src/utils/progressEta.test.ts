import {describe, expect, it} from 'vitest'
import {estimateRemainingMs, formatClock} from './progressEta'

describe('estimateRemainingMs', () => {
  it('extrapolates the average pace', () => {
    expect(estimateRemainingMs({done: 10, total: 50, startedAt: 0}, 10_000)).toBe(40_000)
  })
  it('stays unknown while the sample is too small', () => {
    expect(estimateRemainingMs({done: 1, total: 50, startedAt: 0}, 10_000)).toBeNull()
    expect(estimateRemainingMs({done: 10, total: 50, startedAt: 0}, 500)).toBeNull()
    expect(estimateRemainingMs({done: 0, total: 50, startedAt: 0}, 10_000)).toBeNull()
  })
  it('is unknown without a total and zero when finished', () => {
    expect(estimateRemainingMs({done: 5, total: 0, startedAt: 0}, 10_000)).toBeNull()
    expect(estimateRemainingMs({done: 50, total: 50, startedAt: 0}, 10_000)).toBe(0)
  })
})

describe('formatClock', () => {
  it('formats minutes and hours', () => {
    expect(formatClock(5_000)).toBe('0:05')
    expect(formatClock(125_000)).toBe('2:05')
    expect(formatClock(3_725_000)).toBe('1:02:05')
  })
})
