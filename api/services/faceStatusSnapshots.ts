import type {FaceDetectionGenerationStatus} from '../types/faceDetector'
import type {ModelStatus} from '../types/mlModels'
import type {FaceMatchSettingsValues} from './faceSettingsParse'

/** Pure payload for GET face detection generation status. */
export function buildFaceDetectionStatusSnapshot(input: {
  total: number
  generated: number
  faces: number
}): FaceDetectionGenerationStatus {
  return {
    total: input.total,
    generated: input.generated,
    pending: Math.max(input.total - input.generated, 0),
    faces: input.faces,
  }
}

/** Pure payload for GET face match status. */
export function buildFaceMatchStatusSnapshot(input: {
  settings: FaceMatchSettingsValues
  embedModel: ModelStatus
  faces: number
  matchedFaces: number
  performerTags: number
  enrolledFaces: number
  enrolledTags: number
}) {
  return {
    settings: input.settings,
    embedModel: input.embedModel,
    faces: input.faces,
    matchedFaces: input.matchedFaces,
    performerTags: input.performerTags,
    enrolledFaces: input.enrolledFaces,
    enrolledTags: input.enrolledTags,
  }
}

/** Prefer configured performer meta id, else first scraper array meta. */
export function resolveConfiguredOrScraperMetaId(
  configuredId: number | null | undefined,
  metas: Array<{id?: number | null; scraper?: unknown; type?: string | null}>,
): number | null {
  if (configuredId && Number.isFinite(configuredId) && configuredId > 0) {
    return configuredId
  }
  const scraperMeta = metas.find((meta) => Boolean(meta.scraper) && meta.type === 'array')
  return scraperMeta?.id != null ? Number(scraperMeta.id) : null
}
