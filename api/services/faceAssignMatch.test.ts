import {describe, expect, it} from 'vitest'
import {buildClearedFaceMatchUpdate, resolveAssignMatchFields} from './faceAssignMatch'

describe('resolveAssignMatchFields', () => {
  it('uses explicit score when provided', () => {
    expect(resolveAssignMatchFields({applyTag: false, matchScore: 0.77})).toEqual({
      matchScore: 0.77,
      matchStatus: 'suggested',
    })
  })

  it('commits applied tags as manual with score 1', () => {
    expect(resolveAssignMatchFields({applyTag: true})).toEqual({
      matchScore: 1,
      matchStatus: 'manual',
    })
  })

  it('keeps existing score for draft suggestions', () => {
    expect(resolveAssignMatchFields({
      applyTag: false,
      existingMatchScore: 0.6,
    })).toEqual({
      matchScore: 0.6,
      matchStatus: 'suggested',
    })
  })
})

describe('buildClearedFaceMatchUpdate', () => {
  it('clears tag fields as unmatched', () => {
    expect(buildClearedFaceMatchUpdate()).toEqual({
      tagId: null,
      matchScore: null,
      matchStatus: 'unmatched',
    })
  })
})
