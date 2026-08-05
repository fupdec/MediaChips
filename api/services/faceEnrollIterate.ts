import type {FaceMatchProgressEvent} from './faceRecognition'
import {
  collectEnrollmentSourcePaths,
  filterPendingEnrollmentPaths,
} from './faceEnrollmentPaths'
import {MAX_ENROLLMENTS_PER_TAG} from './enrollmentGates'

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

export type EnrollTagFacesPlan =
  | {kind: 'skip'; reason: 'tag_not_found' | 'not_people_category'; metaId: number}
  | {kind: 'clear-empty'; metaId: number; clearEnrollments: boolean}
  | {kind: 'enroll'; metaId: number; imagePaths: string[]}

/** Decide enrollTagFaces work before loading detection/embed models. */
export function resolveEnrollTagFacesPlan(input: {
  tagFound: boolean
  metaId: number | null | undefined
  performerMetaId: number | null | undefined
  imagePaths: string[]
  force?: boolean
}): EnrollTagFacesPlan {
  if (!input.tagFound || input.metaId == null) {
    return {kind: 'skip', reason: 'tag_not_found', metaId: 0}
  }
  const metaId = Number(input.metaId)
  if (!input.performerMetaId || input.performerMetaId !== metaId) {
    return {kind: 'skip', reason: 'not_people_category', metaId}
  }
  if (!input.imagePaths.length) {
    return {
      kind: 'clear-empty',
      metaId,
      clearEnrollments: input.force !== false,
    }
  }
  return {kind: 'enroll', metaId, imagePaths: input.imagePaths}
}

export type IterateEnrollGate =
  | {ok: true; metaId: number}
  | {ok: false; event: FaceMatchProgressEvent}

/** Preflight before prepareEmbedModel / tag loop in iterateEnrollFromPerformerImages. */
export function resolveIterateEnrollGate(input: {
  performerMetaId: number | null | undefined
}): IterateEnrollGate {
  if (!input.performerMetaId) {
    return {
      ok: false,
      event: {type: 'error', message: 'Performer category is not configured.'},
    }
  }
  return {ok: true, metaId: Number(input.performerMetaId)}
}

export type EnrollTagPendingPrep = {
  existingSources: Set<string>
  pendingPaths: string[]
  skipReason: FaceEnrollTagSkipReason | null
}

/** Build pending gallery paths + early skip reason for one tag enroll iteration. */
export function prepareEnrollTagPending(input: {
  imagePaths: string[]
  existingRows: Array<{sourcePath?: string | null}>
  dbPath: string
  force?: boolean
}): EnrollTagPendingPrep {
  const existingSources = collectEnrollmentSourcePaths(input.existingRows)
  const pendingPaths = filterPendingEnrollmentPaths({
    imagePaths: input.imagePaths,
    existingSourcePaths: existingSources,
    dbPath: input.dbPath,
    force: input.force,
  })
  return {
    existingSources,
    pendingPaths,
    skipReason: getEnrollTagSkipReason({
      imageCount: input.imagePaths.length,
      pendingCount: pendingPaths.length,
    }),
  }
}

export type EnrollSourcePathDecision =
  | {kind: 'stop'}
  | {kind: 'skip-existing'}
  | {kind: 'enroll'; sourcePath: string}

/** Per-image gate inside enrollTagFromAllImages. */
export function resolveEnrollSourcePathDecision(input: {
  enrolledCount: number
  maxEnrollments?: number
  sourcePath: string
  imagePath: string
  enrolledSources: Iterable<string>
}): EnrollSourcePathDecision {
  const max = input.maxEnrollments ?? MAX_ENROLLMENTS_PER_TAG
  if (input.enrolledCount >= max) return {kind: 'stop'}
  const sources = input.enrolledSources instanceof Set
    ? input.enrolledSources
    : new Set(input.enrolledSources)
  if (sources.has(input.sourcePath) || sources.has(input.imagePath)) {
    return {kind: 'skip-existing'}
  }
  return {kind: 'enroll', sourcePath: input.sourcePath}
}

export type EnrollTagFacesResult = {
  tagId: number
  metaId: number
  created: number
  skipped: boolean
  reason?: string
}

export function buildEnrollTagFacesSkipResult(
  tagId: number,
  metaId: number,
  reason: string,
): EnrollTagFacesResult {
  return {tagId, metaId, created: 0, skipped: true, reason}
}

export function buildEnrollTagFacesClearResult(
  tagId: number,
  metaId: number,
): EnrollTagFacesResult {
  return {tagId, metaId, created: 0, skipped: false}
}

export function buildEnrollTagFacesCreatedResult(
  tagId: number,
  metaId: number,
  created: number,
): EnrollTagFacesResult {
  return {tagId, metaId, created, skipped: false}
}
