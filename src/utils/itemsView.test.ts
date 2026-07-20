import { describe, expect, it } from 'vitest'
import { isImageOnlyItemsView, normalizeItemsView } from '@/utils/itemsView'
import type { MediaType } from '@/types/media'

const videoType = { id: 1, type: 'video' } as MediaType
const imageType = { id: 2, type: 'image' } as MediaType

describe('normalizeItemsView', () => {
  it('keeps supported video views and resets removed ones', () => {
    expect(normalizeItemsView(1, 'media', videoType)).toBe(1)
    expect(normalizeItemsView(2, 'media', videoType)).toBe(2)
    expect(normalizeItemsView(4, 'media', videoType)).toBe(4)
    expect(normalizeItemsView(3, 'media', videoType)).toBe(1)
    expect(normalizeItemsView(5, 'media', videoType)).toBe(1)
  })

  it('keeps supported image views only', () => {
    expect(normalizeItemsView(3, 'media', imageType)).toBe(3)
    expect(normalizeItemsView(2, 'media', imageType)).toBe(1)
    expect(normalizeItemsView(4, 'media', imageType)).toBe(1)
  })

  it('keeps supported tag views only', () => {
    expect(normalizeItemsView(1, 'tag')).toBe(1)
    expect(normalizeItemsView(2, 'tag')).toBe(2)
    expect(normalizeItemsView(4, 'tag')).toBe(4)
    expect(normalizeItemsView(5, 'tag')).toBe(1)
  })
})

describe('isImageOnlyItemsView', () => {
  it('detects image-only view', () => {
    expect(isImageOnlyItemsView(4)).toBe(true)
    expect(isImageOnlyItemsView('4')).toBe(true)
    expect(isImageOnlyItemsView(1)).toBe(false)
    expect(isImageOnlyItemsView(null)).toBe(false)
  })
})
