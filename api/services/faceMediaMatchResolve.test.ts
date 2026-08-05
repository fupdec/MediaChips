import {describe, expect, it} from 'vitest'
import {
  buildClusterQueryEmbeddings,
  buildReadyMatchPreparedFace,
  buildSkippedMatchPreparedFace,
  prepareMatchFacesForMedia,
  resolveClusterMatchesForMedia,
  resolveMatchMediaFacesGate,
  type ClusteredMatchFace,
} from './faceMediaMatchResolve'

const unit = (values: number[]) => {
  const out = new Float32Array(values)
  let sum = 0
  for (const v of out) sum += v * v
  const norm = Math.sqrt(sum) || 1
  for (let i = 0; i < out.length; i++) out[i] /= norm
  return out
}

describe('buildSkippedMatchPreparedFace', () => {
  const base = {id: 7, score: 0.8, timestamp: '0:01'}

  it('keeps assigned tag/score when skipping assigned faces', () => {
    expect(buildSkippedMatchPreparedFace(base, {tagId: 3, matchScore: 0.91})).toEqual({
      id: 7,
      tagId: 3,
      matchScore: 0.91,
      score: 0.8,
      timestamp: '0:01',
      skip: true,
      embedding: null,
    })
  })

  it('clears tag for unmatchable / null-embed / error skips', () => {
    expect(buildSkippedMatchPreparedFace(base)).toEqual({
      id: 7,
      tagId: null,
      matchScore: null,
      score: 0.8,
      timestamp: '0:01',
      skip: true,
      embedding: null,
    })
  })
})

describe('buildReadyMatchPreparedFace', () => {
  it('stores candidates and embedding without a tag', () => {
    const embedding = unit([1, 0])
    const candidates = [{tagId: 2, score: 0.9}]
    expect(buildReadyMatchPreparedFace({id: 1, score: 0.5, timestamp: null}, candidates, embedding)).toEqual({
      id: 1,
      tagId: null,
      matchScore: null,
      score: 0.5,
      timestamp: null,
      skip: false,
      candidates,
      embedding,
    })
  })
})

describe('buildClusterQueryEmbeddings', () => {
  it('appends centroid after member embeddings', () => {
    const a = unit([1, 0])
    const b = unit([0, 1])
    const query = buildClusterQueryEmbeddings([a, b])
    expect(query).toHaveLength(3)
    expect(query[0]).toBe(a)
    expect(query[1]).toBe(b)
    expect(query[2]).toBeTruthy()
  })

  it('handles a single member', () => {
    const a = unit([1, 0])
    const query = buildClusterQueryEmbeddings([a])
    expect(query).toHaveLength(2)
    expect(query[0]).toBe(a)
    expect(query[1]).toEqual(a)
  })

  it('returns null centroid when empty', () => {
    expect(buildClusterQueryEmbeddings([])).toEqual([null])
  })
})

describe('resolveClusterMatchesForMedia', () => {
  const makeFace = (partial: Partial<ClusteredMatchFace> & Pick<ClusteredMatchFace, 'id' | 'clusterId'>): ClusteredMatchFace => ({
    tagId: null,
    matchScore: null,
    score: 0.9,
    timestamp: null,
    skip: false,
    embedding: unit([1, 0]),
    ...partial,
  })

  const enrollments = [
    {tagId: 10, embedding: unit([1, 0])},
    {tagId: 20, embedding: unit([0, 1])},
  ]

  it('ignores skipped faces and handles each cluster once', () => {
    const result = resolveClusterMatchesForMedia({
      clustered: [
        makeFace({id: 1, clusterId: 0, skip: true, embedding: null}),
        makeFace({id: 2, clusterId: 1, embedding: unit([1, 0])}),
        makeFace({id: 3, clusterId: 1, embedding: unit([0.99, 0.01])}),
      ],
      enrollments,
      candidateLimit: 5,
      minConfidence: 0.5,
      mode: 'auto',
      mediaId: 100,
      metaId: 5,
    })

    expect(result.updates.map((item) => item.faceId).sort()).toEqual([2, 3])
    expect(result.updates.every((item) => item.update.tagId === 10)).toBe(true)
    expect(result.matched).toBe(2)
    expect(result.tagsToApply).toEqual([
      {mediaId: 100, tagId: 10, metaId: 5},
      {mediaId: 100, tagId: 10, metaId: 5},
    ])
  })

  it('suggest mode updates without tag applies', () => {
    const result = resolveClusterMatchesForMedia({
      clustered: [makeFace({id: 1, clusterId: 0, embedding: unit([1, 0])})],
      enrollments,
      candidateLimit: 5,
      minConfidence: 0.5,
      mode: 'suggest',
      mediaId: 1,
      metaId: 2,
    })

    expect(result.matched).toBe(1)
    expect(result.updates[0].update.matchStatus).toBe('suggested')
    expect(result.tagsToApply).toEqual([])
  })

  it('counts ambiguous picks as matched without auto tags', () => {
    const result = resolveClusterMatchesForMedia({
      clustered: [makeFace({id: 1, clusterId: 0, embedding: unit([0.7, 0.7])})],
      enrollments: [
        {tagId: 10, embedding: unit([0.71, 0.7])},
        {tagId: 20, embedding: unit([0.7, 0.71])},
      ],
      candidateLimit: 5,
      minConfidence: 0.5,
      mode: 'auto',
      mediaId: 1,
      metaId: 2,
    })

    expect(result.matched).toBe(1)
    expect(result.updates[0].update.matchStatus).toBe('suggested')
    expect(result.tagsToApply).toEqual([])
  })

  it('rejects weak picks as unmatched with no tags', () => {
    const result = resolveClusterMatchesForMedia({
      clustered: [makeFace({id: 1, clusterId: 0, embedding: unit([1, 0])})],
      enrollments: [{tagId: 10, embedding: unit([0, 1])}],
      candidateLimit: 5,
      minConfidence: 0.95,
      mode: 'auto',
      mediaId: 1,
      metaId: 2,
    })

    expect(result.matched).toBe(0)
    expect(result.updates[0].update).toMatchObject({
      tagId: null,
      matchStatus: 'unmatched',
    })
    expect(result.tagsToApply).toEqual([])
  })
})

