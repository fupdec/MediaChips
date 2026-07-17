import {describe, expect, it} from 'vitest'
import {pickTpdbApiKey} from './tpdbApiKey'
import {buildTpdbPerformersPath} from './theporndbApi'

describe('pickTpdbApiKey', () => {
  it('prefers global config over database and environment', () => {
    expect(pickTpdbApiKey('config-key', 'db-key', 'env-key')).toEqual({
      key: 'config-key',
      source: 'settings',
    })
  })

  it('prefers database settings over environment', () => {
    expect(pickTpdbApiKey('', 'settings-key', 'env-key')).toEqual({
      key: 'settings-key',
      source: 'settings',
    })
  })

  it('falls back to environment when config and settings are empty', () => {
    expect(pickTpdbApiKey('  ', null, 'env-key')).toEqual({
      key: 'env-key',
      source: 'env',
    })
  })

  it('returns empty when no source is set', () => {
    expect(pickTpdbApiKey(null, null, '')).toEqual({
      key: '',
      source: null,
    })
  })
})

describe('buildTpdbPerformersPath', () => {
  it('builds query string for performer search', () => {
    expect(buildTpdbPerformersPath({
      q: 'jane',
      gender: 'Female',
      page: 2,
      perPage: 24,
    })).toBe('/performers?q=jane&gender=Female&page=2&per_page=24')
  })

  it('omits empty params', () => {
    expect(buildTpdbPerformersPath({})).toBe('/performers')
  })
})
