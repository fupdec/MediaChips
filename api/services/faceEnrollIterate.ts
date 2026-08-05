import type {FaceMatchProgressEvent} from './faceRecognition'

export type FaceEnrollIterateCounters = {
  processed: number
  enrolled: number
  skipped: number
  failed: number
}

export type FaceEnrollTagSkipReason = 'skip-no-images' | 'skip-no-pending'

export type FaceEnrollTagOutcome =
  | FaceEnrollTagSkipReason
  | 'enrolled'
  | 'skip-unchanged'
  | 'failed'

export function createFaceEnrollIterateCounters(): FaceEnrollIterateCounters {
  return {processed: 0, enrolled: 0, skipped: 0, failed: 0}
}

/** Early-exit reason before attempting enrollment, or null when work remains. */
export function getEnrollTagSkipReason(input: {
  imageCount: number
  pendingCount: number
}): FaceEnrollTagSkipReason | null {
  if (input.imageCount <= 0) return 'skip-no-images'
  if (input.pendingCount <= 0) return 'skip-no-pending'
  return null
}

export function classifyEnrollAttempt(input: {
  created: number
  failed?: boolean
}): Exclude<FaceEnrollTagOutcome, FaceEnrollTagSkipReason> {
  if (input.failed) return 'failed'
  if (input.created > 0) return 'enrolled'
  return 'skip-unchanged'
}

export function applyFaceEnrollTagOutcome(
  counters: FaceEnrollIterateCounters,
  outcome: FaceEnrollTagOutcome,
): FaceEnrollIterateCounters {
  const next = {
    ...counters,
    processed: counters.processed + 1,
  }
  if (outcome === 'enrolled') next.enrolled += 1
  else if (outcome === 'failed') next.failed += 1
  else next.skipped += 1
  return next
}

export function buildFaceEnrollProgressEvent(
  counters: FaceEnrollIterateCounters,
  total: number,
  extra: Partial<FaceMatchProgressEvent> = {},
): FaceMatchProgressEvent {
  return {
    type: 'progress',
    processed: counters.processed,
    total,
    remaining: Math.max(total - counters.processed, 0),
    enrolled: counters.enrolled,
    skipped: counters.skipped,
    failed: counters.failed,
    ...extra,
  }
}

export function buildFaceEnrollCompleteEvent(
  counters: FaceEnrollIterateCounters,
  total: number,
  stopped: boolean,
): FaceMatchProgressEvent {
  return {
    type: 'complete',
    processed: counters.processed,
    total,
    enrolled: counters.enrolled,
    skipped: counters.skipped,
    failed: counters.failed,
    stopped,
  }
}
