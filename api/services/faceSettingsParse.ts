import {
  DEFAULT_CANDIDATE_LIMIT,
  clampCandidateLimit,
} from './faceMatchScoring'
import type {FaceMatchMode} from './faceMatchApply'
import {parseBooleanSetting} from '../utils/parseBooleanSetting'
import {
  normalizeGenderFilter,
  type FaceGenderFilter,
} from './faceGenderFilter'

export type FaceMatchSettingsValues = {
  performerMetaId: number | null
  minConfidence: number
  candidateLimit: number
  mode: FaceMatchMode
  matchAfterDetect: boolean
}

export type FaceDetectSettingsValues = {
  minScore: number
  framesPerVideo: number
  genderFilter: FaceGenderFilter
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

export function parseFaceDetectSettingsFromMap(
  map: Map<string, unknown>,
  defaultMinScore = 0.5,
): FaceDetectSettingsValues {
  return {
    minScore: clampFaceDetectMinScore(map.get('faceDetect.minScore'), defaultMinScore),
    framesPerVideo: clampFaceDetectFramesPerVideo(map.get('faceDetect.framesPerVideo'), 6),
    genderFilter: normalizeGenderFilter(map.get('faceDetect.genderFilter')),
  }
}

export function resolveFaceDetectRuntimeOptions<T extends {
  framesPerVideo?: number
  minScore?: number
  persistCrops?: boolean
}>(
  options: T,
  settings: {framesPerVideo: number; minScore: number},
): T & {persistCrops: boolean; framesPerVideo: number; minScore: number} {
  const framesRaw = Number(
    options.framesPerVideo != null ? options.framesPerVideo : settings.framesPerVideo,
  )
  const scoreRaw = Number(
    options.minScore != null ? options.minScore : settings.minScore,
  )
  return {
    ...options,
    persistCrops: Boolean(options.persistCrops),
    framesPerVideo: Number.isFinite(framesRaw)
      ? clampFaceDetectFramesPerVideo(framesRaw, settings.framesPerVideo)
      : settings.framesPerVideo,
    minScore: Number.isFinite(scoreRaw)
      ? clampFaceDetectMinScore(scoreRaw, settings.minScore)
      : settings.minScore,
  }
}
