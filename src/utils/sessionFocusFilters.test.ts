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

  it('groups tray tags in the same category into one in-all filter', () => {
    const filters = buildSessionFocusWithTagFilters([
      {tagId: 1, metaId: 7, name: 'A'},
      {tagId: 2, metaId: 7, name: 'B'},
      {tagId: 3, metaId: 9, name: 'C'},
    ])
    expect(filters).toHaveLength(2)
    expect(filters.find((row) => row.param === 7)).toMatchObject({
      cond: 'in all',
      val: [1, 2],
    })
    expect(filters.find((row) => row.param === 9)).toMatchObject({
      cond: 'in all',
      val: [3],
    })
  })

  it('builds has-none filters per category', () => {
    const filters = buildSessionFocusWithoutTagFilters([
      {tagId: 1, metaId: 7, name: 'A'},
      {tagId: 2, metaId: 7, name: 'B'},
    ])
    expect(filters).toHaveLength(1)
    expect(filters[0]).toMatchObject({
      param: 7,
      cond: 'not in',
      val: [1, 2],
    })
  })
})
