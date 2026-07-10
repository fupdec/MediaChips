import { describe, expect, it } from 'vitest'
import {
  parseSkippedUpdateVersions,
  readUpdatePreferences,
  serializeSkippedUpdateVersions,
} from '@shared/updatePreferences'

describe('updatePreferences shared helpers', () => {
  it('reads defaults when config keys are missing', () => {
    expect(readUpdatePreferences({})).toEqual({
      lastSeenVersion: '',
      skippedUpdateVersions: '',
    })
  })

  it('parses and serializes skipped versions', () => {
    expect(parseSkippedUpdateVersions('1.0.11, 1.0.12,1.0.11')).toEqual(['1.0.11', '1.0.12', '1.0.11'])
    expect(serializeSkippedUpdateVersions(['1.0.12', '1.0.11', '1.0.12'])).toBe('1.0.12,1.0.11')
  })
})
