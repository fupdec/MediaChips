import type {HomeHealthData} from '@/types/widgets'
import type {HomeHealthQueueItemId} from '@shared/entities/widgets-ui'
import {
  hasOnlyVisualStages,
  stagesFromHealth,
  type LibraryHealthFixStage,
} from '@/composable/useLibraryHealthFixQueue'
import {estimateTaskEtaSeconds} from '@/composable/librarySetupEta'

export type LibrarySetupPhaseId = 'visuals' | 'reliability' | 'search' | 'optional'

export type LibrarySetupTask = {
  id: HomeHealthQueueItemId
  titleKey: string
  icon: string
  settingsSection: string
  done: boolean
  count: number
  weight: number
  tip?: boolean
  clipModelNeeded?: boolean
  /** Heuristic remaining seconds (0 = unknown / N/A). */
  etaSeconds: number
}

export type LibrarySetupPhase = {
  id: LibrarySetupPhaseId
  titleKey: string
  hintKey: string
  icon: string
  /** Safe stages that auto-run for this phase (empty for optional). */
  stages: LibraryHealthFixStage[]
  tasks: LibrarySetupTask[]
  done: boolean
  pendingCount: number
  autoFixable: boolean
  clipModelNeeded?: boolean
  /** Sum of task heuristic ETAs still pending. */
  etaSeconds: number
}

const PHASE_META: Record<LibrarySetupPhaseId, {
  titleKey: string
  hintKey: string
  icon: string
}> = {
  visuals: {
    titleKey: 'settings_labels.database.health_guide_phase_visuals',
    hintKey: 'settings_labels.database.health_guide_phase_visuals_hint',
    icon: 'mdi-image-multiple-outline',
  },
  reliability: {
    titleKey: 'settings_labels.database.health_guide_phase_reliability',
    hintKey: 'settings_labels.database.health_guide_phase_reliability_hint',
    icon: 'mdi-shield-check-outline',
  },
  search: {
    titleKey: 'settings_labels.database.health_guide_phase_search',
    hintKey: 'settings_labels.database.health_guide_phase_search_hint',
    icon: 'mdi-magnify-scan',
  },
  optional: {
    titleKey: 'settings_labels.database.health_guide_phase_optional',
    hintKey: 'settings_labels.database.health_guide_phase_optional_hint',
    icon: 'mdi-tune-variant',
  },
}

const TASK_META: Record<HomeHealthQueueItemId, {
  titleKey: string
  icon: string
  settingsSection: string
  phase: LibrarySetupPhaseId
  weight: number
  tip?: boolean
}> = {
  visuals: {
    titleKey: 'settings_labels.database.health_guide_step_visuals',
    icon: 'mdi-image-multiple-outline',
    settingsSection: 'generate_video_images',
    phase: 'visuals',
    weight: 25,
  },
  fingerprint: {
    titleKey: 'settings_labels.database.health_guide_step_fingerprint',
    icon: 'mdi-fingerprint',
    settingsSection: 'oshash_backfill',
    phase: 'reliability',
    weight: 15,
  },
  codec: {
    titleKey: 'settings_labels.database.health_guide_step_codec',
    icon: 'mdi-movie-filter-outline',
    settingsSection: 'video_codec_backfill',
    phase: 'reliability',
    weight: 10,
  },
  clip: {
    titleKey: 'settings_labels.database.health_guide_step_clip',
    icon: 'mdi-brain',
    settingsSection: 'clip_embedding_backfill',
    phase: 'search',
    weight: 20,
  },
  faces: {
    titleKey: 'settings_labels.database.health_guide_step_faces',
    icon: 'mdi-face-recognition',
    settingsSection: 'detect_faces',
    phase: 'optional',
    weight: 10,
  },
  duplicates: {
    titleKey: 'settings_labels.database.health_guide_step_duplicates',
    icon: 'mdi-content-copy',
    settingsSection: 'find_duplicates',
    phase: 'optional',
    weight: 15,
  },
  tagUpscale: {
    titleKey: 'settings_labels.database.health_guide_step_tag_upscale',
    icon: 'mdi-image-auto-adjust',
    settingsSection: 'tag_image_ai_upscale',
    phase: 'optional',
    weight: 5,
  },
  missing: {
    titleKey: 'settings_labels.database.health_guide_step_missing',
    icon: 'mdi-folder-search-outline',
    settingsSection: 'find_missing',
    phase: 'optional',
    weight: 0,
    tip: true,
  },
}

const STAGE_TO_PHASE: Record<LibraryHealthFixStage, LibrarySetupPhaseId> = {
  preview: 'visuals',
  grid: 'visuals',
  marks: 'visuals',
  image_thumbs: 'visuals',
  fingerprint: 'reliability',
  codec: 'reliability',
  clip: 'search',
}

const PHASE_ORDER: LibrarySetupPhaseId[] = ['visuals', 'reliability', 'search', 'optional']

function visualsPending(data: HomeHealthData): number {
  const types = ['preview', 'grid', 'marks'] as const
  let pending = 0
  for (const key of types) {
    pending += Number(data.generatedImages?.byType?.[key]?.pending || 0)
  }
  pending += Number(data.imageThumbs?.pending || 0)
  return pending
}

function duplicateCount(data: HomeHealthData): number {
  return Math.max(
    Number(data.duplicates?.byFilesize || 0),
    Number(data.duplicates?.byFingerprint || 0),
    Number(data.duplicates?.byVisualHash || 0),
  )
}

function isClipModelReady(modelStatus?: string): boolean {
  return modelStatus === 'downloaded'
    || modelStatus === 'loaded'
    || modelStatus === 'loading'
}

