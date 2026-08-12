import type {HomeHealthData} from '@/types/widgets'
import type {HomeHealthQueueItemId} from '@shared/entities/widgets-ui'
import type {LibraryHealthFixStage} from '@/composable/useLibraryHealthFixQueue'
import {getReadableDuration} from '@/services/formatUtils'

/** Rough local-machine seconds per pending item (heuristic, not measured). */
export const LIBRARY_SETUP_SECONDS_PER_ITEM: Record<string, number> = {
  preview: 0.9,
  grid: 1.6,
  marks: 0.45,
  image_thumbs: 0.12,
  fingerprint: 0.04,
  codec: 0.25,
  clip: 0.85,
  faces: 2.2,
  duplicates: 0, // review is manual
  tagUpscale: 1.1,
  missing: 0,
  visuals: 0, // computed from byType
}

function clampEta(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0
  return Math.max(1, Math.round(seconds))
}

function pendingVisual(health: HomeHealthData, stage: 'preview' | 'grid' | 'marks'): number {
  return Number(health.generatedImages?.byType?.[stage]?.pending || 0)
}

export function estimateStageEtaSeconds(
  stage: LibraryHealthFixStage,
  health: HomeHealthData,
  pendingOverride?: number,
): number {
  const pending = pendingOverride != null
    ? pendingOverride
    : stage === 'fingerprint'
      ? Number(health.fingerprint?.pending || 0)
      : stage === 'codec'
        ? Number(health.videoCodec?.pending || 0)
        : stage === 'clip'
          ? Number(health.clip?.pending || 0)
          : stage === 'image_thumbs'
            ? Number(health.imageThumbs?.pending || 0)
            : pendingVisual(health, stage)

  if (pending <= 0) return 0
  const rate = LIBRARY_SETUP_SECONDS_PER_ITEM[stage] || 0.5
  return clampEta(pending * rate)
}

export function estimateStagesEtaSeconds(
  stages: LibraryHealthFixStage[],
  health: HomeHealthData,
): number {
  return stages.reduce((sum, stage) => sum + estimateStageEtaSeconds(stage, health), 0)
}

export function estimateTaskEtaSeconds(
  taskId: HomeHealthQueueItemId,
  health: HomeHealthData,
): number {
  if (taskId === 'visuals') {
    return estimateStageEtaSeconds('preview', health)
      + estimateStageEtaSeconds('grid', health)
      + estimateStageEtaSeconds('marks', health)
      + estimateStageEtaSeconds('image_thumbs', health)
  }
  if (taskId === 'fingerprint') return estimateStageEtaSeconds('fingerprint', health)
  if (taskId === 'codec') return estimateStageEtaSeconds('codec', health)
  if (taskId === 'clip') return estimateStageEtaSeconds('clip', health)
  if (taskId === 'faces') {
    const pending = Number(health.faces?.pending || 0)
    if (pending <= 0) return 0
    return clampEta(pending * LIBRARY_SETUP_SECONDS_PER_ITEM.faces)
  }
  if (taskId === 'tagUpscale') {
    const pending = Number(health.tagImageAiUpscale?.pendingCount || 0)
    if (pending <= 0) return 0
    return clampEta(pending * LIBRARY_SETUP_SECONDS_PER_ITEM.tagUpscale)
  }
  // duplicates / missing: manual or instant
  return 0
}

/** Live ETA from observed throughput (same pattern as AddingMedia). */
export function estimateLiveEtaSeconds(input: {
  processed: number
  total: number
  elapsedSeconds: number
}): number {
  const processed = Math.max(0, Number(input.processed) || 0)
  const total = Math.max(0, Number(input.total) || 0)
  const elapsed = Math.max(0, Number(input.elapsedSeconds) || 0)
  if (processed <= 0 || total <= processed || elapsed <= 0) return 0
  return clampEta((elapsed / processed) * (total - processed))
}

export function formatLibrarySetupEta(seconds: number): string {
  if (!seconds || seconds <= 0) return ''
  return getReadableDuration(seconds)
}
