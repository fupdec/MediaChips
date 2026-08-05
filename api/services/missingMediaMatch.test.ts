import {describe, expect, it} from 'vitest'
import {buildMissingIndexes, pickWeakCandidate} from './missingMediaMatch'

describe('missingMediaMatch', () => {
  it('indexes by oshash and size-without-hash', () => {
    const indexes = buildMissingIndexes([
      {id: 1, filesize: 10, oshash: 'abc', path: '/a'},
      {id: 2, filesize: 10, path: '/b'},
      {id: 3, filesize: 20, path: '/c'},
      {id: 4, filesize: 10, oshash: 'abc', path: '/d'},
    ])
    expect(indexes.targetSizes).toEqual(new Set([10, 20]))
    expect(indexes.byOshash.get('abc')?.map((r) => r.id)).toEqual([1, 4])
    expect(indexes.bySizeNoHash.get(10)?.map((r) => r.id)).toEqual([2])
    expect(indexes.bySizeNoHash.get(20)?.map((r) => r.id)).toEqual([3])
  })

  it('picks unique basename among weak candidates', () => {
    expect(pickWeakCandidate([], '/x.mp4')).toBeNull()
    expect(pickWeakCandidate([{id: 1, path: '/a.mp4'}], '/x.mp4')).toEqual({id: 1, path: '/a.mp4'})
    expect(pickWeakCandidate([
      {id: 1, path: '/old/clip.mp4'},
      {id: 2, path: '/other.mp4'},
    ], '/new/clip.mp4')).toEqual({id: 1, path: '/old/clip.mp4'})
    expect(pickWeakCandidate([
      {id: 1, path: '/a.mp4'},
      {id: 2, path: '/b.mp4'},
    ], '/c.mp4')).toBeNull()
  })
})
