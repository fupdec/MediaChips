import { describe, it, expect } from 'vitest'
import {
  getReadableDuration,
  getReadableFileSize,
  getTextColor,
  getHoverPreviewDimensions,
  getTagHoverPreviewDimensions,
} from '@/services/formatUtils'

describe('formatUtils', () => {
  it('formats duration as hh:mm:ss', () => {
    expect(getReadableDuration(65)).toBe('01:05')
    expect(getReadableDuration(3661)).toBe('01:01:01')
  })

  it('formats file sizes', () => {
    expect(getReadableFileSize(500)).toBe('500 B')
    expect(getReadableFileSize(2048)).toMatch(/KB/)
  })

  it('detects dark text on dark backgrounds', () => {
    expect(getTextColor('#000000')).toBe('white')
    expect(getTextColor('#ffffff')).toBe('black')
  })

  it('calculates hover preview dimensions', () => {
    expect(getHoverPreviewDimensions(1920, 1080)).toEqual({
      previewWidth: 180,
      previewHeight: 101,
    })
  })

  it('uses tag meta aspect ratio for non-avatar hover thumbs', () => {
    expect(getTagHoverPreviewDimensions('main', 2)).toEqual({
      previewWidth: 180,
      previewHeight: 90,
    })
    expect(getTagHoverPreviewDimensions('avatar', 2)).toEqual({
      previewWidth: 180,
      previewHeight: 180,
    })
  })
})
