import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {LAST_SEEN_STEP_MS, mergeProEntitlement, proEntitlementPath, readProEntitlement, syncProEntitlement} from './proEntitlement'

const NOW = Date.parse('2026-06-01T00:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()

describe('mergeProEntitlement', () => {
  it('keeps settled decisions stored, whatever the client sends', () => {
    const stored = {proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialStartedAt: iso(NOW - 40 * 86400000)}
    const merged = mergeProEntitlement(stored, {proAccessSettled: '1', proFeaturesGrandfathered: '1', proTrialStartedAt: iso(NOW)}, NOW)
    expect(merged.proFeaturesGrandfathered).toBe('0')
    expect(merged.proTrialStartedAt).toBe(stored.proTrialStartedAt)
  })

  it('accepts the first settle from a client', () => {
    const merged = mergeProEntitlement(null, {proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialStartedAt: iso(NOW)}, NOW)
    expect(merged).toMatchObject({proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialStartedAt: iso(NOW)})
  })

  it('never moves the last-seen clock backwards', () => {
    const stored = {proAccessSettled: '1', proTrialStartedAt: iso(NOW - 86400000), proTrialLastSeenAt: iso(NOW)}
    const merged = mergeProEntitlement(stored, {}, NOW - 10 * 86400000)
    expect(merged.proTrialLastSeenAt).toBe(iso(NOW))
  })

  it('advances the last-seen clock only after a full step', () => {
    const stored = {proAccessSettled: '1', proTrialStartedAt: iso(NOW - 86400000), proTrialLastSeenAt: iso(NOW)}
    expect(mergeProEntitlement(stored, {}, NOW + LAST_SEEN_STEP_MS - 1).proTrialLastSeenAt).toBe(iso(NOW))
    expect(mergeProEntitlement(stored, {}, NOW + LAST_SEEN_STEP_MS).proTrialLastSeenAt).toBe(iso(NOW + LAST_SEEN_STEP_MS))
  })

  it('does not track a clock without a trial', () => {
    const merged = mergeProEntitlement({proAccessSettled: '1', proFeaturesGrandfathered: '1', proTrialStartedAt: ''}, {}, NOW)
    expect(merged.proTrialLastSeenAt).toBeUndefined()
  })

  it('only ever turns the trial-ended notice on', () => {
    const stored = {proAccessSettled: '1', proTrialStartedAt: iso(NOW), proTrialEndNoticeShown: '1'}
    expect(mergeProEntitlement(stored, {proTrialEndNoticeShown: '0'}, NOW).proTrialEndNoticeShown).toBe('1')
  })
})

describe('syncProEntitlement', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pro-entitlement-'))
    file = proEntitlementPath(path.join(dir, 'config.json'))
  })
  afterEach(() => fs.rmSync(dir, {recursive: true, force: true}))

  it('writes nothing for a fresh install that has not settled', () => {
    syncProEntitlement({}, file, NOW)
    expect(fs.existsSync(file)).toBe(false)
  })

  it('restores state into a config that lost it', () => {
    const settled = {proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialStartedAt: iso(NOW - 40 * 86400000)}
    syncProEntitlement({...settled}, file, NOW)
    const wiped: Record<string, unknown> = {databases: []}
    syncProEntitlement(wiped, file, NOW)
    expect(wiped).toMatchObject(settled)
  })

  it('does not let a wiped config turn into a grandfathered install', () => {
    syncProEntitlement({proAccessSettled: '1', proFeaturesGrandfathered: '0', proTrialStartedAt: iso(NOW)}, file, NOW)
    const config: Record<string, unknown> = {proAccessSettled: '0', proFeaturesGrandfathered: '1'}
    syncProEntitlement(config, file, NOW)
    expect(config.proAccessSettled).toBe('1')
    expect(config.proFeaturesGrandfathered).toBe('0')
  })

  it('migrates an already settled config into the file', () => {
    syncProEntitlement({proAccessSettled: '1', proFeaturesGrandfathered: '1', proTrialStartedAt: ''}, file, NOW)
    expect(readProEntitlement(file)).toMatchObject({proAccessSettled: '1', proFeaturesGrandfathered: '1'})
  })

  it('survives an unreadable file without throwing', () => {
    fs.writeFileSync(file, '{broken')
    const config: Record<string, unknown> = {proAccessSettled: '1', proTrialStartedAt: iso(NOW)}
    expect(() => syncProEntitlement(config, file, NOW)).not.toThrow()
  })
})
