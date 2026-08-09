import {describe, expect, it} from 'vitest'
import {clampMarkSeconds, joinHmsToSeconds, splitSecondsToHms} from './markTimeHms'

describe('splitSecondsToHms', () => {
  it('splits total seconds', () => {
    expect(splitSecondsToHms(5)).toEqual({hours: 0, minutes: 0, seconds: 5})
    expect(splitSecondsToHms(65)).toEqual({hours: 0, minutes: 1, seconds: 5})
    expect(splitSecondsToHms(3723)).toEqual({hours: 1, minutes: 2, seconds: 3})
  })
})

describe('joinHmsToSeconds', () => {
  it('joins and clamps parts', () => {
    expect(joinHmsToSeconds(0, 1, 5)).toBe(65)
    expect(joinHmsToSeconds(1, 70, 90)).toBe(1 * 3600 + 59 * 60 + 59)
    expect(joinHmsToSeconds(0, 2, 0, {maxSeconds: 90})).toBe(90)
  })
})

describe('clampMarkSeconds', () => {
  it('clamps to range', () => {
    expect(clampMarkSeconds(-3, 0, 10)).toBe(0)
    expect(clampMarkSeconds(15, 0, 10)).toBe(10)
  })
})
