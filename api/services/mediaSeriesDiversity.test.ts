import {describe, expect, it} from 'vitest'
import {diversifyIdsBySeriesKey, mediaSeriesKey} from './mediaSeriesDiversity'

describe('mediaSeriesKey', () => {
  it('collapses numbered scene suffixes', () => {
    expect(mediaSeriesKey({basename: '14761_001.mp4'})).toBe('14761')
    expect(mediaSeriesKey({basename: '14761_005.mp4'})).toBe('14761')
    expect(mediaSeriesKey({name: 'Show Part 2'})).toBe('show')
    expect(mediaSeriesKey({basename: 'clip-03.mkv'})).toBe('clip')
  })

  it('keeps plain titles intact', () => {
    expect(mediaSeriesKey({basename: '0490.mp4'})).toBe('0490')
    expect(mediaSeriesKey({name: 'Abr0k1109S84Hd'})).toBe('abr0k1109s84hd')
  })
})

describe('diversifyIdsBySeriesKey', () => {
  it('keeps one item per series and skips the seed series', () => {
    const byId = new Map([
      [1, {id: 1, basename: '14761_001.mp4'}],
      [2, {id: 2, basename: '14761_002.mp4'}],
      [3, {id: 3, basename: 'other.mp4'}],
      [4, {id: 4, basename: 'third_01.mp4'}],
      [5, {id: 5, basename: 'third_02.mp4'}],
    ])

    expect(diversifyIdsBySeriesKey([1, 2, 3, 4, 5], byId, {
      limit: 3,
      reservedKeys: [mediaSeriesKey({basename: 'seed.mp4'})],
    })).toEqual([1, 3, 4])

    expect(diversifyIdsBySeriesKey([1, 2, 3, 4, 5], byId, {
      limit: 3,
      reservedKeys: ['14761'],
    })).toEqual([3, 4])
  })
})
