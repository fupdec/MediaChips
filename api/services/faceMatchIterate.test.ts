import {describe, expect, it} from 'vitest'
import {
  applyFaceMatchMediaResult,
  buildFaceMatchCompleteEvent,
  buildFaceMatchProgressEvent,
  createFaceMatchIterateCounters,
  markFaceMatchIterateFailed,
} from './faceMatchIterate'

describe('faceMatchIterate counters', () => {
  it('accumulates media match results', () => {
    let counters = createFaceMatchIterateCounters()
    counters = applyFaceMatchMediaResult(counters, {
      matched: 2,
      applied: 1,
      skipped: 3,
      faces: 5,
    })
    expect(counters).toEqual({
      processed: 1,
      matched: 2,
      applied: 1,
      skipped: 3,
      failed: 0,
    })
  })

  it('counts empty error results as failures', () => {
    const counters = applyFaceMatchMediaResult(createFaceMatchIterateCounters(), {
      matched: 0,
      applied: 0,
      skipped: 0,
      faces: 0,
      error: 'No enrolled performer faces.',
    })
    expect(counters.failed).toBe(1)
  })

  it('marks thrown media failures', () => {
    expect(markFaceMatchIterateFailed(createFaceMatchIterateCounters())).toEqual({
      processed: 1,
      matched: 0,
      applied: 0,
      skipped: 0,
      failed: 1,
    })
  })

  it('builds progress and complete events', () => {
    const counters = {
      processed: 2,
      matched: 4,
      applied: 1,
      skipped: 0,
      failed: 0,
    }
    expect(buildFaceMatchProgressEvent(counters, 10, {mediaId: 7})).toMatchObject({
      type: 'progress',
      remaining: 8,
      mediaId: 7,
    })
    expect(buildFaceMatchCompleteEvent(counters, 10, true)).toMatchObject({
      type: 'complete',
      stopped: true,
      matched: 4,
    })
  })
})
