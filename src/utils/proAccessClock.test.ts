import {describe, expect, it} from 'vitest'
import {hasProAccess, proTrialDaysLeft, trialClockNow} from './proAccess'

const DAY = 86400000
const NOW = Date.parse('2026-06-01T00:00:00Z')

describe('trial clock', () => {
  it('uses the real clock when nothing was seen later', () => {
    expect(trialClockNow('', NOW)).toBe(NOW)
    expect(trialClockNow(new Date(NOW - DAY).toISOString(), NOW)).toBe(NOW)
  })

  it('does not go back when the system clock was set back', () => {
    const seen = new Date(NOW).toISOString()
    expect(trialClockNow(seen, NOW - 20 * DAY)).toBe(NOW)
  })

  it('keeps an expired trial expired after a clock rollback', () => {
    const start = new Date(NOW - 31 * DAY).toISOString()
    const seen = new Date(NOW).toISOString()
    const rolledBack = NOW - 20 * DAY
    expect(hasProAccess({registered: false, trialStartedAt: start, now: rolledBack})).toBe(true)
    expect(hasProAccess({registered: false, trialStartedAt: start, trialLastSeenAt: seen, now: rolledBack})).toBe(false)
    expect(proTrialDaysLeft(start, trialClockNow(seen, rolledBack))).toBe(0)
  })
})