export function phaseIdFromStage(stage: LibraryHealthFixStage | null | undefined): LibrarySetupPhaseId | null {
  if (!stage) return null
  return STAGE_TO_PHASE[stage] || null
}

export function isLibrarySetupPhaseId(value: unknown): value is LibrarySetupPhaseId {
  return value === 'visuals'
    || value === 'reliability'
    || value === 'search'
    || value === 'optional'
}

export function buildLibrarySetupTasks(health: HomeHealthData): LibrarySetupTask[] {
  const visualsCount = visualsPending(health)
  const fingerprintCount = Number(health.fingerprint?.pending || 0)
  const codecCount = Number(health.videoCodec?.pending || 0)
  const clipCount = Number(health.clip?.pending || 0)
  const facesCount = Number(health.faces?.pending || 0)
  const dupCount = duplicateCount(health)
  const tagUpscale = health.tagImageAiUpscale
  const tagUpscalePending = !tagUpscale.done
    && (tagUpscale.suggested || Number(tagUpscale.pendingCount) > 0)
  const clipReady = isClipModelReady(health.clip?.modelStatus)

  const counts: Record<HomeHealthQueueItemId, {done: boolean, count: number, clipModelNeeded?: boolean}> = {
    visuals: {done: visualsCount <= 0, count: visualsCount},
    fingerprint: {done: fingerprintCount <= 0, count: fingerprintCount},
    codec: {done: codecCount <= 0, count: codecCount},
    clip: {
      done: clipCount <= 0,
      count: clipCount,
      clipModelNeeded: clipCount > 0 && !clipReady,
    },
    faces: {done: facesCount <= 0, count: facesCount},
    duplicates: {done: dupCount <= 0, count: dupCount},
    tagUpscale: {
      done: !tagUpscalePending,
      count: Number(tagUpscale.pendingCount) || 0,
    },
    missing: {done: false, count: 0},
  }

  return (Object.keys(TASK_META) as HomeHealthQueueItemId[]).map((id) => {
    const meta = TASK_META[id]
    const state = counts[id]
    const etaSeconds = state.done ? 0 : estimateTaskEtaSeconds(id, health)
    return {
      id,
      titleKey: meta.titleKey,
      icon: meta.icon,
      settingsSection: meta.settingsSection,
      done: state.done,
      count: state.count,
      weight: meta.weight,
      tip: meta.tip,
      clipModelNeeded: state.clipModelNeeded,
      etaSeconds,
    }
  })
}

function stagesForPhase(
  phaseId: LibrarySetupPhaseId,
  allStages: LibraryHealthFixStage[],
): LibraryHealthFixStage[] {
  return allStages.filter((stage) => STAGE_TO_PHASE[stage] === phaseId)
}

export function buildLibrarySetupPhases(health: HomeHealthData): LibrarySetupPhase[] {
  const tasks = buildLibrarySetupTasks(health)
  const autoStages = stagesFromHealth(health)

  return PHASE_ORDER.map((phaseId) => {
    const meta = PHASE_META[phaseId]
    const phaseTasks = tasks.filter((task) => TASK_META[task.id].phase === phaseId)
    const scoredTasks = phaseTasks.filter((task) => !task.tip)
    const pendingCount = scoredTasks.reduce((sum, task) => sum + (task.done ? 0 : task.count), 0)
    const done = scoredTasks.length > 0 && scoredTasks.every((task) => task.done)
    const stages = stagesForPhase(phaseId, autoStages)
    const clipModelNeeded = phaseTasks.some((task) => task.clipModelNeeded)
    const etaSeconds = phaseTasks.reduce((sum, task) => {
      if (task.done || task.tip) return sum
      return sum + task.etaSeconds
    }, 0)

    return {
      id: phaseId,
      titleKey: meta.titleKey,
      hintKey: meta.hintKey,
      icon: meta.icon,
      stages,
      tasks: phaseTasks,
      done,
      pendingCount,
      autoFixable: stages.length > 0,
      clipModelNeeded,
      etaSeconds,
    }
  })
}

export function nextLibrarySetupPhase(phases: LibrarySetupPhase[]): LibrarySetupPhase | null {
  return phases.find((phase) => phase.id !== 'optional' && !phase.done)
    || phases.find((phase) => phase.id === 'optional' && !phase.done)
    || null
}

/** True when visuals / reliability / search still have pending setup work. */
export function isEssentialLibrarySetupPending(health: HomeHealthData): boolean {
  return buildLibrarySetupPhases(health).some((phase) => phase.id !== 'optional' && !phase.done)
}

export function primaryPrepareLibraryLabelKey(
  stages: LibraryHealthFixStage[],
  phases: LibrarySetupPhase[],
): string {
  if (hasOnlyVisualStages(stages)) {
    return 'home.widgets.health_make_library_look_good'
  }
  const essential = phases.filter((phase) => phase.id !== 'optional')
  const anyEssentialDone = essential.some((phase) => phase.done)
  const anyEssentialPending = essential.some((phase) => !phase.done)
  if (anyEssentialDone && anyEssentialPending) {
    return 'home.widgets.health_prepare_library_continue'
  }
  return 'home.widgets.health_prepare_library'
}

export function totalLibrarySetupEtaSeconds(phases: LibrarySetupPhase[]): number {
  return phases.reduce((sum, phase) => {
    if (phase.id === 'optional') return sum
    return sum + (phase.done ? 0 : phase.etaSeconds)
  }, 0)
}

export function openLibrarySetupWizardQuery(step?: LibrarySetupPhaseId): Record<string, string> {
  const query: Record<string, string> = {
    tab: 'database',
    section: 'library_health_guide',
  }
  if (step) query.wizardStep = step
  return query
}
