import type {FaceDetectionProgressEvent} from '../types/faceDetector'

export type FaceDetectIterateCounters = {
  processed: number
  created: number
  skipped: number
  missing: number
  failed: number
  faces: number
}

export type FaceDetectMediaOutcome = {
  missing?: boolean
  failed?: boolean
  skipped?: boolean
  facesLength: number
}

export function createFaceDetectIterateCounters(): FaceDetectIterateCounters {
  return {processed: 0, created: 0, skipped: 0, missing: 0, failed: 0, faces: 0}
}

export function applyFaceDetectMediaResult(
  counters: FaceDetectIterateCounters,
  result: FaceDetectMediaOutcome,
): FaceDetectIterateCounters {
  const next = {
    ...counters,
    processed: counters.processed + 1,
    faces: counters.faces + result.facesLength,
  }
  if (result.missing) next.missing += 1
  else if (result.failed) next.failed += 1
  else if (result.skipped) next.skipped += 1
  else next.created += 1
  return next
}

export function buildFaceDetectProgressEvent(
  counters: FaceDetectIterateCounters,
  total: number,
  extra: Partial<FaceDetectionProgressEvent> = {},
): FaceDetectionProgressEvent {
  return {
    type: 'progress',
    processed: counters.processed,
    total,
    remaining: Math.max(total - counters.processed, 0),
    created: counters.created,
    skipped: counters.skipped,
    missing: counters.missing,
    failed: counters.failed,
    faces: counters.faces,
    ...extra,
  }
}

export function buildFaceDetectCompleteEvent(
  counters: FaceDetectIterateCounters,
  total: number,
  stopped: boolean,
): FaceDetectionProgressEvent {
  return {
    type: 'complete',
    processed: counters.processed,
    total,
    created: counters.created,
    skipped: counters.skipped,
    missing: counters.missing,
    failed: counters.failed,
    faces: counters.faces,
    stopped,
  }
}

export function buildFaceDetectErrorEvent(
  error: unknown,
  fallback: string,
): FaceDetectionProgressEvent {
  return {
    type: 'error',
    message: error instanceof Error ? error.message : fallback,
  }
}

/** Settings passed to matchMediaFaces after detect, or null when matching is skipped. */
export function resolveMatchSettingsAfterDetect<T extends {
  matchAfterDetect: boolean
  performerMetaId: number | null
  mode: string
}>(input: {
  matchSettings: T
  applyTags?: boolean
}): T | null {
  const {matchSettings} = input
  if (!matchSettings.matchAfterDetect || !matchSettings.performerMetaId) return null
  if (input.applyTags === false) {
    return {...matchSettings, mode: 'suggest' as T['mode']}
  }
  return matchSettings
}
