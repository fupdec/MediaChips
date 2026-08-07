import {ref} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useTasksStore} from '@/stores/tasks'
import {setNotification} from '@/services/notificationService'
import translate, {type Locale} from '@/utils/translate'
import type {HomeHealthData} from '@/types/widgets'

export type LibraryHealthFixStage =
  | 'preview'
  | 'grid'
  | 'marks'
  | 'image_thumbs'
  | 'fingerprint'
  | 'codec'
  | 'clip'

export type LibraryHealthFixState = {
  running: boolean
  stage: LibraryHealthFixStage | null
  processed: number
  total: number
  progress: number
}

function pendingForVisualStage(health: HomeHealthData, stage: 'preview' | 'grid' | 'marks' | 'image_thumbs'): number {
  if (stage === 'image_thumbs') return Number(health.imageThumbs?.pending || 0)
  return Number(health.generatedImages?.byType?.[stage]?.pending || 0)
}

function visualStagesFromHealth(health: HomeHealthData): LibraryHealthFixStage[] {
  const stages: LibraryHealthFixStage[] = []
  for (const stage of ['preview', 'grid', 'marks'] as const) {
    if (pendingForVisualStage(health, stage) > 0) stages.push(stage)
  }
  if (pendingForVisualStage(health, 'image_thumbs') > 0) stages.push('image_thumbs')
  return stages
}

/** Safe auto-fix stages: visuals → fingerprint → codec → clip (when model ready). */
export function stagesFromHealth(health: HomeHealthData): LibraryHealthFixStage[] {
  const stages = visualStagesFromHealth(health)
  const queue = health.queue || []

  const fingerprintItem = queue.find((item) => item.id === 'fingerprint')
  if (Number(health.fingerprint?.pending || 0) > 0 && (!fingerprintItem || fingerprintItem.autoFixable)) {
    stages.push('fingerprint')
  }

  const codecItem = queue.find((item) => item.id === 'codec')
  if (Number(health.videoCodec?.pending || 0) > 0 && (!codecItem || codecItem.autoFixable)) {
    stages.push('codec')
  }

  const clipItem = queue.find((item) => item.id === 'clip')
  const clipReady = clipItem?.autoFixable
    || (!clipItem && ['downloaded', 'loaded', 'loading'].includes(health.clip?.modelStatus || ''))
  if (Number(health.clip?.pending || 0) > 0 && clipReady) {
    stages.push('clip')
  }

  return stages
}

export function hasOnlyVisualStages(stages: LibraryHealthFixStage[]): boolean {
  return stages.length > 0 && stages.every((stage) =>
    stage === 'preview' || stage === 'grid' || stage === 'marks' || stage === 'image_thumbs',
  )
}

function pendingForStage(health: HomeHealthData, stage: LibraryHealthFixStage): number {
  if (stage === 'fingerprint') return Number(health.fingerprint?.pending || 0)
  if (stage === 'codec') return Number(health.videoCodec?.pending || 0)
  if (stage === 'clip') return Number(health.clip?.pending || 0)
  return pendingForVisualStage(health, stage)
}

function stageI18nKey(stage: LibraryHealthFixStage): string {
  return `home.widgets.health_fix_stage_${stage}`
}

export function useLibraryHealthFixQueue() {
  const tasksStore = useTasksStore()
  const state = ref<LibraryHealthFixState>({
    running: false,
    stage: null,
    processed: 0,
    total: 0,
    progress: 0,
  })
  let abortController: AbortController | null = null

  function stop() {
    abortController?.abort()
  }

  async function run(health: HomeHealthData, locale: Locale): Promise<boolean> {
    if (state.value.running) return false
    const stages = stagesFromHealth(health)
    if (!stages.length) return false

    const tr = (key: string, params: Record<string, string | number> = {}) => translate(key, params, locale)
    const titleKey = hasOnlyVisualStages(stages)
      ? 'home.widgets.health_make_library_look_good'
      : 'home.widgets.health_fix_safe_issues'

    abortController = new AbortController()
    state.value = {running: true, stage: stages[0], processed: 0, total: 0, progress: 0}

    const taskId = tasksStore.setTask({
      title: tr(titleKey),
      subtitle: tr(stageI18nKey(stages[0])),
      icon: 'heart-pulse',
      progress: 0,
      action: () => abortController?.abort(),
    })

    try {
      for (let index = 0; index < stages.length; index += 1) {
        const stage = stages[index]
        state.value.stage = stage
        state.value.processed = 0
        state.value.total = pendingForStage(health, stage)
        state.value.progress = (index / stages.length) * 100

        const stageLabel = tr(stageI18nKey(stage))
        tasksStore.updateTask(taskId, {
          subtitle: stageLabel,
          progress: state.value.progress,
        })

        const onEvent = (event: {
          type?: string
          processed?: number
          total?: number
          message?: string
          stopped?: boolean
        }) => {
          if (event.type === 'progress' || event.type === 'item') {
            const processed = Number(event.processed) || 0
            const total = Number(event.total) || state.value.total || 1
            state.value.processed = processed
            state.value.total = total
            const stageProgress = total > 0 ? processed / total : 1
            state.value.progress = ((index + stageProgress) / stages.length) * 100
            tasksStore.updateTask(taskId, {
              subtitle: tr('home.widgets.health_fix_safe_progress', {
                stage: stageLabel,
                processed,
                total,
              }),
              progress: state.value.progress,
            })
          }
          if (event.type === 'error') {
            throw new Error(event.message || 'Health fix failed')
          }
        }

        if (stage === 'image_thumbs') {
          await typedApi.streamImageThumbsGeneration(
            {force: false, signal: abortController.signal},
            onEvent,
          )
        } else if (stage === 'preview' || stage === 'grid' || stage === 'marks') {
          await typedApi.streamVideoImagesGeneration(
            {type: stage, force: false, signal: abortController.signal},
            onEvent,
          )
        } else if (stage === 'fingerprint') {
          await typedApi.streamBackfill('fingerprint', {force: false, signal: abortController.signal}, onEvent)
        } else if (stage === 'codec') {
          await typedApi.streamBackfill('videoCodec', {force: false, signal: abortController.signal}, onEvent)
        } else if (stage === 'clip') {
          await typedApi.streamBackfill('clipEmbedding', {force: false, signal: abortController.signal}, onEvent)
        }
      }

      const doneKey = hasOnlyVisualStages(stages)
        ? 'home.widgets.health_make_library_look_good_done'
        : 'home.widgets.health_fix_safe_done'

      tasksStore.updateTask(taskId, {
        subtitle: tr(doneKey),
        progress: 100,
        color: 'success',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'success',
        title: tr(titleKey),
        text: tr(doneKey),
        icon: 'heart-pulse',
      })
      return true
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        tasksStore.updateTask(taskId, {
          subtitle: tr('common.stop'),
          color: 'warning',
          done: true,
          action: undefined,
        })
        return false
      }
      const message = error instanceof Error ? error.message : String(error)
      tasksStore.updateTask(taskId, {
        subtitle: message,
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: tr(titleKey),
        text: message,
      })
      return false
    } finally {
      state.value.running = false
      state.value.stage = null
      abortController = null
    }
  }

  return {
    state,
    stop,
    run,
    stagesFromHealth,
    hasOnlyVisualStages,
  }
}

/** @deprecated Use useLibraryHealthFixQueue — kept for visuals-only callers. */
export function useLibraryVisualsFix() {
  return useLibraryHealthFixQueue()
}
