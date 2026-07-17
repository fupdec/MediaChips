import { describe, expect, it } from 'vitest'
import {
  aggregateGroupedItems,
  buildItemGroups,
  getItemBitrateBucketKey,
  getItemDiskRoot,
  getItemResolutionKey,
  getItemViewsBucketKey,
  parseGroupBySetting,
  serializeGroupBySetting,
  resolveActiveItemsGroupBy,
} from '@/utils/itemsGroupBy'
import {
  BASE_GROUP_BY_OPTIONS,
  buildGroupedGroupByItems,
  filterGroupByOptions,
  isGroupByGroupHeader,
  isGroupByMenuOption,
} from '@/utils/itemsGroupByMenu'

describe('parse/serialize group by', () => {
  it('parses pinned meta settings', () => {
    expect(parseGroupBySetting('pinnedMeta:42')).toEqual({
      groupBy: 'pinnedMeta',
      metaId: 42,
    })
    expect(serializeGroupBySetting('pinnedMeta', 7)).toBe('pinnedMeta:7')
    expect(serializeGroupBySetting('views')).toBe('views')
  })
})

describe('new group keys', () => {
  it('maps disk roots', () => {
    expect(getItemDiskRoot('D:\\Videos\\a.mp4')).toBe('D:\\')
    expect(getItemDiskRoot('/Users/me/Movies/a.mp4')).toBe('/Users')
    expect(getItemDiskRoot('/Volumes/Data/video.mp4')).toBe('/Volumes/Data')
    expect(getItemDiskRoot('\\\\server\\share\\file.mp4')).toBe('\\\\server\\share')
    expect(getItemDiskRoot('file:///Users/me/Movies/a.mp4')).toBe('/Users')
    expect(getItemDiskRoot('file:///D:/Videos/a.mp4')).toBe('D:\\')
  })

  it('maps views, bitrate and resolution buckets', () => {
    expect(getItemViewsBucketKey({views: 0})).toBe('0')
    expect(getItemViewsBucketKey({views: 25})).toBe('11_50')
    expect(getItemBitrateBucketKey({bitrate: 2_500_000})).toBe('1_5m')
    expect(getItemResolutionKey({width: 1920, height: 1080})).toBe('1080p')
    expect(getItemResolutionKey({width: 3840, height: 2160})).toBe('2160p')
  })

  it('groups by pinned meta tags', () => {
    const groups = buildItemGroups(
      [
        {id: 1, tags: [{tagId: 10, metaId: 5}]},
        {id: 2, tags: [{tagId: 10, metaId: 5}]},
        {id: 3, tags: []},
      ],
      'pinnedMeta',
      'name',
      {
        metaId: 5,
        metaType: 'array',
        resolveTagName: (id) => (id === 10 ? 'Action' : String(id)),
      },
    )
    expect(groups.map((group) => group.label)).toEqual(['Action', 'No value'])
    expect(groups[0].items.map((item) => item.id)).toEqual([1, 2])
    expect(groups[0].filter).toEqual({metaId: 5, type: 'array', tagIds: [10]})
    expect(groups[1].filter).toEqual({metaId: 5, type: 'array', tagIds: []})
  })

  it('activates resolution with height sort', () => {
    expect(resolveActiveItemsGroupBy('resolution', 'height', 'media')).toBe('resolution')
    expect(resolveActiveItemsGroupBy('resolution', 'name', 'media')).toBe('resolution')
    expect(resolveActiveItemsGroupBy('diskRoot', 'path', 'media')).toBe('diskRoot')
    expect(resolveActiveItemsGroupBy('diskRoot', 'name', 'media')).toBe('diskRoot')
    expect(resolveActiveItemsGroupBy('firstLetter', 'shuffle', 'media')).toBe('none')
  })

  it('rebuckets disk roots regardless of list sort', () => {
    const groups = buildItemGroups(
      [
        {id: 1, path: '/Volumes/A/one.mp4'},
        {id: 2, path: '/Users/me/two.mp4'},
        {id: 3, path: '/Volumes/A/three.mp4'},
      ],
      'diskRoot',
      'name',
    )
    expect(groups.map((group) => group.label)).toEqual(['/Users', '/Volumes/A'])
    expect(groups[1].items.map((item) => item.id)).toEqual([1, 3])
  })
})

