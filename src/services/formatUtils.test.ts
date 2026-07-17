import { describe, it, expect } from 'vitest'
import {
  getReadableDuration,
  getReadableFileSize,
  getTextColor,
  getHoverPreviewDimensions,
  getTagHoverPreviewDimensions,
  highlightGlobalSearchText,
  textMatchesGlobalSearchQuery,
  formatFilterDateDisplay,
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

  it('highlights contiguous global search queries', () => {
    expect(highlightGlobalSearchText('Piss Shower', 'piss s')).toContain(
      '<mark class="global-search__hl">Piss S</mark>hower',
    )
  })

  it('highlights global search token prefixes when query is split', () => {
    const html = highlightGlobalSearchText('sybil piss in mouth', 'piss s')
    expect(html).toContain('<mark class="global-search__hl">s</mark>ybil')
    expect(html).toContain('<mark class="global-search__hl">piss</mark>')
    expect(textMatchesGlobalSearchQuery('sybil piss in mouth', 'piss s')).toBe(true)
    expect(textMatchesGlobalSearchQuery('Piss Shower', 'piss s')).toBe(true)
  })

  it('formats filter dates for display without changing storage shape', () => {
    expect(formatFilterDateDisplay('2024-03-15', 'en')).toMatch(/March/)
    expect(formatFilterDateDisplay('2024-03-15', 'ru')).toMatch(/марта|март/i)
    expect(formatFilterDateDisplay('2024-03-15', 'cn')).toMatch(/2024/)
    expect(formatFilterDateDisplay(null)).toBe('')
    expect(formatFilterDateDisplay('not-a-date')).toBe('not-a-date')
  })
})
