import {
  DEFAULT_FACE_CANDIDATE_LIMIT,
  clampFaceCandidateLimit,
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
  clampFaceMatchConfidence,
  normalizeGenderFilter,
  parseFaceMatchAfterDetect,
  parseFaceMatchMode,
  type FaceGenderFilter,
  type FaceMatchMode,
} from '../../shared/faceSettings'

export {
  clampFaceCandidateLimit as clampCandidateLimit,
  clampFaceDetectFramesPerVideo,
  clampFaceDetectMinScore,
  clampFaceMatchConfidence,
  normalizeGenderFilter,
  parseFaceMatchMode,
  parseFaceMatchAfterDetect,
  DEFAULT_FACE_CANDIDATE_LIMIT as DEFAULT_CANDIDATE_LIMIT,
}
export type {FaceGenderFilter, FaceMatchMode}

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

export function parseFaceMatchSettingsFromMap(
  map: Map<string, unknown>,
  resolvePerformerMetaId: (configuredId: number | null) => number | null,
): FaceMatchSettingsValues {
  const configuredMeta = Number(map.get('faceMatch.performerMetaId') || 0)
  return {
    performerMetaId: resolvePerformerMetaId(configuredMeta || null),
    minConfidence: clampFaceMatchConfidence(map.get('faceMatch.minConfidence')),
    candidateLimit: clampFaceCandidateLimit(
      map.get('faceMatch.candidateLimit') ?? DEFAULT_FACE_CANDIDATE_LIMIT,
    ),
    mode: parseFaceMatchMode(map.get('faceMatch.mode')),
    matchAfterDetect: parseFaceMatchAfterDetect(map.get('faceMatch.matchAfterDetect'), true),
  }
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
