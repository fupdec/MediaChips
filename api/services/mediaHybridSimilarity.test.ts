import {beforeEach, describe, expect, it, vi} from 'vitest'

vi.mock('./mediaClipEmbeddings', () => ({
  CLIP_EMBEDDING_INDEX_KEY: 'clip-test',
  findSimilarByClip: vi.fn(),
}))

vi.mock('./mediaTagSimilarity', () => ({
  findSimilarByTags: vi.fn(),
}))

vi.mock('./mediaItemsLoader', () => ({
  loadMediaBasicsByIds: vi.fn(),
}))

vi.mock('../db/utils/rawQuery', () => ({
  queryGet: vi.fn(),
}))

import {findSimilarByClip} from './mediaClipEmbeddings'
import {findSimilarByTags} from './mediaTagSimilarity'
import {loadMediaBasicsByIds} from './mediaItemsLoader'
import {queryGet} from '../db/utils/rawQuery'
import {findSimilarHybrid} from './mediaHybridSimilarity'

describe('findSimilarHybrid', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('merges clip + tags and collapses filename series', async () => {
    vi.mocked(queryGet).mockReturnValue({mediaId: 1})
    vi.mocked(findSimilarByClip).mockResolvedValue({
      seedId: 1,
      hasEmbedding: true,
      seedTileCount: 1,
      ids: [1, 2, 3, 4],
      hits: [
        {id: 2, score: 0.9, tileIndex: null},
        {id: 3, score: 0.8, tileIndex: null},
        {id: 4, score: 0.7, tileIndex: null},
      ],
    })
    vi.mocked(findSimilarByTags).mockReturnValue({
      seedId: 1,
      hasTags: true,
      seedTagCount: 2,
      hits: [
        {id: 4, score: 0.5, sharedCount: 2, tagCount: 3},
        {id: 5, score: 0.4, sharedCount: 1, tagCount: 2},
      ],
      ids: [4, 5],
    })
    vi.mocked(loadMediaBasicsByIds).mockResolvedValue([
      {id: 1, basename: 'seed.mp4'},
      {id: 2, basename: '14761_001.mp4'},
      {id: 3, basename: '14761_002.mp4'},
      {id: 4, basename: 'other.mp4'},
      {id: 5, basename: 'third.mp4'},
    ] as never)

    const result = await findSimilarHybrid({} as never, 1, {limit: 4, encodeSeedIfMissing: false})

    expect(result.hasSignals).toBe(true)
    expect(result.ids[0]).toBe(1)
    // 14761_001 and 14761_002 collapse to one series key
    expect(result.ids.filter((id) => id === 2 || id === 3)).toHaveLength(1)
    expect(result.ids).toContain(4)
    expect(result.ids).toContain(5)
  })

  it('skips on-demand CLIP when encodeSeedIfMissing is false and no row', async () => {
    vi.mocked(queryGet).mockReturnValue(undefined)
    vi.mocked(findSimilarByTags).mockReturnValue({
      seedId: 9,
      hasTags: true,
      seedTagCount: 1,
      hits: [{id: 8, score: 1, sharedCount: 1, tagCount: 1}],
      ids: [8],
    })
    vi.mocked(loadMediaBasicsByIds).mockResolvedValue([
      {id: 9, basename: 'a.mp4'},
      {id: 8, basename: 'b.mp4'},
    ] as never)

    const result = await findSimilarHybrid({} as never, 9, {
      limit: 6,
      encodeSeedIfMissing: false,
    })

    expect(findSimilarByClip).not.toHaveBeenCalled()
    expect(result.hasEmbedding).toBe(false)
    expect(result.hasTags).toBe(true)
    expect(result.ids).toEqual([9, 8])
  })

  it('excludes extra ids and trims weak fused scores', async () => {
    vi.mocked(queryGet).mockReturnValue({mediaId: 1})
    vi.mocked(findSimilarByClip).mockResolvedValue({
      seedId: 1,
      hasEmbedding: true,
      seedTileCount: 1,
      ids: [1, 2, 3, 4, 5],
      hits: [
        {id: 2, score: 0.95, tileIndex: null},
        {id: 3, score: 0.9, tileIndex: null},
        {id: 4, score: 0.2, tileIndex: null},
        {id: 5, score: 0.15, tileIndex: null},
      ],
    })
    vi.mocked(findSimilarByTags).mockReturnValue({
      seedId: 1,
      hasTags: false,
      seedTagCount: 0,
      hits: [],
      ids: [],
    })
    vi.mocked(loadMediaBasicsByIds).mockResolvedValue([
      {id: 1, basename: 'seed.mp4'},
      {id: 2, basename: 'a.mp4'},
      {id: 3, basename: 'b.mp4'},
      {id: 4, basename: 'c.mp4'},
      {id: 5, basename: 'd.mp4'},
    ] as never)

    const result = await findSimilarHybrid({} as never, 1, {
      limit: 6,
      encodeSeedIfMissing: false,
      excludeIds: [3],
      // RRF decays slowly — 0.99 keeps only the top fused rank.
      minScoreRatio: 0.99,
    })

    expect(result.ids).not.toContain(3)
    expect(result.hits.every((hit) => hit.id !== 3)).toBe(true)
    expect(result.ids).toEqual([1, 2])
  })
})
