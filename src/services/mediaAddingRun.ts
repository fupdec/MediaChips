import type {MediaAddingState} from '@/stores/tasks'

/** Reset run results without changing the user's source selection or options. */
export function resetMediaAddingRun(task: MediaAddingState) {
  Object.assign(task, {
    remoteImport: null,
    active: true, stopped: false, finished: false, status: '', processed: '',
    progress: 0, current: 0, total: 0, errors: [], duplicates: [], added: [],
    addedTotal: 0, addedMedia: [], parsingTags: false, suggestedTags: [],
    addedMediaTypeId: null, addedMediaType: null, detectingFaces: false,
    faceDetectionProgress: 0, faceDetectionProcessed: 0, faceDetectionTotal: 0,
    faceDetectionRemaining: 0, facesFound: 0, notificationTaskId: null,
  })
}

export function mediaAddingOutcome(task: Pick<MediaAddingState, 'stopped' | 'errors'>) {
  if (task.stopped) return {status: 'media.adding.stopped', color: 'warning' as const}
  if (task.errors.length) return {status: 'media.adding.complete_with_errors', color: 'error' as const}
  return {status: 'media.adding.complete', color: 'success' as const}
}
