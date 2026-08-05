import {
  DEFAULT_CANDIDATE_LIMIT,
  clampCandidateLimit,
} from './faceMatchScoring'
import type {FaceMatchMode} from './faceMatchApply'
import {parseBooleanSetting} from '../utils/parseBooleanSetting'

export type FaceMatchSettingsValues = {
  performerMetaId: number | null
  minConfidence: number
  candidateLimit: number
  mode: FaceMatchMode
  matchAfterDetect: boolean
}

export function parseFaceMatchMode(value: unknown): FaceMatchMode {
  return String(value || 'auto') === 'suggest' ? 'suggest' : 'auto'
}

export function clampFaceMatchConfidence(value: unknown, fallback = 0.55): number {
  const minConfidence = Number(value ?? fallback)
  if (!Number.isFinite(minConfidence)) return fallback
  return Math.min(Math.max(minConfidence, 0.2), 0.95)
}

export function parseFaceMatchSettingsFromMap(
  map: Map<string, unknown>,
  resolvePerformerMetaId: (configuredId: number | null) => number | null,
): FaceMatchSettingsValues {
  const configuredMeta = Number(map.get('faceMatch.performerMetaId') || 0)
  return {
    performerMetaId: resolvePerformerMetaId(configuredMeta || null),
    minConfidence: clampFaceMatchConfidence(map.get('faceMatch.minConfidence')),
    candidateLimit: clampCandidateLimit(map.get('faceMatch.candidateLimit') ?? DEFAULT_CANDIDATE_LIMIT),
    mode: parseFaceMatchMode(map.get('faceMatch.mode')),
    matchAfterDetect: parseBooleanSetting(map.get('faceMatch.matchAfterDetect'), true),
  }
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
