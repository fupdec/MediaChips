/** Shared face detect/match setting clamps (api + settings UI). */

export type FaceMatchMode = 'suggest' | 'auto'
export type FaceGender = 'female' | 'male'
export type FaceGenderFilter = 'both' | FaceGender

export const DEFAULT_FACE_CANDIDATE_LIMIT = 10
export const MIN_FACE_CANDIDATE_LIMIT = 3
export const MAX_FACE_CANDIDATE_LIMIT = 20

export function parseFaceMatchMode(value: unknown): FaceMatchMode {
  return String(value || 'auto') === 'suggest' ? 'suggest' : 'auto'
}

export function clampFaceMatchConfidence(value: unknown, fallback = 0.55): number {
  const minConfidence = Number(value ?? fallback)
  if (!Number.isFinite(minConfidence)) return fallback
  return Math.min(Math.max(minConfidence, 0.2), 0.95)
}

export function clampFaceCandidateLimit(value: unknown, fallback = DEFAULT_FACE_CANDIDATE_LIMIT): number {
  const raw = Number(value ?? fallback)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(MAX_FACE_CANDIDATE_LIMIT, Math.max(MIN_FACE_CANDIDATE_LIMIT, Math.round(raw)))
}

export function clampFaceDetectMinScore(value: unknown, fallback = 0.5): number {
  const minScoreRaw = Number(value ?? fallback)
  if (!Number.isFinite(minScoreRaw)) return fallback
  return Math.min(Math.max(minScoreRaw, 0.5), 0.75)
}

export function clampFaceDetectFramesPerVideo(value: unknown, fallback = 6): number {
  const framesRaw = Number(value ?? fallback)
  if (!Number.isFinite(framesRaw)) return fallback
  return Math.min(Math.max(Math.round(framesRaw), 1), 99)
}

export function normalizeGenderFilter(value: unknown): FaceGenderFilter {
  const raw = String(value ?? 'both').trim().toLowerCase()
  if (raw === 'female' || raw === 'male') return raw
  return 'both'
}

/** Coerce faceMatch.matchAfterDetect (and similar) setting values. */
export function parseFaceMatchAfterDetect(value: unknown, fallback = true): boolean {
  if (value == null || value === '') return fallback
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  const normalized = String(value).toLowerCase()
  return normalized === 'true' || normalized === '1'
}
