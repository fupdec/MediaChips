import {describe, expect, it} from 'vitest'
import {
  VISUAL_SEARCH_QUICK_SAMPLE_SIZE,
  clampVisualSearchQuickSampleSize,
} from './visualSearchQuick'

describe('clampVisualSearchQuickSampleSize', () => {
  it('defaults to 20 and clamps to 10–50', () => {
    expect(clampVisualSearchQuickSampleSize(undefined)).toBe(VISUAL_SEARCH_QUICK_SAMPLE_SIZE)
    expect(clampVisualSearchQuickSampleSize(null)).toBe(VISUAL_SEARCH_QUICK_SAMPLE_SIZE)
    expect(clampVisualSearchQuickSampleSize(5)).toBe(10)
    expect(clampVisualSearchQuickSampleSize(20)).toBe(20)
    expect(clampVisualSearchQuickSampleSize(40)).toBe(40)
    expect(clampVisualSearchQuickSampleSize(80)).toBe(50)
  })
})
