import {ref, computed, type Ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {setNotification} from '@/services/notificationService'
import {typedApi} from '@/services/typedApi'
import type {BackfillKind, BackfillStreamEvent} from '@/services/typedApi/backfill'

export type SettingsBackfillMode = 'hash' | 'codec'

export interface SettingsBackfillConfig {
  kind: BackfillKind
  elementId: string
  icon: string
  notificationIcon: string
  /** Key under settings_labels.database, e.g. fingerprint_backfill */
  i18nKey: string
  mode: SettingsBackfillMode
  includeSkipped?: boolean
}

export const FINGERPRINT_BACKFILL: SettingsBackfillConfig = {
  kind: 'fingerprint',
  elementId: 'settings-fingerprint-backfill',
  icon: 'fingerprint',
  notificationIcon: 'fingerprint',
  i18nKey: 'fingerprint_backfill',
  mode: 'hash',
  includeSkipped: true,
}

export const VISUAL_HASH_BACKFILL: SettingsBackfillConfig = {
  kind: 'visualHash',
  elementId: 'settings-visual-hash-backfill',
  icon: 'image-multiple',
  notificationIcon: 'image-multiple',
  i18nKey: 'visual_hash_backfill',
  mode: 'hash',
  includeSkipped: true,
}

export const CLIP_EMBEDDING_BACKFILL: SettingsBackfillConfig = {
  kind: 'clipEmbedding',
  elementId: 'settings-clip-embedding-backfill',
  icon: 'brain',
  notificationIcon: 'brain',
  i18nKey: 'clip_embedding_backfill',
  mode: 'hash',
  includeSkipped: true,
}

export const VIDEO_CODEC_BACKFILL: SettingsBackfillConfig = {
  kind: 'videoCodec',
  elementId: 'settings-video-codec-backfill',
  icon: 'movie-filter',
  notificationIcon: 'movie-filter',
  i18nKey: 'video_codec_backfill',
  mode: 'codec',
  includeSkipped: false,
}

interface BackfillStatus {
  total: number
  pending: number
  done: number
}

interface BackfillCounters {
  processed: number
  total: number
  done: number
  missing: number
  failed: number
  skipped: number
}

interface BackfillSummary {
  done: number
  missing: number
  failed: number
  skipped: number
  stopped: boolean
}

function dbKey(config: SettingsBackfillConfig, suffix = '') {
  return `settings_labels.database.${config.i18nKey}${suffix}`
}

function eventDoneCount(event: BackfillStreamEvent, mode: SettingsBackfillMode) {
  return mode === 'codec' ? (event.updated || 0) : (event.hashed || 0)
}

function formatProgress(
  config: SettingsBackfillConfig,
  counters: BackfillCounters,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (config.mode === 'codec') {
    return t(dbKey(config, '_progress'), {
      processed: counters.processed,
      total: counters.total,
      updated: counters.done,
      missing: counters.missing,
      failed: counters.failed,
    })
  }
  const params: Record<string, number> = {
    processed: counters.processed,
    total: counters.total,
    hashed: counters.done,
    missing: counters.missing,
    failed: counters.failed,
  }
  if (config.includeSkipped) {
    params.skipped = counters.skipped
  }
  return t(dbKey(config, '_progress'), params)
}

function formatComplete(
  config: SettingsBackfillConfig,
  summary: BackfillSummary,
  t: ReturnType<typeof useI18n>['t'],
) {
  if (config.mode === 'codec') {
    return t(dbKey(config, '_complete'), {
      updated: summary.done,
      missing: summary.missing,
      failed: summary.failed,
    })
  }
  const params: Record<string, number> = {
    hashed: summary.done,
    missing: summary.missing,
    failed: summary.failed,
  }
  if (config.includeSkipped) {
    params.skipped = summary.skipped
  }
  return t(dbKey(config, '_complete'), params)
}

export function useSettingsBackfillStream(config: SettingsBackfillConfig) {
  const {t} = useI18n()
  const tasksStore = useTasksStore()

  const status = ref<BackfillStatus>({total: 0, pending: 0, done: 0})
  const statusLoaded = ref(false)
  const statusLoading = ref(false)
  const active = ref(false)
  const progress = ref(0)
  const currentPath = ref('')
  const lastSummary = ref<BackfillSummary | null>(null)
  const counters = ref<BackfillCounters>({
    processed: 0,
    total: 0,
    done: 0,
    missing: 0,
    failed: 0,
    skipped: 0,
  })

  let abortController: AbortController | null = null
  let taskId: string | null = null
  let removeTaskTimer: ReturnType<typeof setTimeout> | null = null

  const clearRemoveTaskTimer = () => {
    if (removeTaskTimer) {
      clearTimeout(removeTaskTimer)
      removeTaskTimer = null
    }
  }

  const scheduleRemoveTask = (id: string | null, delayMs = 1200) => {
    if (!id) return
    clearRemoveTaskTimer()
    removeTaskTimer = setTimeout(() => {
      tasksStore.removeTask(id)
      if (taskId === id) taskId = null
      removeTaskTimer = null
    }, delayMs)
  }

  const statusText = computed(() => {
    if (!statusLoaded.value) {
      return t('settings_labels.database.status_not_loaded')
    }
    if (config.mode === 'codec') {
      return t(dbKey(config, '_status'), {
        filled: status.value.done,
        total: status.value.total,
        pending: status.value.pending,
      })
    }
    return t(dbKey(config, '_status'), {
      hashed: status.value.done,
      total: status.value.total,
      pending: status.value.pending,
    })
  })

  const progressText = computed(() => formatProgress(config, counters.value, t))
  const summaryText = computed(() => {
    if (!lastSummary.value) return ''
    return formatComplete(config, lastSummary.value, t)
  })

  async function fetchStatus() {
    const data = (await typedApi.getBackfillStatus(config.kind)).data
    status.value = {
      total: data.total || 0,
      pending: data.pending || 0,
      done: config.mode === 'codec' ? (data.filled || 0) : (data.hashed || 0),
    }
    statusLoaded.value = true
  }

  async function refreshStatus() {
    statusLoading.value = true
    try {
      await fetchStatus()
    } catch (error) {
      console.error(`Failed to load ${config.i18nKey} status:`, error)
    } finally {
      statusLoading.value = false
    }
  }

  function stopBackfill() {
    abortController?.abort()
  }

  async function startBackfill(force = false) {
    if (active.value) return
    if (!force && status.value.pending === 0) return

    clearRemoveTaskTimer()
    active.value = true
    progress.value = 0
    currentPath.value = ''
    lastSummary.value = null
    counters.value = {
      processed: 0,
      total: force ? status.value.total : status.value.pending,
      done: 0,
      missing: 0,
      failed: 0,
      skipped: 0,
    }

    abortController = new AbortController()
    const title = force
      ? t(dbKey(config, '_recalculate'))
      : t(dbKey(config))

    taskId = tasksStore.setTask({
      title,
      subtitle: formatProgress(config, counters.value, t),
      icon: config.icon,
      progress: 0,
      action: stopBackfill,
    })
    const currentTaskId = taskId

    try {
      const handleEvent = (event: BackfillStreamEvent) => {
        if (event.type === 'progress') {
          counters.value = {
            processed: event.processed || 0,
            total: event.total || counters.value.total,
            done: eventDoneCount(event, config.mode),
            missing: event.missing || 0,
            failed: event.failed || 0,
            skipped: event.skipped || 0,
          }
          currentPath.value = event.current || ''
          progress.value = event.total
            ? Math.min(((event.processed ?? 0) / event.total) * 100, 100)
            : 0

          tasksStore.updateTask(currentTaskId, {
            subtitle: formatProgress(config, counters.value, t),
            progress: progress.value,
          })
        }

        if (event.type === 'complete') {
          const summary: BackfillSummary = {
            done: eventDoneCount(event, config.mode),
            missing: event.missing || 0,
            failed: event.failed || 0,
            skipped: event.skipped || 0,
            stopped: event.stopped === true,
          }
          lastSummary.value = summary
          progress.value = 100

          tasksStore.updateTask(currentTaskId, {
            subtitle: event.stopped
              ? t('common.stop')
              : formatComplete(config, summary, t),
            progress: 100,
            color: event.stopped ? 'warning' : 'success',
            done: true,
            action: undefined,
          })
          scheduleRemoveTask(currentTaskId, event.stopped ? 800 : 1500)

          if (!event.stopped) {
            setNotification({
              type: summary.done > 0 ? 'success' : 'info',
              title,
              text: formatComplete(config, summary, t),
              icon: config.notificationIcon,
            })
          }
        }

        if (event.type === 'error') {
          throw new Error(event.message || `${config.i18nKey} failed`)
        }
      }

      await typedApi.streamBackfill(
        config.kind,
        {
          signal: abortController.signal,
          force: force === true,
        },
        handleEvent,
      )
      await fetchStatus()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      if (err.name !== 'AbortError') {
        console.error(`${config.i18nKey} failed:`, err)
        setNotification({
          type: 'error',
          title: t(dbKey(config)),
          text: err.message,
        })

        if (taskId) {
          tasksStore.updateTask(taskId, {
            subtitle: err.message,
            color: 'error',
            done: true,
            action: undefined,
          })
          scheduleRemoveTask(taskId, 2500)
        }
      } else if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: t('common.stop'),
          color: 'warning',
          done: true,
          action: undefined,
        })
        scheduleRemoveTask(taskId, 800)
      }
    } finally {
      active.value = false
      abortController = null
      currentPath.value = ''
      await fetchStatus().catch(() => {})
    }
  }

  return {
    config,
    status,
    statusLoaded,
    statusLoading,
    statusText,
    active,
    progress,
    currentPath,
    lastSummary,
    counters,
    progressText,
    summaryText,
    missingHint: computed(() => {
      if (!lastSummary.value || lastSummary.value.missing <= 0) return ''
      return t(dbKey(config, '_missing_hint'), {count: lastSummary.value.missing})
    }),
    canStart: computed(() =>
      statusLoaded.value && status.value.pending > 0 && status.value.total > 0,
    ),
    canRecalculate: computed(() => statusLoaded.value && status.value.total > 0),
    refreshStatus,
    startBackfill,
    stopBackfill,
  }
}

export type SettingsBackfillStream = ReturnType<typeof useSettingsBackfillStream>
export type SettingsBackfillStatusRef = Ref<BackfillStatus>
