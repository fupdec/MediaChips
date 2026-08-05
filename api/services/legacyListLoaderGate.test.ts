/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  enterLegacyListLoader,
  getLegacyListLoaderFallbackStats,
  isLegacyListLoaderDisabled,
  LegacyListLoaderDisabledError,
  resetLegacyListLoaderFallbackStats,
  shouldLogLegacyListLoader,
} from './legacyListLoaderGate'

const ENV_KEYS = [
  'MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS',
  'MEDIA_CHIPS_LOG_LEGACY_LIST_LOADERS',
  'MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER',
  'MEDIA_CHIPS_LOG_LEGACY_TAG_LOADER',
  'NODE_ENV',
] as const

const originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {}

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key]
    else process.env[key] = originalEnv[key]
  }
  resetLegacyListLoaderFallbackStats()
  vi.restoreAllMocks()
})

for (const key of ENV_KEYS) {
  originalEnv[key] = process.env[key]
}

describe('legacyListLoaderGate', () => {
  it('counts fallbacks and logs in non-production', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    enterLegacyListLoader('media', 'Missing mediaTypeId', '(mediaTypeId=none)')
    enterLegacyListLoader('media', 'Missing mediaTypeId', '(mediaTypeId=none)')
    enterLegacyListLoader('tag', 'Missing metaId', '(metaId=none)')

    expect(getLegacyListLoaderFallbackStats()).toEqual({
      'media:Missing mediaTypeId': 2,
      'tag:Missing metaId': 1,
    })
    expect(warn).toHaveBeenCalled()
  })

  it('throws when legacy loaders are disabled', () => {
    process.env.MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS = '1'
    expect(isLegacyListLoaderDisabled()).toBe(true)

    expect(() => enterLegacyListLoader('tag', 'Unsupported tag filter: x', '(metaId=1)'))
      .toThrow(LegacyListLoaderDisabledError)

    expect(getLegacyListLoaderFallbackStats()['tag:Unsupported tag filter: x']).toBe(1)
  })

  it('stays quiet in production unless log flag is set', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.MEDIA_CHIPS_LOG_LEGACY_LIST_LOADERS
    delete process.env.MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER
    delete process.env.MEDIA_CHIPS_DISABLE_LEGACY_LIST_LOADERS

    expect(shouldLogLegacyListLoader('media')).toBe(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    enterLegacyListLoader('media', 'Missing mediaTypeId', '(mediaTypeId=none)')
    expect(warn).not.toHaveBeenCalled()

    process.env.MEDIA_CHIPS_LOG_LEGACY_MEDIA_LOADER = '1'
    enterLegacyListLoader('media', 'Missing mediaTypeId', '(mediaTypeId=none)')
    expect(warn).toHaveBeenCalled()
  })
})
