import { describe, it, expect } from 'vitest'
import {
  filterMarksByTypes,
  getMarkListColor,
  getMarkListIcon,
  getMarkTimelineColor,
  getMarkTimelineIcon,
  getMarkTypeFilterValue,
  formatMarkTimeRange,
  getMarkTimelinePositionStyle,
  getMarkTimelineWidthStyle,
} from '@/composable/playerMarkDisplay'
import type { PlayerMark } from '@/types/player'

describe('playerMarkDisplay', () => {
  it('resolves list icon by mark type', () => {
    expect(getMarkListIcon({ type: 'favorite', time: 0 })).toBe('heart')
    expect(getMarkListIcon({ type: 'meta', time: 0, meta: { icon: 'star' } })).toBe('star')
    expect(getMarkListIcon({ type: 'note', time: 0 })).toBe('marker')
  })

  it('resolves timeline icon defaults', () => {
    expect(getMarkTimelineIcon({ type: 'note', time: 0 })).toBe('tooltip')
    expect(getMarkTimelineIcon({ type: 'meta', time: 0, meta: { icon: 'star' } })).toBe('tooltip')
  })

  it('resolves list color by mark type', () => {
    expect(getMarkListColor({ type: 'bookmark', time: 0 })).toBe('#f44336')
    expect(getMarkListColor({ type: 'meta', time: 0, tag: { color: '#abc' } })).toBe('#abc')
    expect(getMarkListColor({ type: 'note', time: 0 })).toBe('primary')
  })

  it('resolves timeline color defaults', () => {
    expect(getMarkTimelineColor({ type: 'note', time: 0 })).toBe('#ffffff')
  })

  it('filters marks by selected chip types', () => {
    const marks: PlayerMark[] = [
      { id: 1, type: 'favorite', time: 0 },
      { id: 2, type: 'meta', metaId: 5, time: 0 },
      { id: 3, type: 'bookmark', time: 0 },
    ]

    expect(filterMarksByTypes(marks, ['favorite'])).toEqual([marks[0]])
    expect(filterMarksByTypes(marks, ['bookmark', 5])).toEqual([marks[1], marks[2]])
  })

  it('uses meta id for meta mark filter value', () => {
    expect(getMarkTypeFilterValue({ type: 'meta', metaId: 7, time: 0 })).toBe(7)
  })

  it('formats mark time range', () => {
    const format = (value: number) => `t${value}`
    expect(formatMarkTimeRange({ time: 10, type: 'favorite' }, format)).toBe('t10')
    expect(formatMarkTimeRange({ time: 10, end: 20, type: 'favorite' }, format)).toBe('t10 – t20')
  })

  it('builds timeline layout styles', () => {
    expect(getMarkTimelinePositionStyle({ time: 30, type: 'favorite' }, 120)).toBe('left: 25%;')
    expect(getMarkTimelineWidthStyle({ time: 10, end: 30, type: 'favorite' }, 100, 400)).toBe('width: 80px;')
  })

  it('clamps timeline layout when mark time is outside duration', () => {
    expect(getMarkTimelinePositionStyle({ time: -5, type: 'favorite' }, 100)).toBe('left: 0%;')
    expect(getMarkTimelinePositionStyle({ time: 150, type: 'favorite' }, 100)).toBe('left: 100%;')
    expect(getMarkTimelinePositionStyle({ time: 30, type: 'favorite' }, 0)).toBe('')
    expect(getMarkTimelineWidthStyle({ time: 90, end: 200, type: 'favorite' }, 100, 400)).toBe('width: 40px;')
  })
})
