import {describe, expect, it} from 'vitest'
import {
  groupFacesByClusterId,
  mapEnrollmentCandidateWithTag,
  pickPrimaryTagId,
  stripEmbeddingsFromFaces,
} from './faceListPresentation'

describe('faceListPresentation', () => {
  it('maps candidates with optional tag metadata', () => {
    expect(mapEnrollmentCandidateWithTag(
      {tagId: 4, score: 0.8},
      {name: 'Ada', metaId: 2},
    )).toEqual({
      tagId: 4,
      score: 0.8,
      tagName: 'Ada',
      tagMetaId: 2,
    })

    expect(mapEnrollmentCandidateWithTag({tagId: 1, score: 0.1}, null)).toEqual({
      tagId: 1,
      score: 0.1,
      tagName: null,
      tagMetaId: null,
    })
  })

  it('prefers assigned tag over top candidate', () => {
    expect(pickPrimaryTagId(9, [{tagId: 1}])).toBe(9)
    expect(pickPrimaryTagId(null, [{tagId: 1}])).toBe(1)
    expect(pickPrimaryTagId(null, [])).toBeNull()
  })

  it('strips embeddings from listed faces', () => {
    expect(stripEmbeddingsFromFaces([
      {id: 1, embedding: new Float32Array([1]), score: 0.5},
    ])).toEqual([{id: 1, score: 0.5}])
  })

  it('groups faces by cluster id', () => {
    const groups = groupFacesByClusterId([
      {clusterId: 1, id: 'a'},
      {clusterId: 2, id: 'b'},
      {clusterId: 1, id: 'c'},
    ])
    expect([...groups.keys()].sort()).toEqual([1, 2])
    expect(groups.get(1)?.map((f) => f.id)).toEqual(['a', 'c'])
  })
})
