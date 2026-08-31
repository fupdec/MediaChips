import {describe, expect, it} from 'vitest'
import {
  parseSeenFeatureHints,
  serializeSeenFeatureHints,
  readFeatureHintPreferences,
} from './featureHintPreferences'

describe('featureHintPreferences', () => {
  it('parses and serializes seen hint ids', () => {
    expect(parseSeenFeatureHints('')).toEqual([])
    expect(parseSeenFeatureHints('a, b,a')).toEqual(['a', 'b'])
    expect(serializeSeenFeatureHints(['a', 'b', 'a'])).toBe('a,b')
  })

  it('reads from config object', () => {
    expect(readFeatureHintPreferences({seenFeatureHints: 'drag-tags-between-cards'})).toEqual({
      seenFeatureHints: 'drag-tags-between-cards',
    })
    expect(readFeatureHintPreferences({})).toEqual({seenFeatureHints: ''})
  })
})
