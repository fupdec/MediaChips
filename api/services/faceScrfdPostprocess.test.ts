import {describe, expect, it} from 'vitest'
import {SCRFD_NUM_ANCHORS, type OrtTensorLike} from './faceScrfdDecode'
import {
  collectScrfdCandidates,
  computeScrfdLetterboxSize,
  passesScrfdGeometryGates,
} from './faceScrfdPostprocess'

function tensor(data: Float32Array, dims: readonly number[]): OrtTensorLike {
  return {data, dims}
}

describe('computeScrfdLetterboxSize', () => {
  it('scales tall images to input height', () => {
    const size = computeScrfdLetterboxSize(100, 400, 640)
    expect(size.newHeight).toBe(640)
    expect(size.newWidth).toBe(160)
    expect(size.detScale).toBeCloseTo(640 / 400, 5)
  })

  it('scales wide images to input width', () => {
    const size = computeScrfdLetterboxSize(400, 100, 640)
    expect(size.newWidth).toBe(640)
    expect(size.newHeight).toBe(160)
    expect(size.detScale).toBeCloseTo(160 / 100, 5)
  })

  it('keeps squares at input size', () => {
    expect(computeScrfdLetterboxSize(500, 500, 640)).toEqual({
      newWidth: 640,
      newHeight: 640,
      detScale: 640 / 500,
    })
  })

  it('guards zero width', () => {
    const size = computeScrfdLetterboxSize(0, 200, 640)
    expect(size.newWidth).toBeGreaterThanOrEqual(1)
    expect(size.newHeight).toBe(640)
  })
})

describe('passesScrfdGeometryGates', () => {
  const frame = {w: 1280, h: 720}

  it('rejects tiny boxes', () => {
    expect(passesScrfdGeometryGates(
      {x: 10, y: 10, width: 20, height: 20},
      frame.w,
      frame.h,
      {maxAreaRatio: 0.5},
    )).toBe(false)
  })

  it('rejects extreme aspect ratios', () => {
    expect(passesScrfdGeometryGates(
      {x: 10, y: 10, width: 200, height: 40},
      frame.w,
      frame.h,
      {maxAreaRatio: 0.5},
    )).toBe(false)
  })

  it('rejects huge area relative to frame', () => {
    expect(passesScrfdGeometryGates(
      {x: 0, y: 0, width: 1200, height: 700},
      frame.w,
      frame.h,
      {maxAreaRatio: 0.4},
    )).toBe(false)
  })

  it('accepts a mid-size plausible box', () => {
    expect(passesScrfdGeometryGates(
      {x: 100, y: 80, width: 160, height: 180},
      frame.w,
      frame.h,
      {maxAreaRatio: 0.5},
    )).toBe(true)
  })
})

describe('collectScrfdCandidates', () => {
  const inputSize = 32
  // stride 8 → 4x4x2 = 32 anchors; 16 → 8; 32 → 2
  const makeLevel = (anchors: number, scoreIndex: number, score: number, deltas: [number, number, number, number]) => {
    const scores = new Float32Array(anchors)
    scores[scoreIndex] = score
    const bboxes = new Float32Array(anchors * 4)
    const base = scoreIndex * 4
    bboxes[base] = deltas[0]
    bboxes[base + 1] = deltas[1]
    bboxes[base + 2] = deltas[2]
    bboxes[base + 3] = deltas[3]
    return {
      score: tensor(scores, [anchors, 1]),
      bbox: tensor(bboxes, [anchors, 4]),
    }
  }

  it('decodes a strong score into a clamped box and skips weak scores', () => {
    const a8 = 4 * 4 * SCRFD_NUM_ANCHORS
    const a16 = 2 * 2 * SCRFD_NUM_ANCHORS
    const a32 = 1 * 1 * SCRFD_NUM_ANCHORS
    const level0 = makeLevel(a8, 0, 0.9, [1, 1, 1, 1]) // 8px each side at stride 8
    const level1 = makeLevel(a16, 0, 0.1, [2, 2, 2, 2])
    const level2 = makeLevel(a32, 0, 0.1, [2, 2, 2, 2])

    const names = ['s0', 's1', 's2', 'b0', 'b1', 'b2']
    const outputs: Record<string, OrtTensorLike> = {
      s0: level0.score,
      s1: level1.score,
      s2: level2.score,
      b0: level0.bbox,
      b1: level1.bbox,
      b2: level2.bbox,
    }

    const candidates = collectScrfdCandidates({
      outputs,
      outputNames: names,
      detScale: 1,
      width: 200,
      height: 200,
      inputSize,
      minScore: 0.5,
      maxAreaRatio: 0.9,
      // Relax geometry for the tiny synthetic box.
      // passesScrfdGeometryGates still uses defaults — override via larger box deltas.
    })

    // With default min side gates the tiny 16x16 box is rejected; bump deltas.
    const big = makeLevel(a8, 0, 0.95, [4, 4, 4, 4]) // 32px each side → 64x64
    outputs.s0 = big.score
    outputs.b0 = big.bbox

    const accepted = collectScrfdCandidates({
      outputs,
      outputNames: names,
      detScale: 1,
      width: 200,
      height: 200,
      inputSize,
      minScore: 0.5,
      maxAreaRatio: 0.9,
    })

    expect(accepted).toHaveLength(1)
    expect(accepted[0].score).toBeCloseTo(0.95, 5)
    expect(accepted[0].box.width).toBeGreaterThan(24)
    expect(accepted[0].box.height).toBeGreaterThan(24)
    expect(accepted[0].kps).toBeNull()
  })

  it('honors acceptBox and skips missing score tensors', () => {
    const a8 = 4 * 4 * SCRFD_NUM_ANCHORS
    const level0 = makeLevel(a8, 0, 0.99, [5, 5, 5, 5])
    const names = ['s0', 's1', 's2', 'b0', 'b1', 'b2']
    const outputs: Record<string, OrtTensorLike | undefined> = {
      s0: level0.score,
      b0: level0.bbox,
      // s1/b1/s2/b2 missing → those strides skipped
    }

    const rejected = collectScrfdCandidates({
      outputs,
      outputNames: names,
      detScale: 1,
      width: 400,
      height: 400,
      inputSize,
      minScore: 0.5,
      maxAreaRatio: 0.9,
      acceptBox: () => false,
    })
    expect(rejected).toEqual([])

    const accepted = collectScrfdCandidates({
      outputs,
      outputNames: names,
      detScale: 1,
      width: 400,
      height: 400,
      inputSize,
      minScore: 0.5,
      maxAreaRatio: 0.9,
      acceptBox: () => true,
    })
    expect(accepted).toHaveLength(1)
  })
})
