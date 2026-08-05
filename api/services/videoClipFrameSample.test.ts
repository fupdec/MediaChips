import {describe, expect, it} from 'vitest'
import {getClipFrameTimestamps, normalizeClipTagName} from './videoClipFrameSample'

describe('videoClipFrameSample', () => {
  it('samples uniform mid-range timestamps', () => {
    expect(getClipFrameTimestamps(100, 1)).toEqual(['00:00:50'])
    expect(getClipFrameTimestamps(100, 2)).toEqual(['00:00:15', '00:01:30'])
  })

  it('normalizes tag names', () => {
    expect(normalizeClipTagName('  Foo ')).toBe('foo')
  })
})
