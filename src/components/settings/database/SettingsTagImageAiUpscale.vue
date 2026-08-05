<template>
  <SettingsSection
    v-if="visible"
    id="settings-tag-image-ai-upscale"
  >
    <div class="mx-4 pb-4">
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
        {{ progressLabel || t('settings_labels.database.tag_image_ai_upscale_progress', counters) }}
      </div>

      <div class="text-body-2 text-medium-emphasis mb-3">
        <template v-if="statusLoaded">
          {{ t('settings_labels.database.tag_image_ai_upscale_status') }}
        </template>
        <template v-else>
          {{ t('settings_labels.database.status_not_loaded') }}
        </template>
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
  </SettingsSection>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {setNotification} from '@/services/notificationService'
import {getReadableDuration} from '@/services/formatUtils'
import SettingsSection from '@/components/ui/SettingsSection.vue'
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

/** Hidden until status says the one-time upgrade is still needed. */
const visible = ref(false)
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
const progressLabel = ref('')
const confirmDialog = ref(false)
const counters = ref({
  processed: 0,
  total: 0,
  upscaled: 0,
  failed: 0,
})

let abortController: AbortController | null = null
let taskId: string | null = null
/** Wall-clock start of the upscale loop (after download). */
let progressStartedAt: number | null = null

const formatProgressLabel = () => {
  const {processed, total, upscaled, failed} = counters.value
  if (progressStartedAt && processed > 0 && total > processed) {
    const elapsedSeconds = (Date.now() - progressStartedAt) / 1000
    const etaSeconds = Math.round((elapsedSeconds / processed) * (total - processed))
    if (etaSeconds > 0) {
      return t('settings_labels.database.tag_image_ai_upscale_progress_eta', {
        processed,
        total,
        upscaled,
        failed,
        eta: getReadableDuration(etaSeconds),
      })
    }
  }
  return t('settings_labels.database.tag_image_ai_upscale_progress', {
    processed,
    total,
    upscaled,
    failed,
  })
}

const notifyCompletion = (summary: {
  upscaled: number
  failed: number
  processed: number
  orphansDeleted: number
  foldersRemoved: number
  foldersCreated: number
  imagesResized: number
}) => {
  const text = t('settings_labels.database.tag_image_ai_upscale_complete', summary)
  if (summary.failed > 0 && summary.upscaled === 0) {
    setNotification({type: 'error', text})
    return
  }
  if (summary.failed > 0) {
    setNotification({type: 'warning', text})
    return
  }
  setNotification({type: 'success', text})
}

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
    visible.value = !status.value.done
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    statusError.value = err.message
    // Keep a visible error card only if upgrade might still be relevant.
    if (!status.value.done) {
      visible.value = true
    }
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
  progressLabel.value = ''
  statusError.value = ''
  progressStartedAt = null
  counters.value = {
    processed: 0,
    total: status.value.pendingCount || 0,
    upscaled: 0,
    failed: 0,
  }
  progressLabel.value = formatProgressLabel()

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.database.tag_image_ai_upscale'),
    subtitle: progressLabel.value,
    icon: 'image-auto-adjust',
    progress: 0,
    action: stopUpscale,
  })

  let finishedWithDone = false

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
          if (taskId != null) {
            tasksStore.updateTask(taskId, {subtitle: phaseLabel.value})
          }
        }

        if (event.type === 'cleanup') {
          phaseLabel.value = t('settings_labels.database.tag_image_ai_upscale_cleanup')
          if (taskId != null) {
            tasksStore.updateTask(taskId, {
              subtitle: t('settings_labels.database.tag_image_ai_upscale_cleanup'),
            })
          }
        }

        if (event.type === 'ready' || event.type === 'status') {
          if (event.total != null) counters.value.total = Number(event.total) || 0
          phaseLabel.value = t('settings_labels.database.tag_image_ai_upscale_processing')
          if (!progressStartedAt && event.type === 'ready') {
            progressStartedAt = Date.now()
          }
          progressLabel.value = formatProgressLabel()
          if (taskId != null) {
            tasksStore.updateTask(taskId, {subtitle: progressLabel.value})
          }
        }

        if (event.type === 'progress' || event.type === 'item') {
          if (!progressStartedAt) progressStartedAt = Date.now()
          counters.value = {
            processed: Number(event.processed) || counters.value.processed,
            total: Number(event.total) || counters.value.total,
            upscaled: Number(event.upscaled) || counters.value.upscaled,
            failed: Number(event.failed) || counters.value.failed,
          }
          currentPath.value = event.path || currentPath.value
          const total = Math.max(counters.value.total, 1)
          progress.value = Math.round((counters.value.processed / total) * 100)
          progressLabel.value = formatProgressLabel()
          if (taskId != null) {
            tasksStore.updateTask(taskId, {
              progress: progress.value,
              subtitle: progressLabel.value,
            })
          }
        }

        if (event.type === 'done') {
          finishedWithDone = true
          const summary = {
            upscaled: Number(event.upscaled) || 0,
            failed: Number(event.failed) || 0,
            processed: Number(event.processed) || 0,
            orphansDeleted: Number(event.orphansDeleted) || 0,
            foldersRemoved: Number(event.foldersRemoved) || 0,
            foldersCreated: Number(event.foldersCreated) || 0,
            imagesResized: Number(event.imagesResized) || 0,
          }
          notifyCompletion(summary)
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

    if (!finishedWithDone) {
      await refreshStatus()
    }
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      const message = error.message || String(error)
      statusError.value = message
      setNotification({type: 'error', text: message})
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
    progressStartedAt = null
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>
