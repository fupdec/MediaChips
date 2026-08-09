import {describe, expect, it} from 'vitest'
import {
  BASE_MARK_TYPES,
  CHAPTER_MARK_ICON,
  DEFAULT_BOOKMARK_ICON,
  TAG_MARK_TYPE,
  buildMarkPayload,
  buildMarkTypes,
  findAssignedMeta,
  getAssignedArrayMetas,
  isChapterMark,
  isMetaMarkType,
  isTagMarkType,
  normalizeMarkTime,
  resolveMarkEditIcon,
  resolveMarkEditType,
} from './markAdding'

describe('isMetaMarkType / isTagMarkType', () => {
  it.each([
    ['favorite', false],
    ['bookmark', false],
    ['scene', false],
    ['meta', false],
    ['12', false],
    ['tag', true],
  ])('%s → %s', (type, expected) => {
    expect(isMetaMarkType(type)).toBe(expected)
    expect(isTagMarkType(type)).toBe(expected)
  })
})

describe('normalizeMarkTime', () => {
  it.each([
    [3.9, 3],
    ['-1', 0],
    [null, 0],
    [Number.NaN, 0],
    ['x', 0],
  ])('normalizes %j to %j', (input, expected) => {
    expect(normalizeMarkTime(input)).toBe(expected)
  })

  it('uses custom fallback for invalid values', () => {
    expect(normalizeMarkTime('x', 7)).toBe(7)
  })
})

describe('buildMarkTypes', () => {
  it('returns favorite, bookmark and a single Tag type', () => {
    expect(buildMarkTypes()).toEqual([...BASE_MARK_TYPES, TAG_MARK_TYPE])
  })

  it('ignores assigned metas and legacy marks flags', () => {
    const types = buildMarkTypes([
      {meta: {id: 5, name: 'Performers', marks: true, type: 'array'}},
      {meta: {id: 6, name: 'Hidden', marks: false, type: 'array'}},
      {meta: {id: 8, name: 'Scenes', marks: true, icon: 'movie', type: 'array'}},
    ])
    expect(types).toEqual([...BASE_MARK_TYPES, TAG_MARK_TYPE])
  })
})

describe('getAssignedArrayMetas', () => {
  it('keeps only assigned array categories', () => {
    expect(getAssignedArrayMetas([
      {meta: {id: 5, name: 'Performers', type: 'array'}},
      {meta: {id: 6, name: 'Rating', type: 'rating'}},
      {meta: {id: 7, name: 'NoType'}},
      {meta: {name: 'MissingId', type: 'array'}},
    ])).toEqual([
      {meta: {id: 5, name: 'Performers', type: 'array'}},
    ])
  })
})

describe('findAssignedMeta', () => {
  const assigned = [
    {metaId: 2, meta: {id: 2, name: 'A'}},
    {meta: {id: 9, name: 'B'}},
  ]

  it('matches metaId or nested meta.id', () => {
    expect(findAssignedMeta(assigned, 2)?.meta?.name).toBe('A')
    expect(findAssignedMeta(assigned, '9')?.meta?.name).toBe('B')
  })

  it('returns undefined for misses', () => {
    expect(findAssignedMeta(assigned, 99)).toBeUndefined()
    expect(findAssignedMeta(null, 2)).toBeUndefined()
  })
})

describe('resolveMarkEditType / icon', () => {
  it('maps legacy scene to bookmark + chapter icon', () => {
    expect(resolveMarkEditType({type: 'scene'})).toBe('bookmark')
    expect(resolveMarkEditIcon({type: 'scene'})).toBe(CHAPTER_MARK_ICON)
  })

  it('maps meta marks to the Tag chip', () => {
    expect(resolveMarkEditType({type: 'meta', tag: {metaId: 4}})).toBe('tag')
    expect(resolveMarkEditType({type: 'meta', metaId: 7})).toBe('tag')
    expect(resolveMarkEditType({type: 'tag'})).toBe('tag')
  })
})

describe('isChapterMark', () => {
  it('detects chapter bookmarks and legacy scene', () => {
    expect(isChapterMark({type: 'scene', tagId: null})).toBe(true)
    expect(isChapterMark({
      type: 'bookmark',
      icon: CHAPTER_MARK_ICON,
      tagId: null,
    })).toBe(true)
    expect(isChapterMark({
      type: 'bookmark',
      icon: DEFAULT_BOOKMARK_ICON,
      tagId: null,
    })).toBe(false)
  })
})

describe('buildMarkPayload', () => {
  it('builds a bookmark with default icon', () => {
    expect(buildMarkPayload({
      adding: {time: 12.8, type: 'bookmark'},
      data: {text: 'Note'},
      mediaId: '5',
    })).toEqual({
      type: 'bookmark',
      time: 12,
      end: null,
      mediaId: 5,
      tagId: null,
      text: 'Note',
      icon: DEFAULT_BOOKMARK_ICON,
    })
  })

  it('clamps end to time when end is earlier', () => {
    expect(buildMarkPayload({
      adding: {time: 10, is_end_time_active: true, end: 4, type: 'favorite'},
      mediaId: 1,
    }).end).toBe(10)
  })

  it('forces meta type when tagId is present', () => {
    expect(buildMarkPayload({
      adding: {time: 1, type: 'tag'},
      data: {tagId: [42], note: 'hi'},
      mediaId: 3,
    })).toMatchObject({
      type: 'meta',
      tagId: 42,
      note: 'hi',
      mediaId: 3,
      time: 1,
      text: null,
      icon: null,
    })
  })

  it('keeps incomplete tag mode without tagId', () => {
    expect(buildMarkPayload({
      adding: {time: 2, type: 'tag'},
      mediaId: 3,
    })).toMatchObject({
      type: 'tag',
      tagId: null,
      text: null,
      icon: null,
    })
  })

  it('stores chapter icon on bookmark payload', () => {
    expect(buildMarkPayload({
      adding: {time: 5, type: 'bookmark', icon: CHAPTER_MARK_ICON},
      data: {text: 'Intro', icon: CHAPTER_MARK_ICON},
      mediaId: 9,
    })).toMatchObject({
      type: 'bookmark',
      tagId: null,
      text: 'Intro',
      icon: CHAPTER_MARK_ICON,
      time: 5,
      mediaId: 9,
    })
  })

  it('normalizes legacy scene type to bookmark + chapter icon', () => {
    expect(buildMarkPayload({
      adding: {time: 5, type: 'scene'},
      data: {text: 'Intro'},
      mediaId: 9,
    })).toMatchObject({
      type: 'bookmark',
      icon: CHAPTER_MARK_ICON,
      text: 'Intro',
    })
  })
})
