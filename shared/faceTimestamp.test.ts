import {describe, expect, it} from 'vitest'
import {parseFaceTimestampSeconds} from './faceTimestamp'

describe('parseFaceTimestampSeconds', () => {
  it('parses HH:MM:SS timestamps', () => {
    expect(parseFaceTimestampSeconds('01:02:03')).toBe(3723)
  })

  it('parses MM:SS timestamps', () => {
    expect(parseFaceTimestampSeconds('02:30')).toBe(150)
  })

  it('parses numeric seconds', () => {
    expect(parseFaceTimestampSeconds('42.5')).toBe(42.5)
  })

  it('returns null for empty or invalid values', () => {
    expect(parseFaceTimestampSeconds(null)).toBeNull()
    expect(parseFaceTimestampSeconds('')).toBeNull()
    expect(parseFaceTimestampSeconds('bad')).toBeNull()
  })
})
