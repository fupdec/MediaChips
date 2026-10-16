import {onBeforeUnmount, reactive, watch} from 'vue'
import {useAppStore} from '@/stores/app'
import {useTasksStore, type RemoteMediaAddingProcess} from '@/stores/tasks'
import {resetMediaAddingRun, mediaAddingOutcome} from '@/services/mediaAddingRun'
import {setNotification} from '@/services/notificationService'
import {MEDIA_BULK_LITE_ADDED_CAP} from '@shared/mediaBulkImport'

type Translate = (key: string, values?: Record<string, string | number>) => string
type Snapshot = {
  scanning: boolean
  stopped: boolean
  processed: number
  total: number
  found: number
  skipped: number
  inLibrary: number
  remaining: number
  errors: Array<{path: string; message: string}>
}

/** Drive, NAS and links publish into the same task and process dialog as local files. */
export function useRemoteMediaAddingProcess(t: Translate) {
  const tasks = useTasksStore()
  const app = useAppStore()
  let release: (() => void) | undefined

  function begin(options: {
    source: string
    snapshot: () => Snapshot
    readablePath: (path: string) => string
    stop: () => void
    retry: () => Promise<void>
    phase?: RemoteMediaAddingProcess['phase']
  }) {
    if (tasks.mediaAdding.active) return null
    release?.()
    const oldTaskId = tasks.mediaAdding.notificationTaskId
    if (oldTaskId) tasks.removeTask(oldTaskId)
    resetMediaAddingRun(tasks.mediaAdding)
    const state = reactive<RemoteMediaAddingProcess>({
      source: options.source, phase: options.phase || 'scanning', stopping: false,
      skipped: 0, inLibrary: 0, remaining: 0, stop, retry: null,
    })
    tasks.mediaAdding.remoteImport = state
    const ownsRun = () => tasks.mediaAdding.remoteImport === state
    const taskId = tasks.setTask({
      title: t('media.adding.title'), icon: 'file-plus',
      click: () => { if (ownsRun()) tasks.mediaAdding.dialogProcess = true },
      action: stop,
    })
    tasks.mediaAdding.notificationTaskId = taskId
    tasks.mediaAdding.dialogProcess = true
    const seen = new Set<number>()
    const existing = new Set<string>()

    function stop() {
      if (!ownsRun() || !tasks.mediaAdding.active || state.stopping) return
      state.stopping = true
      tasks.mediaAdding.status = t('media.adding.stopping')
      tasks.updateTask(taskId, {subtitle: t('media.adding.stopping'), action: undefined})
      options.stop()
    }
    function update(snapshot: Snapshot) {
      if (!ownsRun()) return
      const task = tasks.mediaAdding
      task.current = snapshot.processed
      task.total = snapshot.scanning ? snapshot.found : snapshot.total
      state.skipped = snapshot.skipped
      state.inLibrary = Math.max(snapshot.inLibrary, existing.size)
      state.remaining = snapshot.remaining
      if (snapshot.scanning) state.phase = 'scanning'
      else if (state.phase === 'scanning') state.phase = 'importing'
      task.progress = snapshot.scanning ? 0 : snapshot.total ? 100 * snapshot.processed / snapshot.total : 0
      task.processed = snapshot.scanning
        ? t('media.adding.found_count', {count: snapshot.found})
        : t('media.adding.in_progress', {current: snapshot.processed, total: snapshot.total})
      task.errors = snapshot.errors.slice(-MEDIA_BULK_LITE_ADDED_CAP).map(error => `${options.readablePath(error.path)}: ${error.message}`)
      if (!state.stopping) task.status = t(state.phase === 'scanning' ? 'media.adding.scanning_files'
        : state.phase === 'tagging' ? 'media.adding.adding_metadata'
        : state.phase === 'resolving' ? 'media.adding.web_video_loading' : 'media.adding.gathering_metadata')
      tasks.updateTask(taskId, {progress: task.progress, subtitle: task.status || ''})
    }
    const unwatch = watch(options.snapshot, update, {deep: true, immediate: true, flush: 'sync'})
    function record(path: string, mediaId: number, created: boolean) {
      if (!ownsRun()) return
      const task = tasks.mediaAdding
      const readable = options.readablePath(path)
      if (!created) recordExisting(path)
      else if (!seen.has(mediaId)) {
        seen.add(mediaId)
        task.addedTotal++
        task.added.push(readable)
        task.addedMedia.push({path: readable, mediaId})
        if (task.added.length > MEDIA_BULK_LITE_ADDED_CAP) task.added.shift()
        if (task.addedMedia.length > MEDIA_BULK_LITE_ADDED_CAP) task.addedMedia.shift()
      }
    }
    function recordExisting(path: string) {
      if (!ownsRun() || existing.has(path)) return
      existing.add(path)
      state.inLibrary = existing.size
      const readable = options.readablePath(path)
      tasks.mediaAdding.duplicates.push({path: readable, duplicate: {parameter: 'path', path: readable}})
      if (tasks.mediaAdding.duplicates.length > MEDIA_BULK_LITE_ADDED_CAP) tasks.mediaAdding.duplicates.shift()
    }
    function finish() {
      unwatch?.()
      if (!ownsRun()) return
      const snapshot = options.snapshot()
      update(snapshot)
      const task = tasks.mediaAdding
      task.stopped = (snapshot.stopped || state.stopping) && snapshot.remaining > 0
      task.active = false
      task.finished = true
      state.retry = snapshot.remaining > 0 ? async () => {
        if (ownsRun() && !tasks.mediaAdding.active) await options.retry()
      } : null
      const outcome = mediaAddingOutcome(task)
      task.status = t(outcome.status)
      if (!task.stopped) task.progress = 100
      const color = outcome.color
      tasks.updateTask(taskId, {done: true, action: undefined, color, progress: task.progress, subtitle: task.status})
      tasks.syncDesktopChrome()
      setNotification({scope: 'media-adding', type: color, title: task.status, text: t('media.adding.added_count', {count: task.addedTotal}),
        actions: [{id: 'open-media-adding-process', text: t('media.adding.open_process_dialog'), icon: 'open-in-new', hide: true,
          action: () => { if (ownsRun()) tasks.mediaAdding.dialogProcess = true }}]})
    }
    release = () => {
      unwatch?.()
      if (!ownsRun()) return
      state.retry = null
      if (tasks.mediaAdding.active) {
        options.stop()
        tasks.mediaAdding.stopped = true
        tasks.mediaAdding.finished = true
        tasks.mediaAdding.active = false
        tasks.mediaAdding.status = t('media.adding.stopped')
        tasks.updateTask(taskId, {done: true, action: undefined, subtitle: tasks.mediaAdding.status})
      }
    }
    return {
      record, recordExisting, finish,
      phase(phase: RemoteMediaAddingProcess['phase']) { if (ownsRun()) { state.phase = phase; update(options.snapshot()) } },
    }
  }
  watch([() => app.dbPath, () => app.localhost], () => {
    release?.()
    if (tasks.mediaAdding.remoteImport) {
      if (tasks.mediaAdding.notificationTaskId) tasks.removeTask(tasks.mediaAdding.notificationTaskId)
      tasks.mediaAdding.notificationTaskId = null
      tasks.mediaAdding.remoteImport = null
      tasks.mediaAdding.dialogProcess = false
    }
  }, {flush: 'sync'})
  onBeforeUnmount(() => release?.())
  return {begin, get active() { return tasks.mediaAdding.active }}
}
