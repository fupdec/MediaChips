<template>
  <div id="settings-detect-faces" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.detect_faces')"
      icon="face-recognition"
    />

    <v-alert
      v-if="statusError"
      type="error"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">{{ statusError }}</span>
    </v-alert>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.detect_faces_hint') }}
      </span>
    </v-alert>

    <div v-if="modelNeedsDownload" class="mb-4">
      <div class="text-caption text-medium-emphasis mb-2">
        {{ t('settings_labels.database.detect_faces_model_hint') }}
      </div>
      <v-btn
        @click="downloadModel"
        :loading="modelDownloading"
        :disabled="modelDownloading || running"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-download" start/>
        {{ t('settings_labels.database.detect_faces_download_model') }}
      </v-btn>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="refreshStatus"
        :loading="statusLoading"
        :disabled="statusLoading || running"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>
    </div>

    <div class="text-body-2 text-medium-emphasis mb-3">
      <template v-if="statusLoaded">
        {{ t('settings_labels.database.detect_faces_status', status) }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <v-progress-linear
      v-if="running"
      :model-value="progress"
      color="primary"
      height="8"
      rounded
      striped
      class="mb-2"
    />

    <div v-if="running && currentPath" class="text-caption text-medium-emphasis mb-2 selectable">
      {{ currentPath }}
    </div>

    <div v-if="running" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.detect_faces_progress', counters) }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-3">
      {{ t('settings_labels.database.detect_faces_complete', lastSummary) }}
    </div>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!running"
        @click="startDetection(false)"
        :disabled="!statusLoaded || statusLoading || !modelReady || status.pending === 0"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.detect_faces_start') }}
      </v-btn>

      <v-btn
        v-if="!running"
        @click="startDetection(true)"
        :disabled="!statusLoaded || statusLoading || !modelReady || status.total === 0"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.detect_faces_regenerate') }}
      </v-btn>

      <v-btn
        v-if="running"
        @click="stopDetection"
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
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {typedApi} from '@/services/typedApi'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setNotification} from '@/services/notificationService'

interface DetectionStatus {
  total: number
  pending: number
  generated: number
  faces: number
}

interface DetectionCounters {
  processed: number
  total: number
  created: number
  skipped: number
  missing: number
  failed: number
  faces: number
}

interface DetectionSummary {
  created: number
  skipped: number
  missing: number
  failed: number
  faces: number
  stopped: boolean
}

interface DetectionEvent {
  type: 'progress' | 'complete' | 'error'
  processed?: number
  total?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  faces?: number
  current?: string
  message?: string
  stopped?: boolean
}

const {t} = useI18n()
const tasksStore = useTasksStore()

const buildRequestHeaders = (withJson = false): Record<string, string> => {
  const token = getAuthToken()
  return {
    ...(withJson ? {'Content-Type': 'application/json'} : {}),
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  }
}

const emptyStatus: DetectionStatus = {total: 0, pending: 0, generated: 0, faces: 0}
const status = ref<DetectionStatus>({...emptyStatus})
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const running = ref(false)
const progress = ref(0)
const currentPath = ref('')
const lastSummary = ref<DetectionSummary | null>(null)
const modelStatus = ref('unknown')
const modelDownloading = ref(false)
const abortController = ref<AbortController | null>(null)
const taskId = ref<string | null>(null)

const counters = ref<DetectionCounters>({
  processed: 0,
  total: 0,
  created: 0,
  skipped: 0,
  missing: 0,
  failed: 0,
  faces: 0,
})

const modelReady = computed(() => ['downloaded', 'loaded'].includes(modelStatus.value))
const modelNeedsDownload = computed(() => (
  !modelReady.value && !['loading'].includes(modelStatus.value)
))

const refreshModelStatus = async () => {
  try {
    const response = await typedApi.getFaceModelStatus()
    modelStatus.value = response.data?.status || 'unknown'
  } catch {
    modelStatus.value = 'error'
  }
}

