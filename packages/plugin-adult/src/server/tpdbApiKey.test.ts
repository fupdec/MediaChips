import {describe, expect, it} from 'vitest'
import {pickTpdbApiKey} from './tpdbApiKey'
import {buildTpdbPerformersPath} from './theporndbApi'

describe('pickTpdbApiKey', () => {
  it('prefers settings over environment', () => {
    expect(pickTpdbApiKey('settings-key', 'env-key')).toEqual({
      key: 'settings-key',
      source: 'settings',
    })
  })

  it('falls back to environment when settings are empty', () => {
    expect(pickTpdbApiKey('  ', 'env-key')).toEqual({
      key: 'env-key',
      source: 'env',
    })
  })

  it('returns empty when neither source is set', () => {
    expect(pickTpdbApiKey(null, '')).toEqual({
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
