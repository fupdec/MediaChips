import {describe, expect, it} from 'vitest'
import {
  classifyStoredFaceForMatch,
  resolveClusterMatchUpdate,
  uniqueMediaTagApplies,
} from './faceMatchApply'

describe('resolveClusterMatchUpdate', () => {
  const best = {tagId: 9, score: 0.92}

  it('auto-accepts strong picks as matched', () => {
    expect(resolveClusterMatchUpdate({accepted: true, ambiguous: false, best}, 'auto')).toEqual({
      tagId: 9,
      matchScore: 0.92,
      matchStatus: 'matched',
    })
  })

  it('suggest mode keeps accepted picks as suggested', () => {
    expect(resolveClusterMatchUpdate({accepted: true, ambiguous: false, best}, 'suggest')).toEqual({
      tagId: 9,
      matchScore: 0.92,
      matchStatus: 'suggested',
    })
  })

  it('marks ambiguous winners as suggested', () => {
    expect(resolveClusterMatchUpdate({accepted: false, ambiguous: true, best}, 'auto')).toEqual({
      tagId: 9,
      matchScore: 0.92,
      matchStatus: 'suggested',
    })
  })

  it('clears tag for unmatched picks but keeps positive score', () => {
    expect(resolveClusterMatchUpdate({
      accepted: false,
      ambiguous: false,
      best: {tagId: 3, score: 0.4},
    }, 'auto')).toEqual({
      tagId: null,
      matchScore: 0.4,
      matchStatus: 'unmatched',
    })
  })
})

describe('uniqueMediaTagApplies', () => {
  it('dedupes by media/tag/meta', () => {
    expect(uniqueMediaTagApplies([
      {mediaId: 1, tagId: 2, metaId: 3},
      {mediaId: 1, tagId: 2, metaId: 3},
      {mediaId: 1, tagId: 4, metaId: 3},
    ])).toEqual([
      {mediaId: 1, tagId: 2, metaId: 3},
      {mediaId: 1, tagId: 4, metaId: 3},
    ])
  })
})

describe('classifyStoredFaceForMatch', () => {
  it('skips already tagged faces unless forced', () => {
    expect(classifyStoredFaceForMatch({
      hasTagId: true,
      isMatchable: true,
    })).toBe('skip-assigned')
    expect(classifyStoredFaceForMatch({
      hasTagId: true,
      force: true,
      isMatchable: true,
    })).toBe('embed')
  })

  it('skips unmatchable faces', () => {
    expect(classifyStoredFaceForMatch({
      hasTagId: false,
      isMatchable: false,
    })).toBe('skip-unmatchable')
  })
})
