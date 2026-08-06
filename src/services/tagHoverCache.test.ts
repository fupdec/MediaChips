import { describe, expect, it } from 'vitest'

import { hasVisibleTagHoverPinnedMeta } from './tagHoverCache'

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