describe('aggregateGroupedItems', () => {
  it('returns library-wide counts and group-ordered ids', () => {
    const {groups, orderedIds} = aggregateGroupedItems(
      [
        {id: 1, name: 'Beta'},
        {id: 2, name: 'Alpha'},
        {id: 3, name: 'Charlie'},
        {id: 4, name: 'Another'},
      ],
      'firstLetter',
      'name',
    )

    expect(groups.map((group) => ({key: group.key, count: group.count}))).toEqual([
      {key: 'A', count: 2},
      {key: 'B', count: 1},
      {key: 'C', count: 1},
    ])
    expect(groups.reduce((sum, group) => sum + group.count, 0)).toBe(4)
    expect(orderedIds).toEqual([2, 4, 1, 3])
  })

  it('orders tag pinned-meta groups alphabetically by tag name', () => {
    const items = [
      {id: 1, tags: [{tagId: 30, metaId: 5}]},
      {id: 2, tags: [{tagId: 10, metaId: 5}]},
      {id: 3, tags: [{tagId: 20, metaId: 5}]},
      {id: 4, tags: []},
    ]
    const resolveTagName = (id: number) => (
      id === 10 ? 'Zebra'
        : id === 20 ? 'Alpha'
          : id === 30 ? 'Middle'
            : String(id)
    )

    const asc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'array',
      direction: 'asc',
      resolveTagName,
    })
    expect(asc.groups.map((group) => group.label)).toEqual(['Alpha', 'Middle', 'Zebra', 'No value'])
    expect(asc.groups.map((group) => group.key)).toEqual(['20', '30', '10', '#'])

    const desc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'array',
      direction: 'desc',
      resolveTagName,
    })
    expect(desc.groups.map((group) => group.label)).toEqual(['Zebra', 'Middle', 'Alpha', 'No value'])
  })

  it('orders number pinned-meta groups by sort direction', () => {
    const items = [
      {id: 1, values: [{metaId: 5, value: '10'}]},
      {id: 2, values: [{metaId: 5, value: '2'}]},
      {id: 3, values: [{metaId: 5, value: '10'}]},
      {id: 4, values: [{metaId: 5, value: '7'}]},
    ]

    const asc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'number',
      direction: 'asc',
    })
    expect(asc.groups.map((group) => group.key)).toEqual(['2', '7', '10'])
    expect(asc.orderedIds).toEqual([2, 4, 1, 3])

    const desc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'number',
      direction: 'desc',
    })
    expect(desc.groups.map((group) => group.key)).toEqual(['10', '7', '2'])
    expect(desc.orderedIds).toEqual([1, 3, 4, 2])
  })

  it('keeps empty number meta group at the end for both directions', () => {
    const items = [
      {id: 1, values: [{metaId: 5, value: '3'}]},
      {id: 2, values: []},
      {id: 3, values: [{metaId: 5, value: '1'}]},
    ]

    const asc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'number',
      direction: 'asc',
    })
    expect(asc.groups.map((group) => group.key)).toEqual(['1', '3', '#'])

    const desc = aggregateGroupedItems(items, 'pinnedMeta', 'name', {
      metaId: 5,
      metaType: 'number',
      direction: 'desc',
    })
    expect(desc.groups.map((group) => group.key)).toEqual(['3', '1', '#'])
  })
})

describe('group by menu', () => {
  it('builds categorized menu with pinned meta entries', () => {
    const options = filterGroupByOptions(
      [
        ...BASE_GROUP_BY_OPTIONS,
        {groupBy: 'pinnedMeta', metaId: 9, icon: 'tag', label: 'Genre'},
      ],
      'media',
      {type: 'video'} as never,
    )
    const grouped = buildGroupedGroupByItems(options)
    expect(grouped.some((item) => isGroupByGroupHeader(item) && item.header === 'Preset meta')).toBe(true)
    expect(grouped.some((item) => isGroupByGroupHeader(item) && item.header === 'Pinned meta')).toBe(true)
    expect(grouped.some((item) => isGroupByMenuOption(item) && item.value === 'pinnedMeta:9')).toBe(true)
    expect(grouped.some((item) => isGroupByMenuOption(item) && item.value === 'pinnedMeta')).toBe(false)
  })
})
