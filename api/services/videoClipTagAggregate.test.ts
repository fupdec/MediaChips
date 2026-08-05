import {describe, expect, it} from 'vitest'
import {aggregateFrameResults} from './videoClipTagAggregate'

describe('videoClipTagAggregate', () => {
  it('aggregates frame scores by dictionary key', () => {
    const suggestions = aggregateFrameResults([
      [{key: 'person', score: 0.4, prompt: 'x', mediaId: 1, mediaPath: '/a', timestamp: '00:00:01'}],
      [{key: 'person', score: 0.8, prompt: 'x', mediaId: 1, mediaPath: '/a', timestamp: '00:00:02'}],
    ], 'en', [])
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0]).toMatchObject({
      key: 'person',
      occurrences: 2,
      confidence: 0.8,
      label: 'person',
    })
  })

  it('skips labels that already exist', () => {
    const suggestions = aggregateFrameResults([
      [{key: 'dog', score: 0.9, prompt: 'x', mediaId: 1, mediaPath: '/a', timestamp: '00:00:01'}],
    ], 'en', [{name: 'Dog'}])
    expect(suggestions).toEqual([])
  })
})
