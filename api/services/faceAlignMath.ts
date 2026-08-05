/** Pure InsightFace alignment geometry (no ORT / DB). */

export type AlignSampleImage = {
  width: number
  height: number
  bitmap: {data: Uint8Array | Buffer | number[]}
}

export type Point2 = {x: number; y: number}
export type Affine2x3 = [[number, number, number], [number, number, number]]

export function samplePixel(image: AlignSampleImage, x: number, y: number): [number, number, number] {
  const ix = Math.max(0, Math.min(image.width - 1, Math.floor(x)))
  const iy = Math.max(0, Math.min(image.height - 1, Math.floor(y)))
  const idx = (iy * image.width + ix) * 4
  const {data} = image.bitmap
  return [data[idx], data[idx + 1], data[idx + 2]]
}

export function sampleBilinear(image: AlignSampleImage, x: number, y: number): [number, number, number] {
  if (x < 0 || y < 0 || x >= image.width - 1 || y >= image.height - 1) {
    return samplePixel(image, x, y)
  }
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1
  const y1 = y0 + 1
  const dx = x - x0
  const dy = y - y0
  const {data} = image.bitmap
  const i00 = (y0 * image.width + x0) * 4
  const i01 = (y0 * image.width + x1) * 4
  const i10 = (y1 * image.width + x0) * 4
  const i11 = (y1 * image.width + x1) * 4
  const out: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    const v00 = data[i00 + c]
    const v01 = data[i01 + c]
    const v10 = data[i10 + c]
    const v11 = data[i11 + c]
    out[c] = (
      v00 * (1 - dx) * (1 - dy)
      + v01 * dx * (1 - dy)
      + v10 * (1 - dx) * dy
      + v11 * dx * dy
    )
  }
  return out
}

/** Similarity transform used by InsightFace landmark preprocess (rotation=0). */
export function buildScaleTranslate(
  centerX: number,
  centerY: number,
  scale: number,
  outputSize: number,
): Affine2x3 {
  const tx = outputSize / 2 - centerX * scale
  const ty = outputSize / 2 - centerY * scale
  return [
    [scale, 0, tx],
    [0, scale, ty],
  ]
}

export function invertAffine(M: Affine2x3): Affine2x3 {
  const [[a, b, tx], [c, d, ty]] = M
  const det = a * d - b * c
  if (Math.abs(det) < 1e-12) {
    return [
      [1, 0, 0],
      [0, 1, 0],
    ]
  }
  const invDet = 1 / det
  const ia = d * invDet
  const ib = -b * invDet
  const ic = -c * invDet
  const id = a * invDet
  return [
    [ia, ib, -(ia * tx + ib * ty)],
    [ic, id, -(ic * tx + id * ty)],
  ]
}

export function applyAffine(M: Affine2x3, x: number, y: number): Point2 {
  return {
    x: M[0][0] * x + M[0][1] * y + M[0][2],
    y: M[1][0] * x + M[1][1] * y + M[1][2],
  }
}

export function warpAffineRgb(
  image: AlignSampleImage,
  M: Affine2x3,
  outW: number,
  outH: number,
): Uint8Array {
  const inv = invertAffine(M)
  const out = new Uint8Array(outW * outH * 3)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyAffine(inv, x + 0.5, y + 0.5)
      const [r, g, b] = sampleBilinear(image, src.x, src.y)
      const idx = (y * outW + x) * 3
      out[idx] = r
      out[idx + 1] = g
      out[idx + 2] = b
    }
  }
  return out
}

/**
 * Least-squares similarity (scale+rotate+translate):
 * x' = a*x - b*y + tx
 * y' = b*x + a*y + ty
 */
