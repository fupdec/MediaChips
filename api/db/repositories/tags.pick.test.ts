import { describe, expect, it } from 'vitest'
import { pickTagFields } from './tags'

describe('pickTagFields', () => {
  it('keeps only mutable tag columns', () => {
    expect(pickTagFields({
      name: 'Actor',
      color: '#F80000',
      '42': [1, 2, 3],
      silent: true,
    })).toEqual({
      name: 'Actor',
      color: '#F80000',
    })
  })

  it('coerces nullable rating and string views', () => {
    expect(pickTagFields({
      name: 'Actor',
      rating: null,
      views: '12',
      favorite: 1,
    })).toEqual({
      name: 'Actor',
      rating: 0,
      views: 12,
      favorite: true,
    })
  })
})
