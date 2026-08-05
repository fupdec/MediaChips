/** Pure SCRFD tensor decode helpers (no ORT runtime required in tests). */

export type OrtTensorLike = { data: Float32Array; dims: readonly number[] }

export const SCRFD_STRIDES = [8, 16, 32] as const
export const SCRFD_NUM_ANCHORS = 2

const centerCache = new Map<string, Float32Array>()

export function getAnchorCenters(height: number, width: number, stride: number): Float32Array {
  const key = `${height}x${width}@${stride}`
  const cached = centerCache.get(key)
  if (cached) return cached

  const spatial = height * width
  const centers = new Float32Array(spatial * SCRFD_NUM_ANCHORS * 2)
  let o = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cx = x * stride
      const cy = y * stride
      for (let a = 0; a < SCRFD_NUM_ANCHORS; a++) {
        centers[o++] = cx
        centers[o++] = cy
      }
    }
  }
  if (centerCache.size < 100) centerCache.set(key, centers)
  return centers
}

export function tensorAsRows(tensor: OrtTensorLike, expectedCols: number): {rows: number; data: Float32Array} {
  const data = tensor.data
  const dims = tensor.dims
  if (dims.length === 3) {
    // [batch, N, C]
    return {rows: Number(dims[1]), data}
  }
  if (dims.length === 2) {
    const rows = Number(dims[0])
    const cols = Number(dims[1])
    if (cols === expectedCols) return {rows, data}
    // Flat scores as [1, N]
    if (rows === 1 && expectedCols === 1) return {rows: cols, data}
    return {rows, data}
  }
  return {rows: Math.floor(data.length / Math.max(expectedCols, 1)), data}
}

export function scoreAt(tensor: OrtTensorLike, index: number): number {
  const data = tensor.data
  const dims = tensor.dims
  if (dims.length === 3) {
    const cols = Number(dims[2])
    if (cols <= 1) return data[index]
    return data[index * cols + (cols - 1)]
  }
  if (dims.length === 2) {
    const rows = Number(dims[0])
    const cols = Number(dims[1])
    if (cols <= 1) return data[index]
    if (rows === 1) return data[index]
    return data[index * cols + (cols - 1)]
  }
  return data[index]
}
