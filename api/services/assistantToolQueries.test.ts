import {describe, expect, it} from 'vitest'
import {
  clampAssistantToolLimit,
  filterMediaRowsByQuery,
  filterTagRowsByQuery,
  resolveAssistantToolQuery,
} from './assistantToolQueries'

describe('assistantToolQueries', () => {
  it('resolves query aliases and clamps limits', () => {
    expect(resolveAssistantToolQuery({q: 'ada'})).toBe('ada')
    expect(resolveAssistantToolQuery({query: 'x'})).toBe('x')
    expect(clampAssistantToolLimit(100, {max: 20, fallback: 10})).toBe(20)
    expect(clampAssistantToolLimit(undefined, {max: 20, fallback: 10})).toBe(10)
    expect(clampAssistantToolLimit(0, {max: 20, fallback: 10})).toBe(10)
  })

  it('filters media and tag rows', () => {
    const media = [
      {id: 1, name: 'Ada', path: '/a.mp4'},
      {id: 2, name: 'Bob', path: '/b.mp4'},
    ]
    expect(filterMediaRowsByQuery(media, 'ada', 10)).toEqual([media[0]])
    expect(filterMediaRowsByQuery(media, '', 10)).toEqual([])

    const tags = [
      {id: 1, name: 'Ada'},
      {id: 2, name: 'Bob'},
    ]
    expect(filterTagRowsByQuery(tags, 'bo', 10)).toEqual([tags[1]])
    expect(filterTagRowsByQuery(tags, '', 1)).toEqual([tags[0]])
  })
})
