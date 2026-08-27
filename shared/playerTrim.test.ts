import {describe, expect, it} from 'vitest'
import {
  allocateUniqueMediaPath,
  canApplyTrim,
  clampTrimValue,
  isFullDurationTrim,
  normalizeTrimRange,
} from './playerTrim'

describe('player trim range', () => {
  it('clamps and orders start/end', () => {
    expect(clampTrimValue(12, 0, 10)).toBe(10)
    expect(normalizeTrimRange(8, 2, 10)).toEqual({start: 2, end: 8, duration: 6})
    expect(normalizeTrimRange(-4, 99, 10)).toEqual({start: 0, end: 10, duration: 10})
  })

  it('rejects a full-file copy and tiny ranges', () => {
    expect(isFullDurationTrim(0, 120, 120)).toBe(true)
    expect(isFullDurationTrim(0.05, 119.9, 120)).toBe(true)
    expect(canApplyTrim(0, 120, 120)).toBe(false)
    expect(canApplyTrim(0, 0.1, 120)).toBe(false)
    expect(canApplyTrim(10, 90, 120)).toBe(true)
    expect(canApplyTrim(0, 119, 120)).toBe(true)
  })
})

describe('allocateUniqueMediaPath', () => {
  it('adds a numeric suffix when the stem is taken', () => {
    const existing = new Set(['/videos/clip_TRIM.mp4', '/videos/clip_TRIM_2.mp4'])
    expect(allocateUniqueMediaPath(
      '/videos',
      'clip_TRIM',
      '.mp4',
      (filePath) => existing.has(filePath),
      (dir, name) => `${dir}/${name}`,
    )).toBe('/videos/clip_TRIM_3.mp4')
  })
})
