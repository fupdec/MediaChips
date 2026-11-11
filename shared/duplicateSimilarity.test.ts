import {describe, expect, it} from 'vitest'
import {compareSimilarity, defaultDuplicatePolicy, fingerprintDuplicatePolicy, recommendedDuplicatePolicy, groupSimilarityItems, parseDuplicatePolicy, pickSimilarityOriginal, type SimilarityItem} from './duplicateSimilarity'
const item = (id: number, patch: Partial<SimilarityItem> = {}): SimilarityItem => ({id, path: `/${id}.mp4`, filesize: 200000, ...patch})
describe('configurable file similarity', () => {
  it('does not inflate scores when visuals are missing', () => {
    const a = item(1, {oshash: '0123456789abcdef'}), b = item(2, {oshash: a.oshash})
    expect(compareSimilarity(a, b, fingerprintDuplicatePolicy())).toMatchObject({score: 100, eligible: true, signals: {visual: null}})
  })
  it('adds visual matches only when enabled and retains fingerprint matches', () => {
    const original = item(1, {oshash: 'original', visualHash: '0000000000000000'})
    const similar = item(2, {oshash: 'other', visualHash: '0000000000000001'})
    const copy = item(3, {oshash: 'original'})
    const policy = fingerprintDuplicatePolicy()

    expect(groupSimilarityItems([original, similar], policy)).toEqual([])
    const enabled = parseDuplicatePolicy(JSON.stringify({...policy, searchSimilarVideos: true}))
    expect(groupSimilarityItems([original, similar, copy], enabled)[0].itemIds).toEqual([1, 2, 3])
    expect(compareSimilarity(original, similar, enabled, true)).toMatchObject({
      eligible: true, contributions: {oshash: 0, visual: 98.4375},
    })
    expect(groupSimilarityItems([original, similar], {...enabled, searchSimilarVideos: false})).toEqual([])
  })
  it('does not merge by filename and size alone even at a low threshold', () => {
    const policy = fingerprintDuplicatePolicy(); policy.weights = {path: 0, name: 80, size: 20, oshash: 0, visual: 0}; policy.threshold = 1
    expect(compareSimilarity(item(1, {basename: 'same.mp4'}), item(2, {basename: 'same.mkv'}), policy)).toMatchObject({score: 100, eligible: false})
  })
  it('treats oshash as an exact match and enforces required evidence', () => {
    const policy = fingerprintDuplicatePolicy(); policy.required = ['visual']; policy.threshold = 10
    expect(compareSimilarity(item(1, {oshash: '0000000000000000'}), item(2, {oshash: '0000000000000001'}), policy)).toMatchObject({eligible: false, signals: {oshash: 0}})
    expect(compareSimilarity(item(1, {oshash: '0000000000000000'}), item(2, {oshash: '0000000000000000'}), policy).eligible).toBe(false)
  })
  it('compares against the original without chaining A-B-C', () => {
    const policy = fingerprintDuplicatePolicy(); policy.weights = {path: 0, name: 0, size: 0, oshash: 0, visual: 100}; policy.threshold = 98; policy.visualMinimum = 98
    const rows = [item(1, {visualHash: '0000000000000000'}), item(2, {visualHash: '0000000000000001'}), item(3, {visualHash: '0000000000000003'})]
    expect(groupSimilarityItems(rows, policy).map(group => group.itemIds)).toEqual([[1, 2]])
  })
  it('uses frame evidence only with the configured number of matching frames', () => {
    const policy = fingerprintDuplicatePolicy(); policy.weights = {path: 0, name: 0, size: 0, oshash: 0, visual: 100}; policy.threshold = 60; policy.visualMinimum = 90
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
  it('recommended preset accepts real copies and re-encodes, rejects weak evidence', () => {
    const policy = recommendedDuplicatePolicy()
    const frame = '0000000000000000'
    const original: SimilarityItem = {id: 1, path: '/original/Video.mp4', filesize: 1000, oshash: 'original', visualHash: frame, visualHashTiles: Array(9).fill(frame).join(':')}
    const cases: [Partial<SimilarityItem>, boolean][] = [
      [{...original, path: '/copies/Renamed.mp4'}, true],
      [{...original, path: '/other-drive/Video.mp4'}, true],
      [{path: '/copies/Renamed.mp4', filesize: 1000, oshash: 'original'}, true], // no visual index
      [{path: '/encoded/Video.mp4', filesize: 700, oshash: 'encoded', visualHashTiles: [...Array(8).fill('000000000000000f'), '000000000000ffff'].join(':')}, true],
      [{...original}, true],
      [{path: original.path, filesize: 1400, oshash: 'replacement', visualHash: 'ffffffffffffffff'}, false],
      [{path: '/other/Video.mp4', filesize: 1000, oshash: 'other'}, false],
      [{path: '/offline/Video.mp4'}, false],
      [{path: '/other/Unrelated.mp4', filesize: 2000, oshash: 'unrelated', visualHash: 'ffffffffffffffff'}, false],
    ]
    expect(defaultDuplicatePolicy()).toEqual(policy)
    expect(compareSimilarity(original, {...original, id: 99, path: '/copies/Renamed.mp4'}, policy).score).toBe(100)
    cases.forEach(([patch, eligible], i) => expect(compareSimilarity(original, {...patch, id: i + 2} as SimilarityItem, policy).eligible, String(i)).toBe(eligible))
  })
})