const downloadModel = async () => {
  modelDownloading.value = true
  modelStatus.value = 'loading'
  try {
    const response = await typedApi.downloadFaceModel()
    modelStatus.value = response.data?.status || 'downloaded'
    setNotification({
      type: 'success',
      text: t('settings.path_parser.statuses.downloaded'),
    })
  } catch {
    modelStatus.value = 'error'
    setNotification({
      type: 'error',
      text: t('settings_labels.database.detect_faces_model_failed'),
    })
  } finally {
    modelDownloading.value = false
  }
}

const refreshStatus = async () => {
  statusLoading.value = true
  statusError.value = ''
  try {
    await refreshModelStatus()
    const response = await typedApi.getFaceDetectionStatus()
    status.value = {
      total: Number(response.data?.total || 0),
      pending: Number(response.data?.pending || 0),
      generated: Number(response.data?.generated || 0),
      faces: Number(response.data?.faces || 0),
    }
    statusLoaded.value = true
  } catch (error: unknown) {
    statusError.value = error instanceof Error ? error.message : String(error)
    statusLoaded.value = false
  } finally {
    statusLoading.value = false
  }
}

const stopDetection = () => {
  abortController.value?.abort()
}

const startDetection = async (force: boolean) => {
  if (running.value || !modelReady.value) return

  running.value = true
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = null
  counters.value = {
    processed: 0,
    total: status.value.total,
    created: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
    faces: 0,
  }

  abortController.value = new AbortController()
  taskId.value = tasksStore.setTask({
    title: t('settings_labels.database.detect_faces'),
    subtitle: t('settings_labels.database.detect_faces_progress', counters.value),
    icon: 'face-recognition',
    progress: 0,
    action: stopDetection,
  })

  try {
    const response = await fetch(buildApiUrl('/api/Task/streamFaceDetection'), {
      method: 'POST',
      headers: buildRequestHeaders(true),
      body: JSON.stringify({force}),
      signal: abortController.value.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(t('settings_labels.database.detect_faces_api_unavailable'))
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const {done, value} = await reader.read()
      if (done) break
      buffer += decoder.decode(value, {stream: true})
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        const event = JSON.parse(line) as DetectionEvent

        if (event.type === 'progress') {
          counters.value = {
            processed: event.processed || 0,
            total: event.total || counters.value.total,
            created: event.created || 0,
            skipped: event.skipped || 0,
            missing: event.missing || 0,
            failed: event.failed || 0,
            faces: event.faces || 0,
          }
          currentPath.value = event.current || ''
          progress.value = counters.value.total
            ? Math.min((counters.value.processed / counters.value.total) * 100, 100)
            : 0
          if (taskId.value) {
            tasksStore.updateTask(taskId.value, {
              subtitle: t('settings_labels.database.detect_faces_progress', counters.value),
              progress: progress.value,
            })
          }
        }

        if (event.type === 'complete') {
          lastSummary.value = {
            created: event.created || 0,
            skipped: event.skipped || 0,
            missing: event.missing || 0,
            failed: event.failed || 0,
            faces: event.faces || 0,
            stopped: Boolean(event.stopped),
          }
          progress.value = 100
        }

        if (event.type === 'error') {
          throw new Error(event.message || t('settings_labels.database.detect_faces_api_unavailable'))
        }
      }
    }

    setNotification({
      type: 'success',
      text: t('settings_labels.database.detect_faces_complete', lastSummary.value || {
        created: 0, skipped: 0, missing: 0, failed: 0, faces: 0, stopped: false,
      }),
    })
  } catch (error: unknown) {
    if ((error as {name?: string})?.name !== 'AbortError') {
      setNotification({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    if (taskId.value) {
      tasksStore.removeTask(taskId.value)
      taskId.value = null
    }
    abortController.value = null
    running.value = false
    await refreshStatus()
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>
