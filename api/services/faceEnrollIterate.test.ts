import {describe, expect, it} from 'vitest'
import {
  applyFaceEnrollTagOutcome,
  buildEnrollTagFacesClearResult,
  buildEnrollTagFacesCreatedResult,
  buildEnrollTagFacesSkipResult,
  buildFaceEnrollCompleteEvent,
  buildFaceEnrollProgressEvent,
  classifyEnrollAttempt,
  createFaceEnrollIterateCounters,
  getEnrollTagSkipReason,
  prepareEnrollTagPending,
  resolveEnrollSourcePathDecision,
  resolveEnrollTagFacesPlan,
  resolveIterateEnrollGate,
} from './faceEnrollIterate'

describe('getEnrollTagSkipReason', () => {
  it('skips empty galleries and tags with nothing pending', () => {
    expect(getEnrollTagSkipReason({imageCount: 0, pendingCount: 0})).toBe('skip-no-images')
    expect(getEnrollTagSkipReason({imageCount: 2, pendingCount: 0})).toBe('skip-no-pending')
    expect(getEnrollTagSkipReason({imageCount: 2, pendingCount: 1})).toBeNull()
  })
})

describe('classifyEnrollAttempt', () => {
  it('classifies created and failed attempts', () => {
    expect(classifyEnrollAttempt({created: 1})).toBe('enrolled')
    expect(classifyEnrollAttempt({created: 0})).toBe('skip-unchanged')
    expect(classifyEnrollAttempt({created: 0, failed: true})).toBe('failed')
  })
})

describe('applyFaceEnrollTagOutcome', () => {
  it('increments the matching counter', () => {
    let counters = createFaceEnrollIterateCounters()
    counters = applyFaceEnrollTagOutcome(counters, 'enrolled')
    counters = applyFaceEnrollTagOutcome(counters, 'skip-no-images')
    counters = applyFaceEnrollTagOutcome(counters, 'failed')
    expect(counters).toEqual({
      processed: 3,
      enrolled: 1,
      skipped: 1,
      failed: 1,
    })
  })
})

describe('enroll progress events', () => {
  it('builds progress and complete payloads', () => {
    const counters = {
      processed: 2,
      enrolled: 1,
      skipped: 1,
      failed: 0,
    }
    expect(buildFaceEnrollProgressEvent(counters, 5, {current: 'Ada'})).toMatchObject({
      type: 'progress',
      remaining: 3,
      enrolled: 1,
      current: 'Ada',
    })
    expect(buildFaceEnrollCompleteEvent(counters, 5, true)).toMatchObject({
      type: 'complete',
      stopped: true,
      enrolled: 1,
    })
  })
})

describe('resolveEnrollTagFacesPlan', () => {
  it('skips missing tags and non-people categories', () => {
    expect(resolveEnrollTagFacesPlan({
      tagFound: false,
      metaId: null,
      performerMetaId: 1,
      imagePaths: [],
    })).toEqual({kind: 'skip', reason: 'tag_not_found', metaId: 0})

    expect(resolveEnrollTagFacesPlan({
      tagFound: true,
      metaId: 2,
      performerMetaId: 1,
      imagePaths: ['a.jpg'],
    })).toEqual({kind: 'skip', reason: 'not_people_category', metaId: 2})
  })

  it('clears empty galleries and enrolls when images exist', () => {
    expect(resolveEnrollTagFacesPlan({
      tagFound: true,
      metaId: 1,
      performerMetaId: 1,
      imagePaths: [],
      force: true,
    })).toEqual({kind: 'clear-empty', metaId: 1, clearEnrollments: true})

    expect(resolveEnrollTagFacesPlan({
      tagFound: true,
      metaId: 1,
      performerMetaId: 1,
      imagePaths: ['a.jpg'],
    })).toEqual({kind: 'enroll', metaId: 1, imagePaths: ['a.jpg']})
  })
})

describe('resolveIterateEnrollGate', () => {
  it('requires a configured performer category', () => {
    expect(resolveIterateEnrollGate({performerMetaId: null})).toEqual({
      ok: false,
      event: {type: 'error', message: 'Performer category is not configured.'},
    })
    expect(resolveIterateEnrollGate({performerMetaId: 4})).toEqual({
      ok: true,
      metaId: 4,
    })
  })
})

describe('prepareEnrollTagPending', () => {
  it('skips when all gallery paths are already enrolled', () => {
    const prep = prepareEnrollTagPending({
      imagePaths: ['/db/meta/1.jpg'],
      existingRows: [{sourcePath: 'meta/1.jpg'}],
      dbPath: '/db',
    })
    expect(prep.pendingPaths).toEqual([])
    expect(prep.skipReason).toBe('skip-no-pending')
  })

  it('keeps pending paths when force is set', () => {
    const prep = prepareEnrollTagPending({
      imagePaths: ['/db/a.jpg'],
      existingRows: [{sourcePath: 'a.jpg'}],
      dbPath: '/db',
      force: true,
    })
    expect(prep.pendingPaths).toEqual(['/db/a.jpg'])
    expect(prep.skipReason).toBeNull()
  })
})

describe('resolveEnrollSourcePathDecision', () => {
  it('stops at the enrollment cap and skips duplicates', () => {
    expect(resolveEnrollSourcePathDecision({
      enrolledCount: 8,
      maxEnrollments: 8,
      sourcePath: 'a.jpg',
      imagePath: '/db/a.jpg',
      enrolledSources: [],
    })).toEqual({kind: 'stop'})

    expect(resolveEnrollSourcePathDecision({
      enrolledCount: 1,
      sourcePath: 'a.jpg',
      imagePath: '/db/a.jpg',
      enrolledSources: ['a.jpg'],
    })).toEqual({kind: 'skip-existing'})

    expect(resolveEnrollSourcePathDecision({
      enrolledCount: 1,
      sourcePath: 'b.jpg',
      imagePath: '/db/b.jpg',
      enrolledSources: ['a.jpg'],
    })).toEqual({kind: 'enroll', sourcePath: 'b.jpg'})
  })
})

describe('enrollTagFaces result builders', () => {
  it('builds skip, clear, and created payloads', () => {
    expect(buildEnrollTagFacesSkipResult(1, 2, 'tag_not_found')).toEqual({
      tagId: 1,
      metaId: 2,
      created: 0,
      skipped: true,
      reason: 'tag_not_found',
    })
    expect(buildEnrollTagFacesClearResult(1, 2)).toEqual({
      tagId: 1,
      metaId: 2,
      created: 0,
      skipped: false,
    })
    expect(buildEnrollTagFacesCreatedResult(1, 2, 3)).toEqual({
      tagId: 1,
      metaId: 2,
      created: 3,
      skipped: false,
    })
  })
})
