import {describe, expect, it} from 'vitest'
import {compareSimilarity, defaultDuplicatePolicy, groupSimilarityItems, parseDuplicatePolicy, pickSimilarityOriginal,
  DEFAULT_SIZE_CANDIDATE_MIN_BYTES, type DuplicatePolicy, type SimilarityItem} from './duplicateSimilarity'
const GB = 1024 ** 3
const item = (id: number, patch: Partial<SimilarityItem> = {}): SimilarityItem => ({id, path: `/${id}.mp4`, filesize: 200000, ...patch})
const policy = (patch: Partial<DuplicatePolicy> = {}): DuplicatePolicy => ({...defaultDuplicatePolicy(), ...patch})
const frames = (tiles: string[]) => tiles.join(':')
const zero = '0000000000000000', ones = 'ffffffffffffffff'

describe('duplicate evidence levels', () => {
  it('treats the same size and fingerprint as an exact copy, without visuals', () => {
    const a = item(1, {oshash: '0123456789abcdef'}), b = item(2, {oshash: a.oshash, path: '/renamed/other.mkv'})
    expect(compareSimilarity(a, b, policy())).toMatchObject({level: 'exact', score: 100, eligible: true, signals: {visual: null, name: 0}})
  })
  it('never merges by filename, path or size alone', () => {
    const a = item(1, {basename: 'same.mp4', oshash: 'aaaa'}), b = item(2, {basename: 'same.mkv', oshash: 'bbbb'})
    expect(compareSimilarity(a, b, policy())).toMatchObject({level: 'none', eligible: false, signals: {name: 100, size: 100, oshash: 0}})
    expect(compareSimilarity(item(1, {oshash: 'old'}), item(2, {path: '/1.mp4', filesize: 300000, oshash: 'new'}), policy()))
      .toMatchObject({level: 'none', signals: {path: 100}})
  })
  it('a fingerprint match with a different size is not a copy', () => {
    expect(compareSimilarity(item(1, {oshash: 'x'}), item(2, {oshash: 'x', filesize: 1}), policy()).level).toBe('none')
  })
  it('marks large same-size pairs without a fingerprint as pending, never eligible', () => {
    const big = DEFAULT_SIZE_CANDIDATE_MIN_BYTES
    const a = item(1, {filesize: 2 * GB, oshash: 'known'}), b = item(2, {filesize: 2 * GB, basename: '1.mp4'})
    expect(compareSimilarity(a, b, policy())).toMatchObject({level: 'pending', eligible: false, score: 0})
    expect(compareSimilarity(item(1, {filesize: big - 1}), item(2, {filesize: big - 1}), policy()).level).toBe('none')
    expect(compareSimilarity(a, b, policy({sizeCandidateMinBytes: 0})).level).toBe('none')
    // Both fingerprints known and different: the pair is settled, not pending.
    expect(compareSimilarity(a, {...b, oshash: 'other'}, policy()).level).toBe('none')
    expect(groupSimilarityItems([a, b], policy())).toEqual([])
  })
  it('finds other versions by frames only while version search is on', () => {
    const original = item(1, {oshash: 'original', visualHash: zero})
    const similar = item(2, {oshash: 'other', filesize: 100000, visualHash: '0000000000000001'})
    const copy = item(3, {oshash: 'original'})
    expect(compareSimilarity(original, similar, policy())).toMatchObject({level: 'version', eligible: true, score: 98.4})
    expect(groupSimilarityItems([original, similar, copy], policy())[0].itemIds).toEqual([1, 2, 3])
    expect(compareSimilarity(original, similar, policy({searchSimilarVideos: false}))).toMatchObject({level: 'none', eligible: false})
    expect(groupSimilarityItems([original, similar], policy({searchSimilarVideos: false}))).toEqual([])
  })
  it('requires enough matching frames for the chosen strictness', () => {
    const a = item(1, {visualHashTiles: frames(Array(9).fill(zero))})
    const sixOfNine = item(2, {visualHashTiles: frames([...Array(6).fill(zero), ...Array(3).fill(ones)])})
    const eightOfNine = item(3, {visualHashTiles: frames([...Array(8).fill(zero), ones])})
    expect(compareSimilarity(a, sixOfNine, policy({visualStrictness: 'loose'}))).toMatchObject({level: 'version', matchingFrames: 6})
    expect(compareSimilarity(a, sixOfNine, policy({visualStrictness: 'balanced'})).level).toBe('none')
    expect(compareSimilarity(a, eightOfNine, policy({visualStrictness: 'strict'})).level).toBe('version')
  })
  it('compares against the original without chaining A-B-C', () => {
    // 2 is 96.9% from 1 and 3 is 96.9% from 2, but 3 is only 93.75% from 1 (strict needs 94%).
    const rows = [item(1, {visualHash: zero}), item(2, {visualHash: '0000000000000003'}), item(3, {visualHash: '000000000000000f'})]
    expect(groupSimilarityItems(rows, policy({visualStrictness: 'strict'})).map(group => group.itemIds)).toEqual([[1, 2]])
  })
  it('does not group cards of different media types', () => {
    expect(compareSimilarity(item(1, {oshash: 'x', mediaTypeId: 1}), item(2, {oshash: 'x', mediaTypeId: 2}), policy()).level).toBe('none')
  })
})

describe('duplicate policy', () => {
  it('selects the configured original', () => {
    const rows = [item(1, {filesize: 10, width: 1920, height: 1080, createdAt: '2020'}), item(2, {filesize: 20, width: 640, height: 480, createdAt: '2025'})]
    expect(pickSimilarityOriginal(rows, 'quality')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'largest')).toBe(2)
    expect(pickSimilarityOriginal(rows, 'smallest')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'oldest')).toBe(1)
    expect(pickSimilarityOriginal(rows, 'newest')).toBe(2)
  })
  it('falls back to defaults and round-trips the current shape', () => {
    expect(parseDuplicatePolicy('bad')).toEqual(defaultDuplicatePolicy())
    expect(parseDuplicatePolicy(null)).toEqual(defaultDuplicatePolicy())
    const saved = policy({searchSimilarVideos: false, visualStrictness: 'strict', priority: 'oldest', autoMerge: true, sizeCandidateMinBytes: 0})
    expect(parseDuplicatePolicy(JSON.stringify(saved))).toEqual(saved)
    expect(parseDuplicatePolicy({visualStrictness: 'extreme', priority: 'random', sizeCandidateMinBytes: -5}))
      .toMatchObject({visualStrictness: 'balanced', priority: 'quality', sizeCandidateMinBytes: 0})
    expect(parseDuplicatePolicy({files: 'delete', autoMerge: true})).toMatchObject({files: 'delete', autoMerge: false})
  })
  it('reads policies saved by the earlier weighted settings', () => {
    const fingerprintPreset = {weights: {path: 0, name: 0, size: 0, oshash: 100, visual: 0}, required: [], threshold: 75,
      visualMinimum: 85, minimumFrames: 6, priority: 'largest', files: 'keep', autoMerge: true}
    expect(parseDuplicatePolicy(fingerprintPreset)).toEqual(policy({searchSimilarVideos: false, visualStrictness: 'loose', priority: 'largest', autoMerge: true}))
    expect(parseDuplicatePolicy({...fingerprintPreset, threshold: 85, visualMinimum: 90, minimumFrames: 7, searchSimilarVideos: true}))
      .toMatchObject({searchSimilarVideos: true, visualStrictness: 'balanced'})
    expect(parseDuplicatePolicy({weights: {visual: 100}, visualMinimum: 98})).toMatchObject({searchSimilarVideos: true, visualStrictness: 'strict'})
  })
})
