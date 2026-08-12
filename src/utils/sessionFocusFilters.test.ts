import {describe, expect, it} from 'vitest'
import {
  buildSessionFocusWithTagFilters,
  buildSessionFocusWithoutTagFilters,
} from './sessionFocusFilters'

describe('sessionFocusFilters', () => {
  const tag = {
    tagId: 42,
    metaId: 7,
    name: 'Alice',
  }

  it('builds a with-tag filter locked to the focus tag', () => {
    const filters = buildSessionFocusWithTagFilters(tag)
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 7,
      type: 'array',
      cond: 'in all',
      val: [42],
      note: 'session-focus-with',
    })
  })

  it('builds a without-tag filter for tagging candidates', () => {
    const filters = buildSessionFocusWithoutTagFilters(tag)
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 7,
      type: 'array',
      cond: 'not in',
      val: [42],
      note: 'session-focus-without',
    })
  })
})
