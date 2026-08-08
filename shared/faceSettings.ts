/** Shared face detect/match setting clamps (api + settings UI). */

import {parseBooleanSetting} from './parseBooleanSetting'

export type FaceMatchMode = 'suggest' | 'auto'
export type FaceGender = 'female' | 'male'
export type FaceGenderFilter = 'both' | FaceGender

export const DEFAULT_FACE_CANDIDATE_LIMIT = 10
export const MIN_FACE_CANDIDATE_LIMIT = 3
export const MAX_FACE_CANDIDATE_LIMIT = 20

export function parseFaceMatchMode(value: unknown): FaceMatchMode {
  return String(value || 'suggest') === 'auto' ? 'auto' : 'suggest'
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
  return parseBooleanSetting(value, fallback)
}

/** Create Person N tags for large unlabeled face clusters (off by default). */
export function parseFaceMatchAutoBlindTags(value: unknown, fallback = false): boolean {
  return parseBooleanSetting(value, fallback)
}

export const BLIND_PERSON_NAME_RE = /^Person\s+(\d+)$/i

export function isBlindPersonTagName(name: unknown): boolean {
  return BLIND_PERSON_NAME_RE.test(String(name || '').trim())
}

/** Next unused Person N label from an existing people-tag name list. */
export function nextBlindPersonName(existingNames: string[]): string {
  let max = 0
  for (const name of existingNames) {
    const match = BLIND_PERSON_NAME_RE.exec(String(name || '').trim())
    if (!match) continue
    const n = Number(match[1])
    if (Number.isFinite(n) && n > max) max = n
  }
  return `Person ${max + 1}`
}
