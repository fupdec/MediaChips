<template>
  <div id="settings-video-codec-backfill" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.video_codec_backfill')"
      icon="movie-filter"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.video_codec_backfill_hint') }}
      </span>
    </v-alert>

    <div class="text-body-2 mb-4">
      <template v-if="statusLoaded">
        {{ t('settings_labels.database.video_codec_backfill_status', {
          filled: status.filled,
          total: status.total,
          pending: status.pending,
        }) }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <v-progress-linear
      v-if="active"
      :model-value="progress"
      color="primary"
      height="8"
      rounded
      striped
      class="mb-2"
    />

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="active" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.video_codec_backfill_progress', {
        processed: counters.processed,
        total: counters.total,
        updated: counters.updated,
        missing: counters.missing,
        failed: counters.failed,
      }) }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-4">
      {{ t('settings_labels.database.video_codec_backfill_complete', {
        updated: lastSummary.updated,
        missing: lastSummary.missing,
        failed: lastSummary.failed,
      }) }}
    </div>

    <v-alert
      v-if="lastSummary && lastSummary.missing > 0"
      type="warning"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.video_codec_backfill_missing_hint', {
          count: lastSummary.missing,
        }) }}
      </span>
    </v-alert>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!active"
        @click="refreshStatus"
        :loading="statusLoading"
        :disabled="statusLoading"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>

      <v-btn
        v-if="!active"
        @click="startBackfill(false)"
        :disabled="!statusLoaded || status.pending === 0 || status.total === 0"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.video_codec_backfill_start') }}
      </v-btn>

      <v-btn
        v-if="!active"
        @click="startBackfill(true)"
        :disabled="!statusLoaded || status.total === 0"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.video_codec_backfill_recalculate') }}
      </v-btn>

      <v-btn
        v-else
        @click="stopBackfill"
        color="error"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.stop') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useTasksStore} from '@/stores/tasks'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setNotification} from '@/services/notificationService'

interface VideoCodecStatus {
  total: number
  pending: number
  filled: number
}

interface BackfillCounters {
  processed: number
  total: number
  updated: number
  missing: number
  failed: number
}

interface BackfillSummary {
  updated: number
  missing: number
  failed: number
  stopped: boolean
}

interface BackfillEvent {
  type: 'progress' | 'complete' | 'error'
  processed?: number
  total?: number
  updated?: number
  missing?: number
  failed?: number
  current?: string
  message?: string
  stopped?: boolean
}

const {t} = useI18n()
const appStore = useAppStore()
const tasksStore = useTasksStore()

const status = ref<VideoCodecStatus>({
  total: 0,
  pending: 0,
  filled: 0,
})
const statusLoaded = ref(false)
const statusLoading = ref(false)

const active = ref(false)
const progress = ref(0)
const currentPath = ref('')
const lastSummary = ref<BackfillSummary | null>(null)
const counters = ref<BackfillCounters>({
  processed: 0,
  total: 0,
  updated: 0,
  missing: 0,
  failed: 0,
})

let abortController: AbortController | null = null
let taskId: string | null = null

const fetchStatus = async () => {
  const response = await fetch(`${appStore.localhost}/api/Task/videoCodecBackfillStatus`)

  if (!response.ok) {
    throw new Error(response.statusText || 'Failed to load video codec status')
  }

  status.value = await response.json()
  statusLoaded.value = true
}

const refreshStatus = async () => {
  statusLoading.value = true
  try {
    await fetchStatus()
  } catch (error) {
    console.error('Failed to load video codec backfill status:', error)
  } finally {
    statusLoading.value = false
  }
}

const stopBackfill = () => {
  abortController?.abort()
}

const startBackfill = async (force = false) => {
  if (active.value) return
  if (!force && status.value.pending === 0) return

  active.value = true
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = null
  counters.value = {
    processed: 0,
    total: force ? status.value.total : status.value.pending,
    updated: 0,
    missing: 0,
    failed: 0,
  }

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: force
      ? t('settings_labels.database.video_codec_backfill_recalculate')
      : t('settings_labels.database.video_codec_backfill'),
    subtitle: t('settings_labels.database.video_codec_backfill_progress', {
      processed: 0,
      total: counters.value.total,
      updated: 0,
      missing: 0,
      failed: 0,
    }),
    icon: 'movie-filter',
    progress: 0,
    action: stopBackfill,
  })
  const currentTaskId = taskId

  try {
    const response = await fetch(
      `${appStore.localhost}/api/Task/streamVideoCodecBackfill?force=${force ? 'true' : 'false'}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: abortController.signal,
        body: JSON.stringify({}),
      },
    )

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Video codec backfill request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: BackfillEvent) => {
      if (event.type === 'progress') {
        counters.value = {
          processed: event.processed || 0,
          total: event.total || counters.value.total,
          updated: event.updated || 0,
          missing: event.missing || 0,
          failed: event.failed || 0,
        }
        currentPath.value = event.current || ''
        progress.value = event.total
          ? Math.min(((event.processed ?? 0) / event.total) * 100, 100)
          : 0

        tasksStore.updateTask(currentTaskId, {
          subtitle: t('settings_labels.database.video_codec_backfill_progress', counters.value),
          progress: progress.value,
        })
      }

      if (event.type === 'complete') {
        const summary: BackfillSummary = {
          updated: event.updated || 0,
          missing: event.missing || 0,
          failed: event.failed || 0,
          stopped: event.stopped === true,
        }
        lastSummary.value = summary
        progress.value = 100

        tasksStore.updateTask(currentTaskId, {
          subtitle: event.stopped
            ? t('common.stop')
            : t('settings_labels.database.video_codec_backfill_complete', {
              updated: summary.updated,
              missing: summary.missing,
              failed: summary.failed,
            }),
          progress: 100,
          color: event.stopped ? 'warning' : 'success',
          done: true,
          action: () => {},
        })

        if (!event.stopped) {
          setNotification({
            type: summary.updated > 0 ? 'success' : 'info',
            title: force
              ? t('settings_labels.database.video_codec_backfill_recalculate')
              : t('settings_labels.database.video_codec_backfill'),
            text: t('settings_labels.database.video_codec_backfill_complete', {
              updated: summary.updated,
              missing: summary.missing,
              failed: summary.failed,
            }),
            icon: 'mdi-movie-filter',
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Video codec backfill failed')
      }
    }

    while (true) {
      const {value, done} = await reader.read()
      if (done) break

      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        handleEvent(JSON.parse(line))
      }
    }

    if (buffer.trim()) {
      handleEvent(JSON.parse(buffer))
    }

    await fetchStatus()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (err.name !== 'AbortError') {
      console.error('Video codec backfill failed:', err)
      setNotification({
        type: 'error',
        title: t('settings_labels.database.video_codec_backfill'),
        text: err.message,
      })

      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: err.message,
          color: 'error',
          done: true,
          action: () => {},
        })
      }
    } else if (taskId) {
      tasksStore.updateTask(taskId, {
        subtitle: t('common.stop'),
        color: 'warning',
        done: true,
        action: () => {},
      })
    }
  } finally {
    active.value = false
    abortController = null
    currentPath.value = ''
    await fetchStatus().catch(() => {})
  }
}
</script>

<style scoped>
.selectable {
  user-select: text;
  word-break: break-all;
}
</style>
