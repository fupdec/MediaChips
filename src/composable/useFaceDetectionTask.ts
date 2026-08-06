import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {useDialogsStore} from '@/stores/dialogs'
import {useTasksStore} from '@/stores/tasks'
import translate, {type Locale} from '@/utils/translate'
import {
  isFaceDetectModelReady,
  reduceFaceDetectStreamEvent,
  resolveFaceDetectApplyTags,
  type FaceDetectStreamState,
} from '@/utils/faceDetectStreamUi'

export type FaceDetectionTaskMedia = {
  id?: number | string | null
}

export type RunFaceDetectionForMediaIdsOptions = {
  mediaIds: number[]
  locale: Locale
  /** When set and ids.length === 1, open saved faces instead of rescanning. */
  contextItem?: FaceDetectionTaskMedia | null
  reloadMediaItems: (ids: number[]) => void
}

/**
 * Context-menu / selection face detection: ensure models, stream progress into a
 * cancellable task, then open review (single) or reload list (multi).
 */
export async function runFaceDetectionForMediaIds(
  options: RunFaceDetectionForMediaIdsOptions,
): Promise<void> {
  const ids = options.mediaIds.map(Number).filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) return

  const tr = (key: string, params: Record<string, string | number> = {}) => (
    translate(key, params, options.locale)
  )
  const dialogsStore = useDialogsStore()
  const tasksStore = useTasksStore()

  if (ids.length === 1 && options.contextItem) {
    try {
      const existing = await typedApi.getFacesForMedia(ids[0], {ensureCrops: false})
      const faces = Array.isArray(existing.data?.faces) ? existing.data.faces : []
      if (faces.length > 0) {
        dialogsStore.openFaceResults(options.contextItem as never)
        return
      }
    } catch (error) {
      console.error('Failed to load existing faces:', error)
    }
  }

  const controller = new AbortController()
  const taskId = tasksStore.setTask({
    title: tr('context_menu.detect_faces'),
    subtitle: tr('media.adding.face_detection_progress', {
      processed: 0,
      total: ids.length,
      remaining: ids.length,
    }),
    icon: 'face-recognition',
    progress: 0,
    action: () => controller.abort(),
  })

  try {
    const modelStatus = await typedApi.getFaceModelStatus()
    if (!isFaceDetectModelReady(modelStatus.data?.status)) {
      await typedApi.downloadFaceModel()
    }

    let state: FaceDetectStreamState = {faces: 0}
    await typedApi.streamFaceDetection(
      {
        mediaIds: ids,
        force: true,
        applyTags: resolveFaceDetectApplyTags(ids.length),
      },
      {signal: controller.signal},
      (event) => {
        const effect = reduceFaceDetectStreamEvent(event, state, {defaultTotal: ids.length})
        state = {faces: effect.faces}

        if (effect.notification) {
          setNotification({
            type: effect.notification.type,
            text: tr(effect.notification.textKey),
          })
        }
        if (effect.taskUpdate) {
          tasksStore.updateTask(taskId, {
            subtitle: tr(
              effect.taskUpdate.subtitleKey,
              effect.taskUpdate.subtitleParams || {},
            ),
            ...(effect.taskUpdate.progress != null
              ? {progress: effect.taskUpdate.progress}
              : {}),
          })
        }
        if (effect.errorMessage) {
          throw new Error(effect.errorMessage)
        }
      },
    )

    const faces = state.faces
    tasksStore.updateTask(taskId, {
      subtitle: tr('media.adding.faces_found', {count: faces}),
      progress: 100,
      color: 'success',
      done: true,
      action: undefined,
    })
    setNotification({
      type: 'success',
      text: tr('media.adding.faces_found', {count: faces}),
    })

    if (faces > 0 && ids.length === 1) {
      const mediaItem = options.contextItem || {id: ids[0]}
      dialogsStore.openFaceResults(mediaItem as never, {taskId})
    } else {
      tasksStore.removeTask(taskId)
      options.reloadMediaItems(ids)
    }
  } catch (error) {
    const isAbortError = error instanceof Error && error.name === 'AbortError'
    if (isAbortError) {
      tasksStore.removeTask(taskId)
      return
    }
    tasksStore.updateTask(taskId, {
      subtitle: tr('media.adding.face_detection_failed'),
      color: 'error',
      done: true,
      action: undefined,
    })
    setNotification({
      type: 'error',
      text: error instanceof Error ? error.message : String(error),
    })
  }
}
