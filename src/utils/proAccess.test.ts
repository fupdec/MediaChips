import {describe, expect, it} from 'vitest'
import {
  PRO_FEATURES,
  PRO_TRIAL_DAYS,
  decideProAccessMigration,
  hasProAccess,
  isProFeature,
  isProTrialActive,
  proTrialDaysLeft,
} from './proAccess'

const DAY = 24 * 60 * 60 * 1000
const start = '2026-01-01T00:00:00.000Z'
const t0 = Date.parse(start)

describe('proTrialDaysLeft', () => {
  it('counts down from the full trial and never goes below zero', () => {
    expect(proTrialDaysLeft(start, t0)).toBe(PRO_TRIAL_DAYS)
    expect(proTrialDaysLeft(start, t0 + 10 * DAY + 1000)).toBe(PRO_TRIAL_DAYS - 10)
    expect(proTrialDaysLeft(start, t0 + (PRO_TRIAL_DAYS - 1) * DAY)).toBe(1)
    expect(proTrialDaysLeft(start, t0 + PRO_TRIAL_DAYS * DAY)).toBe(0)
    expect(proTrialDaysLeft(start, t0 + 400 * DAY)).toBe(0)
  })

  it('returns null without a valid start and ignores a start in the future', () => {
    expect(proTrialDaysLeft('', t0)).toBeNull()
    expect(proTrialDaysLeft(undefined, t0)).toBeNull()
    expect(proTrialDaysLeft('garbage', t0)).toBeNull()
    expect(proTrialDaysLeft(start, t0 - 5 * DAY)).toBe(PRO_TRIAL_DAYS)
  })

  it('reports whether the trial is active', () => {
    expect(isProTrialActive(start, t0 + DAY)).toBe(true)
    expect(isProTrialActive(start, t0 + PRO_TRIAL_DAYS * DAY)).toBe(false)
    expect(isProTrialActive('', t0)).toBe(false)
  })
})

describe('hasProAccess', () => {
  it('unlocks for a key, a grandfathered install or an active trial only', () => {
    expect(hasProAccess({registered: true})).toBe(true)
    expect(hasProAccess({registered: false, grandfathered: true})).toBe(true)
    expect(hasProAccess({registered: false, trialStartedAt: start, now: t0 + DAY})).toBe(true)
    expect(hasProAccess({registered: false, trialStartedAt: start, now: t0 + 31 * DAY})).toBe(false)
    expect(hasProAccess({registered: false})).toBe(false)
  })
})

describe('decideProAccessMigration', () => {
  it('does nothing once settled (a backup restore must not re-run it)', () => {
    expect(decideProAccessMigration({settled: true, capWasSettled: false, libraryCount: 0})).toEqual({run: false})
  })

  it('grandfathers an install that already ran the cap migration or holds media', () => {
    expect(decideProAccessMigration({settled: false, capWasSettled: true, libraryCount: 0, now: t0}))
      .toEqual({run: true, grandfathered: true, trialStartedAt: ''})
    expect(decideProAccessMigration({settled: false, capWasSettled: false, libraryCount: 12, now: t0}))
      .toEqual({run: true, grandfathered: true, trialStartedAt: ''})
  })

  it('starts the trial for a fresh empty install', () => {
    expect(decideProAccessMigration({settled: false, capWasSettled: false, libraryCount: 0, now: t0}))
      .toEqual({run: true, grandfathered: false, trialStartedAt: start})
  })
})

describe('isProFeature', () => {
  it('accepts only known feature ids', () => {
    for (const feature of PRO_FEATURES) expect(isProFeature(feature)).toBe(true)
    expect(isProFeature('nope')).toBe(false)
    expect(isProFeature(null)).toBe(false)
  })
})
