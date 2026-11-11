import {describe, expect, it} from 'vitest'
import {compareSimilarity, defaultDuplicatePolicy, groupSimilarityItems, parseDuplicatePolicy, pickSimilarityOriginal, type SimilarityItem} from './duplicateSimilarity'
const item = (id: number, patch: Partial<SimilarityItem> = {}): SimilarityItem => ({id, path: `/${id}.mp4`, filesize: 200000, ...patch})
describe('configurable file similarity', () => {
  it('does not inflate scores when visuals are missing', () => {
    const a = item(1, {oshash: '0123456789abcdef'}), b = item(2, {oshash: a.oshash})
    expect(compareSimilarity(a, b, defaultDuplicatePolicy())).toMatchObject({score: 100, eligible: true, signals: {visual: null}})
  })
  it('adds visual matches only when enabled and retains fingerprint matches', () => {
    const original = item(1, {oshash: 'original', visualHash: '0000000000000000'})
    const similar = item(2, {oshash: 'other', visualHash: '0000000000000001'})
    const copy = item(3, {oshash: 'original'})
    const policy = defaultDuplicatePolicy()

    expect(groupSimilarityItems([original, similar], policy)).toEqual([])
    const enabled = parseDuplicatePolicy(JSON.stringify({...policy, searchSimilarVideos: true}))
    expect(groupSimilarityItems([original, similar, copy], enabled)[0].itemIds).toEqual([1, 2, 3])
    expect(compareSimilarity(original, similar, enabled, true)).toMatchObject({
      eligible: true, contributions: {oshash: 0, visual: 98.4375},
    })
    expect(groupSimilarityItems([original, similar], {...enabled, searchSimilarVideos: false})).toEqual([])
  })
  it('does not merge by filename and size alone even at a low threshold', () => {
    const policy = defaultDuplicatePolicy(); policy.weights = {path: 0, name: 80, size: 20, oshash: 0, visual: 0}; policy.threshold = 1
    expect(compareSimilarity(item(1, {basename: 'same.mp4'}), item(2, {basename: 'same.mkv'}), policy)).toMatchObject({score: 100, eligible: false})
  })
  it('treats oshash as an exact match and enforces required evidence', () => {
    const policy = defaultDuplicatePolicy(); policy.required = ['visual']; policy.threshold = 10
    expect(compareSimilarity(item(1, {oshash: '0000000000000000'}), item(2, {oshash: '0000000000000001'}), policy)).toMatchObject({eligible: false, signals: {oshash: 0}})
    expect(compareSimilarity(item(1, {oshash: '0000000000000000'}), item(2, {oshash: '0000000000000000'}), policy).eligible).toBe(false)
  })
  it('compares against the original without chaining A-B-C', () => {
    const policy = defaultDuplicatePolicy(); policy.weights = {path: 0, name: 0, size: 0, oshash: 0, visual: 100}; policy.threshold = 98; policy.visualMinimum = 98
    const rows = [item(1, {visualHash: '0000000000000000'}), item(2, {visualHash: '0000000000000001'}), item(3, {visualHash: '0000000000000003'})]
    expect(groupSimilarityItems(rows, policy).map(group => group.itemIds)).toEqual([[1, 2]])
  })
  it('uses frame evidence only with the configured number of matching frames', () => {
    const policy = defaultDuplicatePolicy(); policy.weights = {path: 0, name: 0, size: 0, oshash: 0, visual: 100}; policy.threshold = 60; policy.visualMinimum = 90
    const a = item(1, {visualHashTiles: Array(9).fill('0000000000000000').join(':')})
    const b = item(2, {visualHashTiles: [...Array(6).fill('0000000000000000'), ...Array(3).fill('ffffffffffffffff')].join(':')})
    expect(compareSimilarity(a, b, policy)).toMatchObject({matchingFrames: 6, signals: {visual: 100 * 6 / 9}})
    policy.minimumFrames = 7
    expect(compareSimilarity(a, b, policy).signals.visual).toBeNull()
  })
  it('selects the configured original and handles invalid settings', () => {
    const rows = [item(1, {filesize: 10, width: 1920, height: 1080, createdAt: '2020'}), item(2, {filesize: 20, width: 640, height: 480, createdAt: '2025'})]
    expect(pickSimilarityOriginal(rows, 'quality')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'largest')).toBe(2)
    expect(pickSimilarityOriginal(rows, 'smallest')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'oldest')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'newest')).toBe(2)
    expect(parseDuplicatePolicy('bad')).toEqual(defaultDuplicatePolicy())
    expect(parseDuplicatePolicy({threshold: -1, weights: {name: 999}})).toMatchObject({threshold: 1, weights: {name: 100}})
  })
})
