import type {FaceMatchProgressEvent} from './faceRecognition'

export type FaceMatchIterateCounters = {
  processed: number
  matched: number
  applied: number
  skipped: number
  failed: number
}

export type FaceMatchMediaResult = {
  matched: number
  applied: number
  skipped: number
  faces: number
  error?: string
}

export function createFaceMatchIterateCounters(): FaceMatchIterateCounters {
  return {processed: 0, matched: 0, applied: 0, skipped: 0, failed: 0}
}

export function applyFaceMatchMediaResult(
  counters: FaceMatchIterateCounters,
  result: FaceMatchMediaResult,
): FaceMatchIterateCounters {
  return {
    processed: counters.processed + 1,
    matched: counters.matched + result.matched,
    applied: counters.applied + result.applied,
    skipped: counters.skipped + result.skipped,
    failed: counters.failed + (result.error && !result.faces ? 1 : 0),
  }
}

export function markFaceMatchIterateFailed(
  counters: FaceMatchIterateCounters,
): FaceMatchIterateCounters {
  return {
    ...counters,
    processed: counters.processed + 1,
    failed: counters.failed + 1,
  }
}

export function buildFaceMatchProgressEvent(
  counters: FaceMatchIterateCounters,
  total: number,
  extra: Partial<FaceMatchProgressEvent> = {},
): FaceMatchProgressEvent {
  return {
    type: 'progress',
    processed: counters.processed,
    total,
    remaining: Math.max(total - counters.processed, 0),
    matched: counters.matched,
    applied: counters.applied,
    skipped: counters.skipped,
    failed: counters.failed,
    ...extra,
  }
}

export function buildFaceMatchCompleteEvent(
  counters: FaceMatchIterateCounters,
  total: number,
  stopped: boolean,
): FaceMatchProgressEvent {
  return {
    type: 'complete',
    processed: counters.processed,
    total,
    matched: counters.matched,
    applied: counters.applied,
    skipped: counters.skipped,
    failed: counters.failed,
    stopped,
  }
}
