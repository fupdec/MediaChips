import {describe, expect, it} from 'vitest'
import {
  nextBlindPersonName,
  parseUsableFaceEmbedding,
  selectBlindClustersForAutoTag,
} from './faceBlindAutoTag'
import {embeddingToJson, l2Normalize} from './faceMatchScoring'

describe('faceBlindAutoTag', () => {
  it('parses usable embeddings and rejects empty vectors', () => {
    const vector = l2Normalize(Float32Array.from({length: 512}, (_, i) => (i === 0 ? 1 : 0)))
    expect(parseUsableFaceEmbedding(embeddingToJson(vector))).not.toBeNull()
    expect(parseUsableFaceEmbedding('[]')).toBeNull()
    expect(parseUsableFaceEmbedding(null)).toBeNull()
  })

  it('increments Person N from existing names', () => {
    expect(nextBlindPersonName([])).toBe('Person 1')
    expect(nextBlindPersonName(['Alice', 'Person 2', 'person 7'])).toBe('Person 8')
  })

  it('selects large unlabeled clusters only', () => {
    const clustered = [
      {
        id: 1,
        tagId: null,
        score: 0.9,
        clusterId: 10,
        clusterFaceIds: [1, 2, 3],
        clusterSize: 3,
        clusterRepresentative: true,
      },
      {
        id: 2,
        tagId: null,
        score: 0.8,
        clusterId: 10,
        clusterFaceIds: [1, 2, 3],
        clusterSize: 3,
        clusterRepresentative: false,
      },
      {
        id: 3,
        tagId: null,
        score: 0.7,
        clusterId: 10,
        clusterFaceIds: [1, 2, 3],
        clusterSize: 3,
        clusterRepresentative: false,
      },
      {
        id: 4,
        tagId: 99,
        score: 0.9,
        clusterId: 20,
        clusterFaceIds: [4, 5],
        clusterSize: 2,
        clusterRepresentative: true,
      },
      {
        id: 5,
        tagId: 99,
        score: 0.8,
        clusterId: 20,
        clusterFaceIds: [4, 5],
        clusterSize: 2,
        clusterRepresentative: false,
      },
      {
        id: 6,
        tagId: null,
        score: 0.9,
        clusterId: 30,
        clusterFaceIds: [6],
        clusterSize: 1,
        clusterRepresentative: true,
      },
    ]

    expect(selectBlindClustersForAutoTag(clustered, {minClusterSize: 2, maxClusters: 5})).toEqual([
      {
        clusterId: 10,
        faceIds: [1, 2, 3],
        representativeFaceId: 1,
        size: 3,
      },
    ])
  })
})
