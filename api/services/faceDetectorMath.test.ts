import {describe, expect, it} from 'vitest'
import {
  formatTimestamp,
  getFrameTimestamps,
  hardNms,
  hammingDistance,
  iou,
  pickDiverseFrames,
  qualityGatesForScore,
} from './faceDetectorMath'

describe('faceDetectorMath', () => {
  it('tightens quality gates as minScore rises', () => {
    const loose = qualityGatesForScore(0.5)
    const strict = qualityGatesForScore(0.75)
    expect(loose.applySkinFilter).toBe(false)
    expect(strict.applySkinFilter).toBe(true)
    expect(strict.maxSkinRatio).toBeLessThan(loose.maxSkinRatio)
    expect(strict.maxAreaRatio).toBeLessThan(loose.maxAreaRatio)
  })

  it('samples a single timestamp near mid-video', () => {
    expect(getFrameTimestamps(100, 1)).toEqual([formatTimestamp(42)])
  })

  it('returns biased multi-frame timestamps within duration', () => {
    const stamps = getFrameTimestamps(100, 4)
    expect(stamps).toHaveLength(4)
    expect(stamps[0]).toBe(formatTimestamp(100 * 0.05))
    expect(stamps.every((stamp) => /^\d{2}:\d{2}:\d{2}$/.test(stamp))).toBe(true)
  })

  it('computes Hamming distance and keeps diverse fingerprints', () => {
    expect(hammingDistance('0000', '0011')).toBe(2)
    const frames = [
      {id: 1, fingerprint: '0000000000000000'},
      {id: 2, fingerprint: '0000000000000001'},
      {id: 3, fingerprint: '1111111111111111'},
      {id: 4, fingerprint: '1111111111111110'},
    ]
    const diverse = pickDiverseFrames(frames, 2, 8)
    expect(diverse.map((frame) => frame.id)).toEqual([1, 3])
  })

  it('falls back when diversity filtering is too aggressive', () => {
    const frames = [
      {id: 1, fingerprint: '0000'},
      {id: 2, fingerprint: '0000'},
      {id: 3, fingerprint: '0000'},
      {id: 4, fingerprint: '0000'},
    ]
    expect(pickDiverseFrames(frames, 4, 16).map((frame) => frame.id)).toEqual([1, 2, 3, 4])
  })

  it('suppresses overlapping detections with hard NMS', () => {
    const kept = hardNms([
      {score: 0.9, box: {x: 0, y: 0, width: 100, height: 100}},
      {score: 0.8, box: {x: 10, y: 10, width: 100, height: 100}},
      {score: 0.7, box: {x: 200, y: 0, width: 50, height: 50}},
    ], 0.3, 5)
    expect(kept).toHaveLength(2)
    expect(kept[0].score).toBe(0.9)
    expect(kept[1].score).toBe(0.7)
    expect(iou(
      {x: 0, y: 0, width: 100, height: 100},
      {x: 50, y: 0, width: 100, height: 100},
    )).toBeCloseTo(1 / 3, 5)
  })
})
