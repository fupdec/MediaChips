import {describe, expect, it} from 'vitest'
import {
  META_SORT_MODES,
  META_TYPE_ORDER,
  getMetaSortOptions,
  getTopTagsSubtitleKey,
  groupMetaByType,
  sortMetaItems,
  sortTagItems,
} from './metaSort'

describe('getMetaSortOptions', () => {
  it('maps translate keys to sort mode values', () => {
    const options = getMetaSortOptions((key) => `t:${key}`)
    expect(options).toEqual([
      {title: 't:settings_labels.meta.sort_popularity', value: 'popularity'},
      {title: 't:settings_labels.meta.sort_menu', value: 'menu'},
      {title: 't:settings_labels.meta.sort_alphabet', value: 'alphabet'},
    ])
  })
})

describe('sortMetaItems', () => {
  const items = [
    {name: 'Bravo', views: 1, order: 2},
    {name: 'alpha', views: 5, order: 3},
    {name: 'Charlie', views: 5, order: 1},
  ]

  it('sorts by popularity then name', () => {
    expect(sortMetaItems(items, META_SORT_MODES.popularity).map((i) => i.name))
      .toEqual(['alpha', 'Charlie', 'Bravo'])
  })

  it('sorts alphabetically case-insensitively', () => {
    expect(sortMetaItems(items, META_SORT_MODES.alphabet).map((i) => i.name))
      .toEqual(['alpha', 'Bravo', 'Charlie'])
  })

  it('defaults to menu order then name', () => {
    expect(sortMetaItems(items).map((i) => i.name)).toEqual(['Charlie', 'Bravo', 'alpha'])
    expect(sortMetaItems(items, 'unknown' as never).map((i) => i.name))
      .toEqual(['Charlie', 'Bravo', 'alpha'])
  })
})

describe('sortTagItems', () => {
  const tags = [
    {id: 3, name: 'C', views: 1, favorite: false, createdAt: '2024-03-01'},
    {id: 1, name: 'a', views: 9, favorite: true, createdAt: '2024-01-01'},
    {id: 2, name: 'B', views: 9, favorite: false, createdAt: '2024-02-01'},
  ]

  it('sorts popularity and alphabet like meta', () => {
    expect(sortTagItems(tags, META_SORT_MODES.popularity).map((t) => t.name))
      .toEqual(['a', 'B', 'C'])
    expect(sortTagItems(tags, META_SORT_MODES.alphabet).map((t) => t.name))
      .toEqual(['a', 'B', 'C'])
  })

  it('uses category sort preference in menu mode', () => {
    expect(sortTagItems(tags, META_SORT_MODES.menu, {
      sortBy: 'createdAt',
      sortDir: 'asc',
    }).map((t) => t.id)).toEqual([1, 2, 3])

    expect(sortTagItems(tags, META_SORT_MODES.menu, {
      sortBy: 'favorite',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['a', 'B', 'C'])

    expect(sortTagItems(tags, META_SORT_MODES.menu, {
      sortBy: 'name',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['C', 'B', 'a'])
  })

  it('sorts by assignment / media count', () => {
    const counted = [
      {id: 1, name: 'a', mediaCount: 2},
      {id: 2, name: 'B', numberOfMedia: 5},
      {id: 3, name: 'C', assignmentCount: 1},
    ]
    expect(sortTagItems(counted, META_SORT_MODES.menu, {
      sortBy: 'mediaCount',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['B', 'a', 'C'])
  })

  it('sorts by video / image counts', () => {
    const counted = [
      {id: 1, name: 'a', videoCount: 2, imageCount: 9},
      {id: 2, name: 'B', numberOfVideos: 5, numberOfImages: 1},
      {id: 3, name: 'C', videoCount: 1, imageCount: 4},
    ]
    expect(sortTagItems(counted, META_SORT_MODES.menu, {
      sortBy: 'videoCount',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['B', 'a', 'C'])
    expect(sortTagItems(counted, META_SORT_MODES.menu, {
      sortBy: 'imageCount',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['a', 'C', 'B'])
  })

  it('sorts by nested assigned tag count', () => {
    const counted = [
      {id: 1, name: 'a', tagCount: 2},
      {id: 2, name: 'B', numberOfTags: 5},
      {id: 3, name: 'C', assignedTagCount: 1},
    ]
    expect(sortTagItems(counted, META_SORT_MODES.menu, {
      sortBy: 'tagCount',
      sortDir: 'desc',
    }).map((t) => t.name)).toEqual(['B', 'a', 'C'])
  })
})

describe('groupMetaByType', () => {
  it('groups known types in META_TYPE_ORDER and drops unknown', () => {
    const grouped = groupMetaByType([
      {type: 'string', name: 'B', order: 2},
      {type: 'array', name: 'A', order: 1},
      {type: 'custom', name: 'X', order: 0},
      {type: 'string', name: 'A', order: 1},
    ])
    expect(Object.keys(grouped)).toEqual(['array', 'string'])
    expect(META_TYPE_ORDER.filter((type) => type in grouped)).toEqual(['array', 'string'])
    expect(grouped.string.map((i) => i.name)).toEqual(['A', 'B'])
    expect(grouped.array.map((i) => i.name)).toEqual(['A'])
  })
})

describe('getTopTagsSubtitleKey', () => {
  it.each([
    ['popularity', undefined, 'widgets.top_tags.top_by_views'],
    ['alphabet', undefined, 'widgets.top_tags.top_alphabet'],
    ['menu', 'name', 'widgets.top_tags.top_alphabet'],
    ['menu', 'favorite', 'widgets.top_tags.top_by_favorite'],
    ['menu', 'mediaCount', 'widgets.top_tags.top_by_media_count'],
    ['menu', 'numberOfMedia', 'widgets.top_tags.top_by_media_count'],
    ['menu', 'assignmentCount', 'widgets.top_tags.top_by_media_count'],
    ['menu', 'videoCount', 'widgets.top_tags.top_by_video_count'],
    ['menu', 'numberOfVideos', 'widgets.top_tags.top_by_video_count'],
    ['menu', 'imageCount', 'widgets.top_tags.top_by_image_count'],
    ['menu', 'numberOfImages', 'widgets.top_tags.top_by_image_count'],
    ['menu', 'tagCount', 'widgets.top_tags.top_by_tag_count'],
    ['menu', 'numberOfTags', 'widgets.top_tags.top_by_tag_count'],
    ['menu', 'assignedTagCount', 'widgets.top_tags.top_by_tag_count'],
    ['menu', 'createdAt', 'widgets.top_tags.top_by_created'],
    ['menu', undefined, 'widgets.top_tags.top_by_created'],
    ['other', undefined, 'widgets.top_tags.top_by_created'],
  ] as const)('%s/%s → %s', (mode, sortBy, key) => {
    expect(getTopTagsSubtitleKey(mode as never, sortBy)).toBe(key)
  })
})
