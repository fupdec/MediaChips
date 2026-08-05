import {describe, it, expect} from 'vitest'
import {readNdjsonStream} from './useSettingsBackfillStream'

describe('useSettingsBackfillStream ndjson re-export', () => {
  it('re-exports readNdjsonStream', () => {
    expect(typeof readNdjsonStream).toBe('function')
  })
})
