import type { FaceBox } from '../types/faceDetector'

/** Detect-score floor before we bother embedding/matching a face. */
export const MATCH_MIN_DETECT_SCORE = 0.55
/** Absolute min face side in pixels on the extracted frame. */
export const MATCH_MIN_FACE_SIDE_PX = 56
/** Relative min face side vs shorter frame edge. */
export const MATCH_MIN_FACE_SIDE_RATIO = 0.045
/** Laplacian variance below this ≈ too blurry for reliable matching. */
export const MATCH_MIN_BLUR_VARIANCE = 18

export type MatchGateReason =
  | 'low_score'
  | 'face_too_small'
  | 'blurry'
  | 'ok'

/**
 * Whether a detection is strong enough to embed and match against the gallery.
 * Weak faces can still be shown in review UI, but should not drive auto-tags.
 */
export function assessMatchability(options: {
  score: number
  box: FaceBox
  frameWidth: number
  frameHeight: number
  blurVariance?: number | null
}): {ok: true} | {ok: false; reason: MatchGateReason} {
  const {score, box, frameWidth, frameHeight, blurVariance} = options
  if (!(score >= MATCH_MIN_DETECT_SCORE)) {
    return {ok: false, reason: 'low_score'}
  }

  const minSide = Math.min(box.width, box.height)
  const frameMin = Math.min(frameWidth, frameHeight)
  if (minSide < MATCH_MIN_FACE_SIDE_PX && minSide < frameMin * MATCH_MIN_FACE_SIDE_RATIO) {
    return {ok: false, reason: 'face_too_small'}
  }

  if (blurVariance != null && Number.isFinite(blurVariance) && blurVariance < MATCH_MIN_BLUR_VARIANCE) {
    return {ok: false, reason: 'blurry'}
  }

  return {ok: true}
}

/** Rematch path: only score + stored box size (no frame / blur available). */
export function isMatchableStoredFace(face: {
  score?: number | null
  width?: number | null
  height?: number | null
}): boolean {
  const score = Number(face.score) || 0
  const width = Number(face.width) || 0
  const height = Number(face.height) || 0
  if (!(score >= MATCH_MIN_DETECT_SCORE)) return false
  if (Math.min(width, height) < MATCH_MIN_FACE_SIDE_PX) return false
  return true
}
