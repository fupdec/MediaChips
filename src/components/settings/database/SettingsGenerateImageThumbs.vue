<template>
  <div id="settings-generate-image-thumbs" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.generate_image_thumbs')"
      icon="mdi-image-outline"
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

    <div v-if="statusLoading" class="text-body-2 text-medium-emphasis mb-4">
      {{ t('common.loading') }}
    </div>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.database.generate_image_thumbs_hint') }}
      </span>
    </v-alert>

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
      {{ t('settings_labels.database.generate_image_thumbs_progress', counters) }}
    </div>

    <div class="text-body-2 text-medium-emphasis mb-3">
      <template v-if="statusLoaded">
        {{ t('settings_labels.database.generate_image_thumbs_status', status) }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-3">
      {{ t('settings_labels.database.generate_image_thumbs_complete', lastSummary) }}
    </div>

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
        @click="startGeneration(false)"
        :disabled="!statusLoaded || statusLoading || status.pending === 0"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.generate_image_thumbs_start') }}
      </v-btn>

      <v-btn
        v-if="!active"
        @click="startGeneration(true)"
        :disabled="!statusLoaded || statusLoading || status.total === 0"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.generate_image_thumbs_regenerate') }}
      </v-btn>

      <v-btn
        v-if="active"
        @click="stopGeneration"
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

<script setup>
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {useApiBaseUrl} from '@/composable/useApiBaseUrl'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'

const {t} = useI18n()
const tasksStore = useTasksStore()
const apiBaseUrl = useApiBaseUrl()

const emptyStatus = {total: 0, pending: 0, generated: 0}

const status = ref({...emptyStatus})
const active = ref(false)
const progress = ref(0)
const currentPath = ref('')
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const lastSummary = ref(null)
const counters = ref({
  processed: 0,
  total: 0,
  created: 0,
  skipped: 0,
  missing: 0,
  failed: 0,
})

let abortController = null
let taskId = null

const fetchStatus = async () => {
  const baseUrl = apiBaseUrl.value
  if (!baseUrl) return

  statusLoading.value = true
  statusError.value = ''

  try {
    const response = await fetch(`${baseUrl}/api/Task/imageThumbsGenerationStatus`)

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(t('settings_labels.database.generate_image_thumbs_api_unavailable'))
      }
      throw new Error(response.statusText || 'Failed to load image thumbnails generation status')
    }

    status.value = await response.json()
    statusLoaded.value = true
  } catch (error) {
    statusError.value = error.message
    throw error
  } finally {
    statusLoading.value = false
  }
}

const refreshStatus = async () => {
  try {
    await fetchStatus()
  } catch (error) {
    console.error('Failed to load image thumbnails generation status:', error)
  }
}

const stopGeneration = () => {
  abortController?.abort()
}

const startGeneration = async (force = false) => {
  if (active.value) return

  if (!force && status.value.pending === 0) return
  if (force && status.value.total === 0) return

  active.value = true
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = null
  counters.value = {
    processed: 0,
    total: force ? status.value.total : status.value.pending,
    created: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  }

  abortController = new AbortController()
  const baseUrl = apiBaseUrl.value

  taskId = tasksStore.setTask({
    title: t('settings_labels.database.generate_image_thumbs'),
    subtitle: t('settings_labels.database.generate_image_thumbs_progress', counters.value),
    icon: 'mdi-image-outline',
    progress: 0,
    action: stopGeneration,
  })

  try {
    const response = await fetch(
      `${baseUrl}/api/Task/streamImageThumbsGeneration?force=${force ? 'true' : 'false'}`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        signal: abortController.signal,
        body: JSON.stringify({}),
      },
    )

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Image thumbnails generation request failed')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event) => {
      if (event.type === 'progress') {
        counters.value = {
          processed: event.processed || 0,
          total: event.total || counters.value.total,
          created: event.created || 0,
          skipped: event.skipped || 0,
          missing: event.missing || 0,
          failed: event.failed || 0,
        }
        currentPath.value = event.current || ''
        progress.value = event.total
          ? Math.min((event.processed / event.total) * 100, 100)
          : 0

        tasksStore.updateTask(taskId, {
          subtitle: t('settings_labels.database.generate_image_thumbs_progress', counters.value),
          progress: progress.value,
        })
      }

      if (event.type === 'complete') {
        const summary = {
          created: event.created || 0,
          skipped: event.skipped || 0,
          missing: event.missing || 0,
          failed: event.failed || 0,
          stopped: event.stopped === true,
        }
        lastSummary.value = summary
        progress.value = 100

        tasksStore.updateTask(taskId, {
          subtitle: event.stopped
            ? t('common.stop')
            : t('settings_labels.database.generate_image_thumbs_complete', summary),
          progress: 100,
          color: event.stopped ? 'warning' : 'success',
          done: true,
          action: () => {},
        })

        if (!event.stopped) {
          $operable.setNotification({
            type: summary.created > 0 ? 'success' : 'info',
            title: t('settings_labels.database.generate_image_thumbs'),
            text: t('settings_labels.database.generate_image_thumbs_complete', summary),
            icon: 'mdi-image-outline',
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Image thumbnails generation failed')
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
    if (error.name !== 'AbortError') {
      console.error('Image thumbnails generation failed:', error)
      $operable.setNotification({
        type: 'error',
        title: t('settings_labels.database.generate_image_thumbs'),
        text: error.message,
      })

      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: error.message,
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
