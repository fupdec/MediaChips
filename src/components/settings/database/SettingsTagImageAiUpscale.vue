<template>
  <div
    v-if="visible"
    id="settings-tag-image-ai-upscale"
    class="mx-4 pb-4"
  >
    <settings-category-divider
      :title="t('settings_labels.database.tag_image_ai_upscale')"
      icon="image-auto-adjust"
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
        {{ t('settings_labels.database.tag_image_ai_upscale_hint', {size: status.downloadSizeMb || 50}) }}
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

    <div v-if="active && phaseLabel" class="text-caption text-medium-emphasis mb-2">
      {{ phaseLabel }}
    </div>

    <div v-if="active && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="active" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.tag_image_ai_upscale_progress', counters) }}
    </div>

    <div class="text-body-2 text-medium-emphasis mb-3">
      <template v-if="statusLoaded">
        {{ t('settings_labels.database.tag_image_ai_upscale_status') }}
      </template>
      <template v-else>
        {{ t('settings_labels.database.status_not_loaded') }}
      </template>
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-3">
      {{ t('settings_labels.database.tag_image_ai_upscale_complete', lastSummary) }}
    </div>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!active"
        @click="confirmDialog = true"
        :disabled="!statusLoaded || statusLoading"
        :loading="statusLoading"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.tag_image_ai_upscale_start') }}
      </v-btn>

      <v-btn
        v-if="active"
        @click="stopUpscale"
        color="error"
        rounded
        variant="flat"
        class="pr-4"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.stop') }}
      </v-btn>
    </div>

    <DialogConfirm
      v-if="confirmDialog"
      variant="confirm"
      :dialog="confirmDialog"
      @confirm="onConfirmStart"
      @close="confirmDialog = false"
      :text="t('settings_labels.database.tag_image_ai_upscale_confirm', {size: status.downloadSizeMb || 50})"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'

const {t} = useI18n()
const tasksStore = useTasksStore()

const buildRequestHeaders = (withJson = false) => {
  const token = getAuthToken()
  return {
    ...(withJson ? {'Content-Type': 'application/json'} : {}),
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  }
}

const visible = ref(true)
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const status = ref({
  done: false,
  pendingCount: 0,
  byType: {},
  downloadSizeMb: 50,
  suggested: false,
})
const active = ref(false)
const progress = ref(0)
const currentPath = ref('')
const phaseLabel = ref('')
const confirmDialog = ref(false)
const lastSummary = ref(null)
const counters = ref({
  processed: 0,
  total: 0,
  upscaled: 0,
  failed: 0,
})

let abortController = null
let taskId = null

const fetchStatus = async () => {
  statusLoading.value = true
  statusError.value = ''

  try {
    const response = await fetch(
      buildApiUrl('/api/Task/tagImageAiUpscaleStatus'),
      {headers: buildRequestHeaders()},
    )

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(t('settings_labels.database.tag_image_ai_upscale_api_unavailable'))
      }
      throw new Error(response.statusText || 'Failed to load tag image AI upscale status')
    }

    status.value = await response.json()
    statusLoaded.value = true
    if (status.value.done) {
      visible.value = false
    }
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
    console.error('Failed to load tag image AI upscale status:', error)
  }
}

const stopUpscale = () => {
  abortController?.abort()
}

const onConfirmStart = () => {
  confirmDialog.value = false
  void startUpscale()
}

const startUpscale = async () => {
  if (active.value) return

  active.value = true
  progress.value = 0
  currentPath.value = ''
  phaseLabel.value = ''
  lastSummary.value = null
  counters.value = {
    processed: 0,
    total: status.value.pendingCount || 0,
    upscaled: 0,
    failed: 0,
  }

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.database.tag_image_ai_upscale'),
    subtitle: t('settings_labels.database.tag_image_ai_upscale_progress', counters.value),
    icon: 'mdi-image-auto-adjust',
    progress: 0,
    action: stopUpscale,
  })

  try {
    const response = await fetch(
      buildApiUrl('/api/Task/streamTagImageAiUpscale'),
      {
        method: 'POST',
        headers: buildRequestHeaders(true),
        signal: abortController.signal,
        body: JSON.stringify({}),
      },
    )

    if (!response.ok || !response.body) {
      throw new Error(response.statusText || 'Tag image AI upscale request failed')
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
        let event
        try {
          event = JSON.parse(line)
        } catch {
          continue
        }

        if (event.type === 'downloading') {
          phaseLabel.value = t('settings_labels.database.tag_image_ai_upscale_downloading', {
            size: event.downloadSizeMb || status.value.downloadSizeMb || 50,
          })
        }

        if (event.type === 'ready' || event.type === 'status') {
          if (event.total != null) counters.value.total = Number(event.total) || 0
          phaseLabel.value = t('settings_labels.database.tag_image_ai_upscale_processing')
        }

        if (event.type === 'progress' || event.type === 'item') {
          counters.value = {
            processed: Number(event.processed) || counters.value.processed,
            total: Number(event.total) || counters.value.total,
            upscaled: Number(event.upscaled) || counters.value.upscaled,
            failed: Number(event.failed) || counters.value.failed,
          }
          currentPath.value = event.path || currentPath.value
          const total = Math.max(counters.value.total, 1)
          progress.value = Math.round((counters.value.processed / total) * 100)
          if (taskId != null) {
            tasksStore.updateTask(taskId, {
              progress: progress.value,
              subtitle: t('settings_labels.database.tag_image_ai_upscale_progress', counters.value),
            })
          }
        }

        if (event.type === 'done') {
          lastSummary.value = {
            upscaled: Number(event.upscaled) || 0,
            failed: Number(event.failed) || 0,
            processed: Number(event.processed) || 0,
          }
          visible.value = false
        }

        if (event.type === 'error') {
          throw new Error(event.message || 'Tag image AI upscale failed')
        }

        if (event.type === 'aborted') {
          phaseLabel.value = t('common.stop')
        }
      }
    }

    await refreshStatus()
  } catch (error) {
    if (error?.name !== 'AbortError') {
      statusError.value = error.message || String(error)
      console.error('Tag image AI upscale failed:', error)
    }
    await refreshStatus()
  } finally {
    active.value = false
    if (taskId != null) {
      tasksStore.removeTask(taskId)
      taskId = null
    }
    abortController = null
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>
