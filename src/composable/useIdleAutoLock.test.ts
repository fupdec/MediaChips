import {describe, expect, it} from 'vitest'
import {
  isIdlePastTimeout,
  parseAutoLockIdleMinutes,
  shouldAutoLockIdle,
} from './useIdleAutoLock'

describe('useIdleAutoLock helpers', () => {
  it('parses idle minutes presets and clamps unknowns', () => {
    expect(parseAutoLockIdleMinutes('0')).toBe(0)
    expect(parseAutoLockIdleMinutes('15')).toBe(15)
    expect(parseAutoLockIdleMinutes('7')).toBe(7)
    expect(parseAutoLockIdleMinutes('-3')).toBe(0)
    expect(parseAutoLockIdleMinutes('999')).toBe(240)
    expect(parseAutoLockIdleMinutes('abc')).toBe(0)
  })

  it('enables only with password protection, unlocked UI, and positive minutes', () => {
    expect(shouldAutoLockIdle({
      passwordProtection: '1',
      autoLockIdleMinutes: '10',
      isLocked: false,
    })).toBe(true)

    expect(shouldAutoLockIdle({
      passwordProtection: '0',
      autoLockIdleMinutes: '10',
      isLocked: false,
    })).toBe(false)

    expect(shouldAutoLockIdle({
      passwordProtection: '1',
      autoLockIdleMinutes: '0',
      isLocked: false,
    })).toBe(false)

    expect(shouldAutoLockIdle({
      passwordProtection: '1',
      autoLockIdleMinutes: '10',
      isLocked: true,
    })).toBe(false)
  })

  it('detects idle past the configured timeout', () => {
    const started = 1_000_000
    expect(isIdlePastTimeout(started, started + 4 * 60_000, 5)).toBe(false)
    expect(isIdlePastTimeout(started, started + 5 * 60_000, 5)).toBe(true)
    expect(isIdlePastTimeout(started, started + 60_000, 0)).toBe(false)
  })
})
