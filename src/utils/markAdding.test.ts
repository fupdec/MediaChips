import {describe, expect, it} from 'vitest'
import {
  BASE_MARK_TYPES,
  buildMarkPayload,
  buildMarkTypes,
  findAssignedMeta,
  isMetaMarkType,
  normalizeMarkTime,
} from './markAdding'

describe('isMetaMarkType', () => {
  it.each([
    ['favorite', false],
    ['bookmark', false],
    ['meta', true],
    ['12', true],
  ])('%s → %s', (type, expected) => {
    expect(isMetaMarkType(type)).toBe(expected)
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
  it('starts from base favorite/bookmark types', () => {
    expect(buildMarkTypes()).toEqual([...BASE_MARK_TYPES])
  })

  it('appends assigned metas that allow marks', () => {
    const types = buildMarkTypes([
      {meta: {id: 5, name: 'Performers', marks: true}},
      {meta: {id: 6, name: 'Hidden', marks: false}},
      {meta: {id: 7, name: 'NoMarks'}},
      {meta: {id: 8, name: 'Scenes', marks: true, icon: 'movie'}},
    ])
    expect(types).toHaveLength(4)
    expect(types.slice(2)).toEqual([
      {value: 5, text: 'Performers', icon: 'tag'},
      {value: 8, text: 'Scenes', icon: 'movie'},
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

describe('buildMarkPayload', () => {
  it('builds a base mark without end', () => {
    expect(buildMarkPayload({
      adding: {time: 12.8, type: 'bookmark'},
      mediaId: '5',
    })).toEqual({
      type: 'bookmark',
      time: 12,
      end: undefined,
      mediaId: 5,
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
      adding: {time: 1, type: 'favorite'},
      data: {tagId: [42], note: 'hi'},
      mediaId: 3,
    })).toMatchObject({
      type: 'meta',
      tagId: 42,
      note: 'hi',
      mediaId: 3,
      time: 1,
    })
  })
})