describe('prepareMatchFacesForMedia', () => {
  it('skips assigned and unmatchable faces without loading embeddings', async () => {
    let loads = 0
    const result = await prepareMatchFacesForMedia({
      faces: [
        {id: 1, score: 0.9, timestamp: null, tagId: 3, matchScore: 0.8},
        {id: 2, score: 0.1, timestamp: null, tagId: null, matchScore: null, width: 10, height: 10},
      ],
      enrollments: [{tagId: 3, embedding: unit([1, 0])}],
      candidateLimit: 5,
      loadEmbedding: async () => {
        loads += 1
        return unit([1, 0])
      },
      isMatchable: (face) => Number(face.score) >= 0.5,
    })

    expect(loads).toBe(0)
    expect(result.skipped).toBe(2)
    expect(result.prepared.map((face) => face.skip)).toEqual([true, true])
    expect(result.prepared[0].tagId).toBe(3)
  })

  it('loads embeddings for matchable faces and marks null embeds as skipped', async () => {
    const result = await prepareMatchFacesForMedia({
      faces: [
        {id: 1, score: 0.9, timestamp: '0:01', tagId: null},
        {id: 2, score: 0.9, timestamp: null, tagId: null},
      ],
      force: true,
      enrollments: [{tagId: 9, embedding: unit([1, 0])}],
      candidateLimit: 5,
      loadEmbedding: async (face) => (Number(face.id) === 1 ? unit([1, 0]) : null),
      isMatchable: () => true,
    })

    expect(result.skipped).toBe(1)
    expect(result.prepared[0]).toMatchObject({id: 1, skip: false, candidates: [{tagId: 9}]})
    expect(result.prepared[1].skip).toBe(true)
  })
})

describe('resolveMatchMediaFacesGate', () => {
  it('blocks missing performer meta, empty faces, and empty enrollments', () => {
    expect(resolveMatchMediaFacesGate({
      metaId: null,
      facesCount: 0,
      enrollmentsCount: 0,
    })).toEqual({
      ok: false,
      result: {
        matched: 0,
        applied: 0,
        skipped: 0,
        faces: 0,
        error: 'Performer category is not configured.',
      },
    })

    expect(resolveMatchMediaFacesGate({
      metaId: 1,
      facesCount: 0,
      enrollmentsCount: 0,
    })).toEqual({ok: false, result: {matched: 0, applied: 0, skipped: 0, faces: 0}})

    expect(resolveMatchMediaFacesGate({
      metaId: 1,
      facesCount: 4,
      enrollmentsCount: 0,
    })).toEqual({
      ok: false,
      result: {
        matched: 0,
        applied: 0,
        skipped: 4,
        faces: 4,
        error: 'No enrolled performer faces.',
      },
    })

    expect(resolveMatchMediaFacesGate({
      metaId: 1,
      facesCount: 4,
      enrollmentsCount: 2,
    })).toEqual({ok: true})
  })
})
