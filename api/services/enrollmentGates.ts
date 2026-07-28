import type { FaceBox, FaceLandmark5 } from '../types/faceDetector'

/** Reject enrollment refs that would pollute the gallery. */
export const ENROLL_MIN_DETECT_SCORE = 0.55
export const ENROLL_MIN_FACE_AREA_RATIO = 0.04
/** Keep a small diverse set per person — more weak shots hurt ranking. */
export const MAX_ENROLLMENTS_PER_TAG = 5
/** Skip a new shot if it is nearly identical to an already enrolled vector. */
export const ENROLL_DUP_COSINE = 0.92
/** Second face must be much smaller than the primary, or the shot is a group photo. */
export const ENROLL_DOMINANT_FACE_RATIO = 0.35

export type EnrollmentGateReason =
  | 'no_face'
  | 'low_score'
  | 'face_too_small'
  | 'multi_face'
  | 'ok'

export type EnrollmentDetection = {
  score: number
  box: FaceBox
  kps?: FaceLandmark5 | null
}

export function faceArea(box: FaceBox) {
  return Math.max(0, box.width) * Math.max(0, box.height)
}

/**
 * Pick the best enrollable face from detections, or reject with a reason
 * aligned with enrollmentQuality grades (weak/bad).
 */
export function assessEnrollmentDetections(
  detections: EnrollmentDetection[],
  imageWidth: number,
  imageHeight: number,
): {ok: true; best: EnrollmentDetection} | {ok: false; reason: EnrollmentGateReason; best: EnrollmentDetection | null} {
  if (!detections.length) {
    return {ok: false, reason: 'no_face', best: null}
  }

  const ranked = [...detections].sort((a, b) => faceArea(b.box) - faceArea(a.box))
  const best = ranked[0]
  const frameArea = Math.max(1, imageWidth * imageHeight)
  const areaRatio = faceArea(best.box) / frameArea

  if (!(best.score >= ENROLL_MIN_DETECT_SCORE)) {
    return {ok: false, reason: 'low_score', best}
  }
  if (areaRatio < ENROLL_MIN_FACE_AREA_RATIO) {
    return {ok: false, reason: 'face_too_small', best}
  }
  if (ranked.length > 1) {
    const secondArea = faceArea(ranked[1].box)
    if (secondArea / Math.max(faceArea(best.box), 1) >= ENROLL_DOMINANT_FACE_RATIO) {
      return {ok: false, reason: 'multi_face', best}
    }
  }

  return {ok: true, best}
}

export function isNearDuplicateEmbedding(
  candidate: Float32Array,
  existing: Float32Array[],
  threshold: number = ENROLL_DUP_COSINE,
) {
  for (const ref of existing) {
    const len = Math.min(candidate.length, ref.length)
    let sum = 0
    for (let i = 0; i < len; i++) sum += candidate[i] * ref[i]
    if (sum >= threshold) return true
  }
  return false
}
