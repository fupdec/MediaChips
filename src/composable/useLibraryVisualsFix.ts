import {ref} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useTasksStore} from '@/stores/tasks'
import {setNotification} from '@/services/notificationService'
import translate, {type Locale} from '@/utils/translate'
import type {HomeHealthData} from '@/types/widgets'

export type LibraryVisualStage = 'preview' | 'grid' | 'marks' | 'image_thumbs'

export type LibraryVisualsFixState = {
  running: boolean
  stage: LibraryVisualStage | null
  processed: number
  total: number
  progress: number
}

function pendingForStage(health: HomeHealthData, stage: LibraryVisualStage): number {
  if (stage === 'image_thumbs') return Number(health.imageThumbs?.pending || 0)
  return Number(health.generatedImages?.byType?.[stage]?.pending || 0)
}

function stagesFromHealth(health: HomeHealthData): LibraryVisualStage[] {
  const stages: LibraryVisualStage[] = []
  for (const stage of ['preview', 'grid', 'marks'] as const) {
    if (pendingForStage(health, stage) > 0) stages.push(stage)
  }
  if (pendingForStage(health, 'image_thumbs') > 0) stages.push('image_thumbs')
  return stages
}

export function useLibraryVisualsFix() {
  const tasksStore = useTasksStore()
  const state = ref<LibraryVisualsFixState>({
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
    abortController = new AbortController()
    state.value = {running: true, stage: stages[0], processed: 0, total: 0, progress: 0}

    const taskId = tasksStore.setTask({
      title: tr('home.widgets.health_make_library_look_good'),
      subtitle: tr(`home.widgets.health_make_library_look_good_stage_${stages[0]}`),
      icon: 'image-auto-adjust',
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

        const stageLabel = tr(`home.widgets.health_make_library_look_good_stage_${stage}`)
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
              subtitle: tr('home.widgets.health_make_library_look_good_progress', {
                stage: stageLabel,
                processed,
                total,
              }),
              progress: state.value.progress,
            })
          }
          if (event.type === 'error') {
            throw new Error(event.message || 'Visual generation failed')
          }
        }

        if (stage === 'image_thumbs') {
          await typedApi.streamImageThumbsGeneration(
            {force: false, signal: abortController.signal},
            onEvent,
          )
        } else {
          await typedApi.streamVideoImagesGeneration(
            {type: stage, force: false, signal: abortController.signal},
            onEvent,
          )
        }
      }

      tasksStore.updateTask(taskId, {
        subtitle: tr('home.widgets.health_make_library_look_good_done'),
        progress: 100,
        color: 'success',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'success',
        title: tr('home.widgets.health_make_library_look_good'),
        text: tr('home.widgets.health_make_library_look_good_done'),
        icon: 'image-auto-adjust',
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
        title: tr('home.widgets.health_make_library_look_good'),
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
  }
}
