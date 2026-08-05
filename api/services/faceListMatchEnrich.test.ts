import {describe, expect, it} from 'vitest'
import {
  buildListedPreparedFace,
  parseStoredFaceEmbedding,
  reRankListedClusterCandidates,
} from './faceListMatchEnrich'

const unit = (values: number[]) => {
  const out = new Float32Array(values)
  let sum = 0
  for (const v of out) sum += v * v
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

describe('parseStoredFaceEmbedding', () => {
  it('parses json arrays and returns null for empty/invalid', () => {
    const embedding = parseStoredFaceEmbedding(JSON.stringify([1, 0, 0]))
    expect(embedding).toBeInstanceOf(Float32Array)
    expect(embedding![0]).toBeGreaterThan(0.9)
    expect(parseStoredFaceEmbedding(null)).toBeNull()
    expect(parseStoredFaceEmbedding('')).toBeNull()
  })
})

describe('buildListedPreparedFace', () => {
  it('fills tag metadata only when assigned', () => {
    const face = {
      id: 1,
      mediaId: 2,
      timestamp: '0:01',
      score: 0.9,
      x: 1,
      y: 2,
      width: 3,
      height: 4,
      cropPath: 'a.jpg',
      matchScore: 0.8,
      matchStatus: 'matched',
      createdAt: 't',
    }

    expect(buildListedPreparedFace({
      face,
      assignedTagId: 9,
      tag: {name: 'Ada', metaId: 5},
      candidates: [],
      embedding: null,
    })).toMatchObject({
      id: 1,
      tagId: 9,
      tagName: 'Ada',
      tagMetaId: 5,
    })

    expect(buildListedPreparedFace({
      face,
      assignedTagId: null,
      tag: {name: 'Ada', metaId: 5},
      candidates: [{tagId: 9, score: 0.7, tagName: 'Ada', tagMetaId: 5}],
      embedding: null,
    })).toMatchObject({
      tagId: null,
      tagName: null,
      tagMetaId: null,
      candidates: [{tagId: 9}],
    })
  })
})

describe('reRankListedClusterCandidates', () => {
  it('shares cluster ranking across members and skips empty enrollments', () => {
    const clustered = [
      {
        clusterId: 1,
        embedding: unit([1, 0]),
        candidates: [] as Array<{tagId: number; score: number; tagName: string | null; tagMetaId: number | null}>,
      },
      {
        clusterId: 1,
        embedding: unit([0.99, 0.01]),
        candidates: [] as Array<{tagId: number; score: number; tagName: string | null; tagMetaId: number | null}>,
      },
    ]

    reRankListedClusterCandidates(clustered, [], 5, () => null)
    expect(clustered[0].candidates).toEqual([])

    reRankListedClusterCandidates(
      clustered,
      [
        {tagId: 10, embedding: unit([1, 0])},
        {tagId: 20, embedding: unit([0, 1])},
      ],
      5,
      (tagId) => (tagId === 10 ? {name: 'A', metaId: 1} : {name: 'B', metaId: 1}),
    )

    expect(clustered[0].candidates[0]?.tagId).toBe(10)
    expect(clustered[1].candidates).toEqual(clustered[0].candidates)
    expect(clustered[0].candidates[0]?.tagName).toBe('A')
  })
})
