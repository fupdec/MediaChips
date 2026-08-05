import {describe, expect, it} from 'vitest'
import {
  buildClearedFaceMatchResult,
  buildClearedFaceMatchUpdate,
  filterExistingMediaIds,
  resolveAssignFaceToPerformerGate,
  resolveAssignMatchFields,
  resolveFaceFoundGate,
} from './faceAssignMatch'

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

  it('builds the clear API result payload', () => {
    expect(buildClearedFaceMatchResult({faceId: 8, mediaId: '3'})).toEqual({
      faceId: 8,
      mediaId: 3,
      tagId: null,
      matchStatus: 'unmatched',
    })
  })
})

describe('resolveFaceFoundGate', () => {
  it('requires a face row', () => {
    expect(resolveFaceFoundGate(false)).toEqual({ok: false, error: 'Face not found'})
    expect(resolveFaceFoundGate(true)).toEqual({ok: true})
  })
})

describe('resolveAssignFaceToPerformerGate', () => {
  it('requires face and performer tag meta', () => {
    expect(resolveAssignFaceToPerformerGate({
      faceFound: false,
      tagMetaId: 1,
    })).toEqual({ok: false, error: 'Face not found'})
    expect(resolveAssignFaceToPerformerGate({
      faceFound: true,
      tagMetaId: null,
    })).toEqual({ok: false, error: 'Performer tag not found'})
    expect(resolveAssignFaceToPerformerGate({
      faceFound: true,
      tagMetaId: 3,
    })).toEqual({ok: true, metaId: 3})
  })
})

describe('filterExistingMediaIds', () => {
  it('keeps finite ids that still exist', () => {
    expect(filterExistingMediaIds([1, '2', 99, 'x'], (id) => id === 1 || id === 2)).toEqual([1, 2])
  })
})
