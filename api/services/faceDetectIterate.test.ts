import {describe, expect, it} from 'vitest'
import {
  applyFaceDetectMediaResult,
  buildFaceDetectCompleteEvent,
  buildFaceDetectProgressEvent,
  createFaceDetectIterateCounters,
} from './faceDetectIterate'

describe('applyFaceDetectMediaResult', () => {
  it('classifies missing / failed / skipped / created and tallies faces', () => {
    let counters = createFaceDetectIterateCounters()
    counters = applyFaceDetectMediaResult(counters, {missing: true, facesLength: 0})
    counters = applyFaceDetectMediaResult(counters, {failed: true, facesLength: 0})
    counters = applyFaceDetectMediaResult(counters, {skipped: true, facesLength: 2})
    counters = applyFaceDetectMediaResult(counters, {facesLength: 3})
    expect(counters).toEqual({
      processed: 4,
      created: 1,
      skipped: 1,
      missing: 1,
      failed: 1,
      faces: 5,
    })
  })

  it('prefers missing over failed/skipped when multiple flags are set', () => {
    const counters = applyFaceDetectMediaResult(createFaceDetectIterateCounters(), {
      missing: true,
      failed: true,
      skipped: true,
      facesLength: 0,
    })
    expect(counters).toMatchObject({missing: 1, failed: 0, skipped: 0, created: 0})
  })
})

describe('detect progress events', () => {
  it('builds progress and complete payloads', () => {
    const counters = {
      processed: 2,
      created: 1,
      skipped: 1,
      missing: 0,
      failed: 0,
      faces: 4,
    }
    expect(buildFaceDetectProgressEvent(counters, 5, {current: '/a.mp4', mediaId: 9})).toMatchObject({
      type: 'progress',
      remaining: 3,
      faces: 4,
      current: '/a.mp4',
      mediaId: 9,
    })
    expect(buildFaceDetectCompleteEvent(counters, 5, true)).toMatchObject({
      type: 'complete',
      stopped: true,
      created: 1,
      faces: 4,
    })
  })
})