export function estimateSimilarity(src: Point2[], dst: Point2[]): Affine2x3 | null {
  const n = Math.min(src.length, dst.length)
  if (n < 2) return null

  const AtA = new Float64Array(16)
  const Atb = new Float64Array(4)
  for (let i = 0; i < n; i++) {
    const sx = src[i].x
    const sy = src[i].y
    const dx = dst[i].x
    const dy = dst[i].y
    const rows: Array<[number, number, number, number, number]> = [
      [sx, -sy, 1, 0, dx],
      [sy, sx, 0, 1, dy],
    ]
    for (const [r0, r1, r2, r3, rhs] of rows) {
      const row = [r0, r1, r2, r3]
      for (let rowIdx = 0; rowIdx < 4; rowIdx++) {
        Atb[rowIdx] += row[rowIdx] * rhs
        for (let colIdx = 0; colIdx < 4; colIdx++) {
          AtA[rowIdx * 4 + colIdx] += row[rowIdx] * row[colIdx]
        }
      }
    }
  }

  const sol = solveLinear4(AtA, Atb)
  if (!sol) return estimateSimilarityFromEyes(src, dst)
  const [a, b, tx, ty] = sol
  if (!Number.isFinite(a) || !Number.isFinite(b)) return estimateSimilarityFromEyes(src, dst)
  return [
    [a, -b, tx],
    [b, a, ty],
  ]
}

export function solveLinear4(A: Float64Array, b: Float64Array): Float64Array | null {
  const m = new Float64Array(20) // 4x5 augmented
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) m[r * 5 + c] = A[r * 4 + c]
    m[r * 5 + 4] = b[r]
  }

  for (let col = 0; col < 4; col++) {
    let pivot = col
    for (let row = col + 1; row < 4; row++) {
      if (Math.abs(m[row * 5 + col]) > Math.abs(m[pivot * 5 + col])) pivot = row
    }
    if (Math.abs(m[pivot * 5 + col]) < 1e-12) return null
    if (pivot !== col) {
      for (let c = 0; c < 5; c++) {
        const tmp = m[col * 5 + c]
        m[col * 5 + c] = m[pivot * 5 + c]
        m[pivot * 5 + c] = tmp
      }
    }
    const diag = m[col * 5 + col]
    for (let c = col; c < 5; c++) m[col * 5 + c] /= diag
    for (let row = 0; row < 4; row++) {
      if (row === col) continue
      const factor = m[row * 5 + col]
      for (let c = col; c < 5; c++) m[row * 5 + c] -= factor * m[col * 5 + c]
    }
  }

  return new Float64Array([m[4], m[9], m[14], m[19]])
}

/** Fallback similarity from eyes only when Umeyama is unstable. */
export function estimateSimilarityFromEyes(src: Point2[], dst: Point2[]): Affine2x3 | null {
  if (src.length < 2 || dst.length < 2) return null
  const sdx = src[1].x - src[0].x
  const sdy = src[1].y - src[0].y
  const ddx = dst[1].x - dst[0].x
  const ddy = dst[1].y - dst[0].y
  const srcLen = Math.hypot(sdx, sdy)
  const dstLen = Math.hypot(ddx, ddy)
  if (srcLen < 1e-6 || dstLen < 1e-6) return null
  const scale = dstLen / srcLen
  const angle = Math.atan2(ddy, ddx) - Math.atan2(sdy, sdx)
  const cos = Math.cos(angle) * scale
  const sin = Math.sin(angle) * scale
  const tx = dst[0].x - (cos * src[0].x - sin * src[0].y)
  const ty = dst[0].y - (sin * src[0].x + cos * src[0].y)
  return [
    [cos, -sin, tx],
    [sin, cos, ty],
  ]
}

export function landmarks106To5(points: Point2[]): Point2[] {
  const avg = (indexes: number[]): Point2 => {
    let x = 0
    let y = 0
    for (const index of indexes) {
      x += points[index].x
      y += points[index].y
    }
    return {x: x / indexes.length, y: y / indexes.length}
  }
  // Common InsightFace 106 → 5 mapping used across community ports.
  return [
    avg([33, 35, 40, 39]), // left eye
    avg([87, 89, 94, 93]), // right eye
    points[86], // nose tip
    points[52], // left mouth
    points[61], // right mouth
  ]
}
