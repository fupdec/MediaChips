import {describe, expect, it} from 'vitest'
import {
  assembleListedFacesForMedia,
  buildListedPreparedFacesFromRows,
} from './faceListBuild'

const unit = (values: number[]) => {
  const out = new Float32Array(values)
  let sum = 0
  for (const v of out) sum += v * v
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

describe('buildListedPreparedFacesFromRows', () => {
  it('maps rows with assigned tags and optional candidates', () => {
    const embedding = unit([1, 0])
    const prepared = buildListedPreparedFacesFromRows({
      faceRows: [{
        id: 1,
        mediaId: 2,
        timestamp: null,
        score: 0.9,
        x: 0,
        y: 0,
        width: 50,
        height: 50,
        cropPath: null,
        tagId: 9,
        matchScore: 0.8,
        matchStatus: 'matched',
        createdAt: null,
        embedding: JSON.stringify(Array.from(embedding)),
      }],
      enrollmentRefs: [{tagId: 9, embedding}],
      candidateLimit: 5,
      resolveTag: (tagId) => ({name: `T${tagId}`, metaId: 1}),
      isMatchable: () => true,
    })

    expect(prepared).toHaveLength(1)
    expect(prepared[0]).toMatchObject({
      id: 1,
      tagId: 9,
      tagName: 'T9',
      candidates: [{tagId: 9}],
    })
    expect(prepared[0].embedding).toBeTruthy()
  })

  it('skips candidate ranking when not matchable', () => {
    const prepared = buildListedPreparedFacesFromRows({
      faceRows: [{
        id: 1,
        mediaId: 2,
        timestamp: null,
        score: 0.2,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        cropPath: null,
        tagId: null,
        matchScore: null,
        matchStatus: null,
        createdAt: null,
        embedding: JSON.stringify([1, 0]),
      }],
      enrollmentRefs: [{tagId: 3, embedding: unit([1, 0])}],
      candidateLimit: 5,
      resolveTag: () => ({name: 'X', metaId: 1}),
      isMatchable: () => false,
    })
    expect(prepared[0].candidates).toEqual([])
  })
})

describe('assembleListedFacesForMedia', () => {
  it('clusters and strips embeddings from the response', () => {
    const embedding = unit([1, 0])
    const prepared = buildListedPreparedFacesFromRows({
      faceRows: [{
        id: 1,
        mediaId: 7,
        timestamp: '0:01',
        score: 0.9,
        x: 0,
        y: 0,
        width: 40,
        height: 40,
        cropPath: null,
        tagId: null,
        matchScore: null,
        matchStatus: null,
        createdAt: null,
        embedding: JSON.stringify(Array.from(embedding)),
      }],
      enrollmentRefs: [{tagId: 4, embedding}],
      candidateLimit: 5,
      resolveTag: () => ({name: 'A', metaId: 1}),
      isMatchable: () => true,
    })

    const result = assembleListedFacesForMedia({
      mediaId: 7,
      prepared,
      enrollmentRefs: [{tagId: 4, embedding}],
      candidateLimit: 5,
      resolveTag: () => ({name: 'A', metaId: 1}),
    })

    expect(result.mediaId).toBe(7)
    expect(result.faces).toHaveLength(1)
    expect(result.faces[0]).not.toHaveProperty('embedding')
    expect(result.faces[0]).toHaveProperty('clusterId')
  })
})
