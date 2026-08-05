import {describe, expect, it} from 'vitest'
import {
  SCRFD_NUM_ANCHORS,
  getAnchorCenters,
  scoreAt,
  tensorAsRows,
  type OrtTensorLike,
} from './faceScrfdDecode'

function tensor(data: Float32Array, dims: readonly number[]): OrtTensorLike {
  return {data, dims}
}

describe('faceScrfdDecode', () => {
  it('reshapes batched score tensors into rows', () => {
    const data = new Float32Array([0.1, 0.2, 0.3, 0.4])
    expect(tensorAsRows(tensor(data, [1, 4, 1]), 1)).toEqual({rows: 4, data})
    expect(tensorAsRows(tensor(data, [2, 2]), 2)).toEqual({rows: 2, data})
    expect(tensorAsRows(tensor(data, [1, 4]), 1)).toEqual({rows: 4, data})
  })

  it('reads scores from common SCRFD tensor layouts', () => {
    const flat = new Float32Array([0.1, 0.2, 0.3, 0.4])
    expect(scoreAt(tensor(flat, [4, 1]), 2)).toBeCloseTo(0.3, 5)
    expect(scoreAt(tensor(flat, [1, 4]), 2)).toBeCloseTo(0.3, 5)
    expect(scoreAt(tensor(new Float32Array([0.5, 0.6, 0.7, 0.8, 0.9, 1.0]), [2, 3]), 1)).toBeCloseTo(1.0, 5)
  })

  it('builds anchor centers with the expected shape', () => {
    const height = 3
    const width = 4
    const stride = 8
    const centers = getAnchorCenters(height, width, stride)
    expect(centers.length).toBe(height * width * SCRFD_NUM_ANCHORS * 2)
    expect(centers[0]).toBe(0)
    expect(centers[1]).toBe(0)
    expect(centers[4]).toBe(8)
    expect(centers[5]).toBe(0)
    expect(centers[6]).toBe(8)
    expect(centers[7]).toBe(0)
  })
})
