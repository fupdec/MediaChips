/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildGroupedSortItems,
  getAssignedSortParams,
  getSortParamGroup,
  getSortParams,
  isSortGroupHeader,
  normalizeSortBy,
} from '@/utils/mediaSortFilter'
import type { AssignedMeta } from '@/types/stores'

describe('mediaSortFilter assigned meta sorting', () => {
  const assigned: AssignedMeta[] = [
    {
      meta: {id: 42, name: 'Moral level', type: 'number', icon: 'church'},
    },
    {
      meta: {id: 43, name: 'Performers', type: 'array', icon: 'account'},
    },
  ]

  it('exposes only sortable pinned meta fields', () => {
    const params = getAssignedSortParams(assigned)
    expect(params).toHaveLength(1)
    expect(params[0]).toMatchObject({
      param: 42,
      text: 'Moral level',
      icon: 'church',
    })
  })

  it('keeps saved sortBy when it matches pinned meta id', () => {
    expect(normalizeSortBy('42', 'media', null, 'createdAt', assigned)).toBe('42')
  })

  it('falls back when sortBy is not allowed', () => {
    expect(normalizeSortBy('43', 'media', null, 'createdAt', assigned)).toBe('createdAt')
  })
})

describe('mediaSortFilter grouping', () => {
  const assigned: AssignedMeta[] = [
    {
      meta: {id: 42, name: 'Moral level', type: 'number', icon: 'church'},
    },
  ]

  it('assigns built-in params to expected groups', () => {
    const params = getSortParams('media', {id: 1, name: 'Video', key: 'video'} as never)
    const rating = params.find((param) => param.param === 'rating')
    const path = params.find((param) => param.param === 'path')
    const duration = params.find((param) => param.param === 'duration')

    expect(rating && getSortParamGroup(rating, 'media', null)).toBe('Preset meta')
    expect(path && getSortParamGroup(path, 'media', null)).toBe('File')
    expect(duration && getSortParamGroup(duration, 'media', {id: 1, name: 'Video', key: 'video'} as never)).toBe('Video')
  })

  it('builds grouped menu items with headers and dividers', () => {
    const params = [
      ...getSortParams('media', {id: 1, name: 'Video', key: 'video'} as never),
      ...getAssignedSortParams(assigned),
    ]
    const grouped = buildGroupedSortItems(params, 'media', {id: 1, name: 'Video', key: 'video'} as never)

    expect(grouped.some((item) => isSortGroupHeader(item) && item.header === 'Preset meta')).toBe(true)
    expect(grouped.some((item) => isSortGroupHeader(item) && item.header === 'Pinned meta')).toBe(true)
    expect(grouped.at(-1)).toMatchObject({param: 'shuffle'})
  })
})
