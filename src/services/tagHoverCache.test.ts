import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    postTagItems: vi.fn(),
    getPinnedChildMeta: vi.fn(),
  },
}))

import { typedApi } from '@/services/typedApi'
import {
  getCachedPinnedChildMetaForHover,
  getCachedTagForHover,
  hasVisibleTagHoverPinnedMeta,
  invalidateTagHoverCache,
  loadPinnedChildMetaForHover,
  loadTagForHover,
} from './tagHoverCache'

describe('hasVisibleTagHoverPinnedMeta', () => {
  it('hides the section when no card fields are shown', () => {
    expect(hasVisibleTagHoverPinnedMeta(
      { tags: [{ tagId: 1, metaId: 10 }], values: [{ metaId: 20, value: 'blue' }] },
      [{ pinnedMetaId: 10, show: false }],
    )).toBe(false)

    expect(hasVisibleTagHoverPinnedMeta(
      { tags: [{ tagId: 1, metaId: 10 }] },
      [],
    )).toBe(false)
  })

  it('shows the section when a visible pinned tag or value exists', () => {
    expect(hasVisibleTagHoverPinnedMeta(
      { tags: [{ tagId: 1, metaId: 10 }], values: [] },
      [{ pinnedMetaId: 10, show: true }],
    )).toBe(true)

    expect(hasVisibleTagHoverPinnedMeta(
      { tags: [], values: [{ metaId: 20, value: 'blue' }] },
      [{ pinnedMetaId: 20, show: 1 }],
    )).toBe(true)
  })

  it('ignores blank values even when the field is shown', () => {
    expect(hasVisibleTagHoverPinnedMeta(
      { tags: [], values: [{ metaId: 20, value: '' }] },
      [{ pinnedMetaId: 20, show: true }],
    )).toBe(false)
  })
})

describe('tag hover cache invalidation', () => {
  beforeEach(() => {
    invalidateTagHoverCache()
    vi.mocked(typedApi.postTagItems).mockReset()
    vi.mocked(typedApi.getPinnedChildMeta).mockReset()
  })

  it('returns cached tag until invalidated', async () => {
    vi.mocked(typedApi.postTagItems).mockResolvedValue({
      data: { items: [{ id: 7, name: 'LuxBby', synonyms: 'old' }] },
    } as never)

    const first = await loadTagForHover(18, 7)
    expect(first?.name).toBe('LuxBby')
    expect(getCachedTagForHover(18, 7)?.synonyms).toBe('old')
    expect(typedApi.postTagItems).toHaveBeenCalledTimes(1)

    const second = await loadTagForHover(18, 7)
    expect(second?.synonyms).toBe('old')
    expect(typedApi.postTagItems).toHaveBeenCalledTimes(1)

    invalidateTagHoverCache(18, 7)
    expect(getCachedTagForHover(18, 7)).toBeUndefined()

    vi.mocked(typedApi.postTagItems).mockResolvedValue({
      data: { items: [{ id: 7, name: 'LuxBby', synonyms: 'new' }] },
    } as never)

    const third = await loadTagForHover(18, 7)
    expect(third?.synonyms).toBe('new')
    expect(typedApi.postTagItems).toHaveBeenCalledTimes(2)
  })

  it('clears pinned child meta when invalidating by meta id', async () => {
    vi.mocked(typedApi.getPinnedChildMeta).mockResolvedValue({
      data: [{ pinnedMetaId: 20, show: true }],
    } as never)

    await loadPinnedChildMetaForHover(18)
    expect(getCachedPinnedChildMetaForHover(18)?.length).toBe(1)

    invalidateTagHoverCache(18)
    expect(getCachedPinnedChildMetaForHover(18)).toBeUndefined()
  })
})
