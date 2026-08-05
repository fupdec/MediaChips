import {describe, expect, it} from 'vitest'
import {
  BASE_GROUP_BY_OPTIONS,
  buildGroupedGroupByItems,
  filterGroupByOptions,
  getGroupByOptionCategory,
  isGroupByMenuOption,
} from './itemsGroupByMenu'

describe('getGroupByOptionCategory', () => {
  it('classifies presets, files, pinned, and media-specific groups', () => {
    expect(getGroupByOptionCategory({groupBy: 'none'}, 'media', null)).toBe('')
    expect(getGroupByOptionCategory({groupBy: 'rating'}, 'media', null)).toBe('Preset meta')
    expect(getGroupByOptionCategory({groupBy: 'path'}, 'media', null)).toBe('File')
    expect(getGroupByOptionCategory({groupBy: 'pinnedMeta', metaId: 3}, 'media', null)).toBe('Pinned meta')
    expect(getGroupByOptionCategory(
      {groupBy: 'duration', mediaTypes: ['video']},
      'media',
      {type: 'video'} as never,
    )).toBe('Video')
  })
})

describe('filterGroupByOptions', () => {
  it('keeps media-only options for media pages and filters by media type', () => {
    const filtered = filterGroupByOptions(BASE_GROUP_BY_OPTIONS, 'media', {type: 'video'} as never)
    expect(filtered.some((o) => o.groupBy === 'path')).toBe(true)
    expect(filtered.some((o) => o.groupBy === 'duration')).toBe(true)
    expect(filtered.every((o) => typeof o.value === 'string')).toBe(true)

    const tagFiltered = filterGroupByOptions(BASE_GROUP_BY_OPTIONS, 'tag', null)
    expect(tagFiltered.some((o) => o.groupBy === 'path')).toBe(false)
  })
})

describe('buildGroupedGroupByItems / isGroupByMenuOption', () => {
  it('inserts headers and dividers by category order', () => {
    const options = filterGroupByOptions(BASE_GROUP_BY_OPTIONS, 'media', {type: 'video'} as never)
    const grouped = buildGroupedGroupByItems(options)
    expect(grouped.some((item) => isGroupByMenuOption(item) && item.groupBy === 'none')).toBe(true)
    expect(grouped.some((item) => 'header' in item && item.header === 'Preset meta')).toBe(true)
    expect(grouped.some((item) => 'divider' in item && item.divider)).toBe(true)
  })
})
