import { describe, expect, it } from 'vitest'
import {
  buildItemGroups,
  getItemBitrateBucketKey,
  getItemDiskRoot,
  getItemResolutionKey,
  getItemViewsBucketKey,
  parseGroupBySetting,
  serializeGroupBySetting,
  resolveActiveItemsGroupBy,
} from '@/utils/itemsGroupBy'

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
    expect(getItemDiskRoot('\\\\server\\share\\file.mp4')).toBe('\\\\server\\share')
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
    expect(resolveActiveItemsGroupBy('resolution', 'name', 'media')).toBe('none')
    expect(resolveActiveItemsGroupBy('diskRoot', 'path', 'media')).toBe('diskRoot')
  })
})
