import { defineStore } from 'pinia'
import { buildAuthedWsUrl } from '@/services/authSession'
import { translate } from '@/utils/translate'
import { useSettingsStore } from '@/stores/settings'
import { useTasksStore } from '@/stores/tasks'
import { useNotificationsStore } from '@/stores/notifications'
import { useAppStore } from '@/stores/app'
import { getReadableDuration, getReadableFileSize } from '@/services/formatUtils'
import type { MoveErrorMessage, MoveWsMessage } from '@/types/stores'
import type { Locale } from '@/utils/translate'
import type {OriginalOperation} from '@shared/originalOperations'
import {originalOperationsApi} from '@/services/typedApi/originalOperations'

interface MovingRunOptions {
  onMessage?: (msg: MoveWsMessage) => void
  notifyOnComplete?: boolean
  notifyOnError?: boolean
  taskTitle?: string
  taskIcon?: string
  onFinish?: (result: MovingRunResult) => void
}

interface MovingRunResult {
  success: boolean
  moved?: number
  failed?: number
  total?: number
  aborted?: boolean
  timedOut?: boolean
  elapsedSeconds?: number
  totalBytes?: number
  reason?: string
}

export const useOperationsStore = defineStore('useOperationsStore', {
  state: () => ({
    moving: {
      dialog: false,
      active: false,
      folderPath: '',
      callback: (_id?: number) => {},
      ids: [] as number[],
      items: null as Array<{ id: number; folder: string }> | null,
    },
    create_folder_move_media: { dialog: false, ids: [] as number[] },
    migrationLowDb: { dialog: false, paths: {} as Record<string, string> },
  }),
  actions: {
    async runOriginalOperations(items: OriginalOperation[], onProgress?: (msg: MoveWsMessage) => void): Promise<MovingRunResult> {
      const tasks = useTasksStore()
      const started = Date.now()
      const title = this.t('originals.title')
      const taskId = tasks.setTask({title, subtitle: this.t('operations.moving.preparing'), icon: 'file-move', progress: 0})
      this.moving.active = true
      try {
        let {data: job} = await originalOperationsApi.create(items)
        while (true) {
          const totalBytes = job.items.reduce((sum, item) => sum + item.total, 0)
          const transferred = job.items.reduce((sum, item) => sum + item.bytes, 0)
          const current = job.items.find(item => item.state === 'running')
          const progress = totalBytes ? Math.min(99, transferred / totalBytes * 100) : 0
          const message = {type: 'progress', total: job.items.length, current: job.items.filter(item => item.state === 'completed').length,
            totalBytes, overallProgress: progress, fileName: current?.target?.key || current?.source?.key || ''}
          tasks.updateTask(taskId, {progress, subtitle: message.fileName})
          onProgress?.(message)
          if (job.state === 'completed' || job.state === 'failed' || job.state === 'interrupted') {
            const moved = job.items.filter(item => item.state === 'completed' || item.state === 'skipped').length
            const failed = job.items.length - moved
            for (const item of job.items) if (item.mediaId && item.state === 'completed') this.moving.callback(item.mediaId)
            if (failed) useNotificationsStore().setNotification({type: 'error', title, text: this.t('originals.errors.' + (job.items.find(item => item.error)?.error || 'operation_failed'))})
            return {success: failed === 0 && moved > 0, moved, failed, total: job.items.length, totalBytes, elapsedSeconds: (Date.now() - started) / 1000}
          }
          await new Promise(resolve => setTimeout(resolve, 600))
          job = (await originalOperationsApi.job(job.id)).data
        }
      } catch {
        useNotificationsStore().setNotification({type: 'error', title, text: this.t('originals.errors.operation_failed')})
        return {success: false, aborted: true}
      } finally { tasks.removeTask(taskId); this.moving.active = false }
    },
    t(key: string, params: Record<string, string | number> = {}) {
      const settings = useSettingsStore()
      return translate(key, params, (settings.locale || 'en') as Locale)
    },

    formatSize(bytes: number) {
      return getReadableFileSize(bytes)
    },

    formatEta(seconds: number) {
      if (!seconds || seconds <= 0) return ''
      return getReadableDuration(seconds)
    },

    getMoveErrorText(msg: MoveErrorMessage) {
      const fileName = msg.fileName || ''
      const folder = msg.folder || ''

      switch (msg.code) {
        case 'NO_SPACE':
          return this.t('operations.moving.error_no_space', {
            file: fileName,
            required: this.formatSize(msg.required || 0),
            available: this.formatSize(msg.available || 0),
          })
        case 'NOT_FOUND':
          return this.t('operations.moving.error_not_found', { file: fileName })
        case 'EXISTS':
          return this.t('operations.moving.error_exists', { file: fileName, folder })
        case 'ACCESS_DENIED':
          return this.t('operations.moving.error_access', { file: fileName })
        case 'DB_NOT_FOUND':
          return this.t('operations.moving.error_db', { id: msg.id ?? 0 })
        default:
          return this.t('operations.moving.error_generic', { file: fileName, folder })
      }
    },

    _updateTaskFromMessage(
      _taskId: string,
      _tasks: ReturnType<typeof useTasksStore>,
      updateTask: (data: Record<string, unknown>) => void,
      msg: MoveWsMessage,
    ) {
      switch (msg.type) {
        case 'init':
          updateTask({
            subtitle: this.t('operations.moving.init', {
              total: msg.total ?? 0,
              size: this.formatSize(msg.totalBytes || 0),
              eta: (msg.estimatedSeconds ?? 0) > 0 ? this.formatEta(msg.estimatedSeconds ?? 0) : '—',
            }),
            progress: (msg.totalBytes ?? 0) > 0 ? 0 : ((msg.preFailed ?? 0) > 0 ? 100 : 0),
          })
          break

        case 'progress':
          updateTask({
            subtitle: (msg.etaSeconds ?? 0) > 0
              ? this.t('operations.moving.progress_eta', {
                current: msg.current ?? 0,
                total: msg.total ?? 0,
                file: msg.fileName ?? '',
                eta: this.formatEta(msg.etaSeconds ?? 0),
              })
              : this.t('operations.moving.progress', {
                current: msg.current ?? 0,
                total: msg.total ?? 0,
                file: msg.fileName ?? '',
              }),
            progress: msg.overallProgress || 0,
          })
          break
      }
    },

    _finishMovingTask({
      tasks,
      taskId,
      notifications,
      msg,
      totalBytes,
      notifyOnComplete,
      taskTitle,
    }: {
      tasks: ReturnType<typeof useTasksStore>
      taskId: string
      notifications: ReturnType<typeof useNotificationsStore>
      msg: MoveWsMessage
      totalBytes: number
      notifyOnComplete: boolean
      taskTitle: string
    }) {
      const moved = msg.moved ?? 0
      const failed = msg.failed ?? 0
      const total = msg.total ?? 0

      if (notifyOnComplete) {
        if (failed > 0 && moved > 0) {
          notifications.setNotification({
            type: 'warning',
            title: taskTitle,
            text: this.t('operations.moving.complete_partial', { moved, total, failed }),
          })
        } else if (failed > 0) {
          notifications.setNotification({
            type: 'error',
            title: taskTitle,
            text: this.t('operations.moving.complete_failed', { failed, total }),
          })
        } else if (moved > 0) {
          notifications.setNotification({
            type: 'success',
            title: taskTitle,
            text: this.t('operations.moving.complete_success', {
              count: moved,
              size: this.formatSize(msg.totalBytes || totalBytes),
              time: msg.elapsedSeconds ? this.formatEta(msg.elapsedSeconds) : '',
            }),
          })
        }
      }

      tasks.updateTask(taskId, {
        subtitle: failed > 0
          ? this.t('operations.moving.done_partial', { moved, total, failed })
          : this.t('operations.moving.done', { moved, total }),
        progress: 100,
        color: failed > 0 ? 'warning' : 'success',
      })

      setTimeout(() => tasks.removeTask(taskId), failed > 0 ? 2500 : 800)
    },

    async _runMovingWebSocket(payload: Record<string, unknown>, {
      onMessage,
      notifyOnComplete = true,
      notifyOnError = true,
      taskTitle,
      taskIcon = 'file-move',
      onFinish,
    }: MovingRunOptions = {}): Promise<MovingRunResult> {
      if (this.moving.active) {
        return { success: false, aborted: true, reason: 'busy' }
      }

      const tasks = useTasksStore()
      const notifications = useNotificationsStore()
      const app = useAppStore()

      const title = taskTitle || this.t('operations.moving.title')
      this.moving.active = true

      let moved = 0
      let failed = 0
      let total = 1
      let totalBytes = 0

      const taskId = tasks.setTask({
        title,
        subtitle: this.t('operations.moving.preparing'),
        icon: taskIcon,
        progress: 0,
      })

      return new Promise<MovingRunResult>((resolve) => {
        let settled = false

        const finish = (result: MovingRunResult) => {
          if (settled) return
          settled = true
          clearTimeout(connectionTimeout)
          this.moving.active = false
          if (typeof onFinish === 'function') onFinish(result)
          resolve(result)
        }

        const wsUrl = buildAuthedWsUrl(app.localhost || '', '/moving')
        const ws = new WebSocket(wsUrl)
        const updateTask = (data: Record<string, unknown>) => tasks.updateTask(taskId, data)

        const connectionTimeout = setTimeout(() => {
          if (notifyOnError) {
            notifications.setNotification({
              type: 'error',
              title,
              text: this.t('operations.moving.connection_error'),
            })
          }
          tasks.removeTask(taskId)
          try { ws.close() } catch {}
          finish({ success: false, moved, failed, total, aborted: true, timedOut: true })
        }, 30000)

        ws.onerror = () => {
          if (notifyOnError) {
            notifications.setNotification({
              type: 'error',
              title,
              text: this.t('operations.moving.connection_error'),
            })
          }
          tasks.removeTask(taskId)
          finish({ success: false, moved, failed, total, aborted: true })
        }

        ws.onclose = () => {
          if (!settled) {
            tasks.removeTask(taskId)
            finish({ success: false, moved, failed, total, aborted: true })
          }
        }

        ws.onopen = () => ws.send(JSON.stringify(payload))

        ws.onmessage = (msgEvent) => {
          const msg = JSON.parse(msgEvent.data) as MoveWsMessage
          if (typeof onMessage === 'function') onMessage(msg)

          switch (msg.type) {
            case 'init':
              total = msg.total || total
              totalBytes = msg.totalBytes || 0
              failed = msg.preFailed || 0
              this._updateTaskFromMessage(taskId, tasks, updateTask, msg)
              break

            case 'progress':
              this._updateTaskFromMessage(taskId, tasks, updateTask, msg)
              break

            case 'error':
              failed += 1
              if (notifyOnError) {
                notifications.setNotification({
                  type: 'error',
                  title,
                  text: this.getMoveErrorText(msg),
                })
              }
              break

            case 'success':
              moved += 1
              if (typeof this.moving.callback === 'function' && msg.id) {
                this.moving.callback(msg.id)
              }
              break

            case 'close':
              moved = msg.moved ?? moved
              failed = msg.failed ?? failed
              total = msg.total ?? total

              this._finishMovingTask({
                tasks,
                taskId,
                notifications,
                msg,
                totalBytes,
                notifyOnComplete,
                taskTitle: title,
              })

              try { ws.close() } catch {}
              finish({
                success: failed === 0 && moved > 0,
                moved,
                failed,
                total,
                elapsedSeconds: msg.elapsedSeconds,
                totalBytes: msg.totalBytes || totalBytes,
              })
              break
          }
        }
      })
    },

    async renameFilePath({
      mediaId,
      oldPath,
      newPath,
      onProgress,
      notifyOnComplete = false,
      notifyOnError = true,
    }: {
      mediaId?: number
      oldPath: string
      newPath: string
      onProgress?: (msg: MoveWsMessage) => void
      notifyOnComplete?: boolean
      notifyOnError?: boolean
    }) {
      // Lazy-import to avoid circular deps
      const {useFsOperationsQueue} = await import('@/stores/fsOperationsQueue')
      const queue = useFsOperationsQueue()

      const fileName = oldPath.split(/[/\\]/).pop() || oldPath
      return queue.enqueue(
        {label: `Rename ${fileName}`, kind: 'move', entryCount: 1},
        () => mediaId ? this.runOriginalOperations([{kind: oldPath.replace(/[/\\][^/\\]*$/, '') === newPath.replace(/[/\\][^/\\]*$/, '') ? 'rename' : 'move', mediaId, target: {key: newPath}, conflict: 'fail'}], onProgress) : this._runMovingWebSocket(
          {type: 'rename', old_path: oldPath, new_path: newPath},
          {
            taskTitle: this.t('operations.moving.rename_title'),
            notifyOnComplete,
            notifyOnError,
            onMessage: onProgress,
          },
        ),
      )
    },

    async moveFiles() {
      const items = Array.isArray(this.moving.items) && this.moving.items.length
        ? this.moving.items
        : (this.moving.ids || []).map(id => ({ id, folder: this.moving.folderPath }))

      if (!items.length) return

      // Lazy-import to avoid circular deps
      const {useFsOperationsQueue} = await import('@/stores/fsOperationsQueue')
      const queue = useFsOperationsQueue()

      return queue.enqueue(
        {label: `Move ${items.length} item(s)`, kind: 'move', entryCount: items.length},
        async () => {
          try {
            const operations: OriginalOperation[] = []
            for (const item of items) {
              const {data: info} = await originalOperationsApi.source(item.id)
              operations.push({kind: 'move', mediaId: item.id, conflict: 'fail', target: {connectionId: info.source.connectionId,
                key: info.provider === 'gdrive' ? item.folder : item.folder.replace(/[/\\]+$/, '') + (item.folder.includes('\\') ? '\\' : '/') + info.name,
                ...(info.provider === 'gdrive' ? {name: info.name} : {})}})
            }
            return await this.runOriginalOperations(operations)
          } finally { this.moving.items = null }
        },
      )
    },
  },
})

export default useOperationsStore
