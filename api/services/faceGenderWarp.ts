/** Pure genderage warp + logit decode (no ORT session). */

import {
  applyAffine,
  invertAffine,
  type Affine2x3,
  type AlignSampleImage,
} from './faceAlignMath'
import {softmax2, type FaceGender} from './faceGenderFilter'

export const GENDER_MEAN = 127.5
export const GENDER_STD = 128

export type FaceGenderEstimate = {
  gender: FaceGender
  age: number
  /** Softmax confidence of the predicted gender class (0–1). */
  confidence: number
}

export function sampleGenderBilinear(
  image: AlignSampleImage,
  x: number,
  y: number,
): [number, number, number] {
  const clampX = Math.max(0, Math.min(image.width - 1, x))
  const clampY = Math.max(0, Math.min(image.height - 1, y))
  const x0 = Math.floor(clampX)
  const y0 = Math.floor(clampY)
  const x1 = Math.min(image.width - 1, x0 + 1)
  const y1 = Math.min(image.height - 1, y0 + 1)
  const dx = clampX - x0
  const dy = clampY - y0
  const {data} = image.bitmap
  const i00 = (y0 * image.width + x0) * 4
  const i01 = (y0 * image.width + x1) * 4
  const i10 = (y1 * image.width + x0) * 4
  const i11 = (y1 * image.width + x1) * 4
  const out: [number, number, number] = [0, 0, 0]
  for (let c = 0; c < 3; c++) {
    out[c] = (
      data[i00 + c] * (1 - dx) * (1 - dy)
      + data[i01 + c] * dx * (1 - dy)
      + data[i10 + c] * (1 - dx) * dy
      + data[i11 + c] * dx * dy
    )
  }
  return out
}

/** InsightFace attribute warp → normalized NCHW float blob. */
export function warpGenderAffineRgb(
  image: AlignSampleImage,
  M: Affine2x3,
  outW: number,
  outH: number,
  mean = GENDER_MEAN,
  std = GENDER_STD,
): Float32Array {
  const inv = invertAffine(M)
  const plane = outW * outH
  const out = new Float32Array(3 * plane)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const src = applyAffine(inv, x + 0.5, y + 0.5)
      const [r, g, b] = sampleGenderBilinear(image, src.x, src.y)
      const dst = y * outW + x
      out[dst] = (r - mean) / std
      out[plane + dst] = (g - mean) / std
      out[2 * plane + dst] = (b - mean) / std
    }
  }
  return out
}

/** Map InsightFace genderage logits (0=female, 1=male, 2=age/100) to an estimate. */
export function decodeGenderagePrediction(
  data: ArrayLike<number>,
): FaceGenderEstimate | null {
  if (!data || data.length < 3) return null
  const femaleLogit = Number(data[0])
  const maleLogit = Number(data[1])
  const ageNorm = Number(data[2])
  if (![femaleLogit, maleLogit, ageNorm].every(Number.isFinite)) return null

  const [femaleProb, maleProb] = softmax2(femaleLogit, maleLogit)
  const male = maleProb >= femaleProb
  return {
    gender: male ? 'male' : 'female',
    age: Math.round(ageNorm * 100),
    confidence: male ? maleProb : femaleProb,
  }
}
