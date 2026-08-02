<template>
  <SettingsSection id="settings-local-ai">
    <div class="mx-4 pb-4">
      <settings-category-divider
        :title="t('settings_labels.local_ai.title')"
        icon="robot-outline"
      />

      <v-alert
        type="info"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-4"
      >
        <span class="text-caption">
          {{ t('settings_labels.local_ai.hint', {size: status.sizeMb || 1066}) }}
        </span>
      </v-alert>

      <v-alert
        color="primary"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-4"
      >
        <div class="text-caption font-weight-medium mb-1">
          {{ t('settings_labels.local_ai.how_to_title') }}
        </div>
        <ul class="text-caption pl-4 mb-0">
          <li>{{ t('settings_labels.local_ai.how_to_chat') }}</li>
          <li>{{ t('settings_labels.local_ai.how_to_regex') }}</li>
          <li>{{ t('settings_labels.local_ai.how_to_filters') }}</li>
          <li>{{ t('settings_labels.local_ai.how_to_docs') }}</li>
        </ul>
      </v-alert>

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

      <v-switch
        :model-value="enabled"
        inset
        hide-details
        class="mb-4"
        :disabled="busy"
        @update:model-value="onToggleEnabled"
      >
        <template #label>
          <div class="d-flex flex-column ml-2">
            <div>{{ t('settings_labels.local_ai.enable') }}</div>
            <div class="text-caption text-medium-emphasis">
              {{ t('settings_labels.local_ai.enable_hint') }}
            </div>
          </div>
        </template>
      </v-switch>

      <div class="text-body-2 text-medium-emphasis mb-3">
        {{ t('settings_labels.local_ai.status') }}:
        <strong>{{ statusLabel }}</strong>
        <span v-if="status.message"> — {{ status.message }}</span>
      </div>

      <v-progress-linear
        v-if="downloading"
        :model-value="progress"
        color="primary"
        height="8"
        rounded
        striped
        class="mb-2"
      />
      <div v-if="downloading && phaseLabel" class="text-caption text-medium-emphasis mb-4">
        {{ phaseLabel }}
      </div>

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="!downloading"
          color="primary"
          rounded
          variant="flat"
          class="pr-4"
          :disabled="!enabled || statusLoading || isReady"
          :loading="statusLoading"
          @click="confirmDownload = true"
        >
          <v-icon icon="mdi-download" start/>
          {{ t('settings_labels.local_ai.download') }}
        </v-btn>

        <v-btn
          v-if="downloading"
          color="error"
          rounded
          variant="flat"
          class="pr-4"
          @click="stopDownload"
        >
          <v-icon icon="mdi-stop" start/>
          {{ t('common.stop') }}
        </v-btn>

        <v-btn
          color="secondary"
          rounded
          variant="outlined"
          class="pr-4"
          :disabled="statusLoading || downloading"
          :loading="statusLoading"
          @click="refreshStatus"
        >
          <v-icon icon="mdi-refresh" start/>
          {{ t('settings_labels.database.refresh_status') }}
        </v-btn>

        <v-btn
          color="primary"
          rounded
          variant="tonal"
          class="pr-4"
          :disabled="!isReady || downloading"
          @click="openChat"
        >
          <v-icon icon="mdi-message-text-outline" start/>
          {{ t('settings_labels.local_ai.open_chat') }}
        </v-btn>

        <v-btn
          color="error"
          rounded
          variant="tonal"
          class="pr-4"
          :disabled="!hasModelFile || downloading || busy"
          @click="confirmDelete = true"
        >
          <v-icon icon="mdi-delete" start/>
          {{ t('settings_labels.local_ai.delete_model') }}
        </v-btn>
      </div>

      <DialogConfirm
        v-if="confirmDownload"
        variant="confirm"
        :dialog="confirmDownload"
        :text="t('settings_labels.local_ai.download_confirm', {size: status.sizeMb || 1066})"
        @confirm="onConfirmDownload"
        @close="confirmDownload = false"
      />

      <DialogConfirm
        v-if="confirmDelete"
        variant="confirm"
        :dialog="confirmDelete"
        :text="t('settings_labels.local_ai.delete_confirm')"
        @confirm="onConfirmDelete"
        @close="confirmDelete = false"
      />
    </div>
  </SettingsSection>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {useDialogsStore} from '@/stores/dialogs'
import {setNotification} from '@/services/notificationService'
import {
  deleteLocalAiModel,
  fetchLocalAiStatus,
  setLocalAiEnabled,
  streamLocalAiDownload,
  type LocalAiStatus,
} from '@/services/localAiClient'
import SettingsSection from '@/components/ui/SettingsSection.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'

const {t} = useI18n()
const tasksStore = useTasksStore()
const dialogsStore = useDialogsStore()

const status = ref<LocalAiStatus>({status: 'disabled', enabled: false, sizeMb: 1066})
const statusLoading = ref(false)
const statusError = ref('')
const downloading = ref(false)
const progress = ref(0)
const phaseLabel = ref('')
const confirmDownload = ref(false)
const confirmDelete = ref(false)
const busy = ref(false)

let abortController: AbortController | null = null
let taskId: string | null = null

const enabled = computed(() => Boolean(status.value.enabled))
const isReady = computed(() => ['downloaded', 'loaded'].includes(status.value.status))
const hasModelFile = computed(() => ['downloaded', 'loaded', 'error'].includes(status.value.status)
  || Boolean(status.value.path && status.value.status !== 'not_downloaded' && status.value.status !== 'disabled'))

const statusLabel = computed(() => {
  const key = `settings.path_parser.statuses.${status.value.status}`
  const translated = t(key)
  return translated === key ? status.value.status : translated
})

async function refreshStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    status.value = await fetchLocalAiStatus()
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : String(error)
  } finally {
    statusLoading.value = false
  }
}

async function onToggleEnabled(value: boolean | null) {
  busy.value = true
  statusError.value = ''
  try {
    status.value = await setLocalAiEnabled(Boolean(value))
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

function stopDownload() {
  abortController?.abort()
}

function openChat() {
  dialogsStore.localAi.show = true
}

function onConfirmDownload() {
  confirmDownload.value = false
  void startDownload()
}

async function startDownload() {
  if (downloading.value) return
  downloading.value = true
  progress.value = 0
  phaseLabel.value = ''
  statusError.value = ''
  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.local_ai.title'),
    subtitle: t('settings_labels.local_ai.downloading'),
    icon: 'robot-outline',
    progress: 0,
    action: stopDownload,
  })

  try {
    await streamLocalAiDownload(abortController.signal, (event) => {
      if (event.type === 'status') {
        phaseLabel.value = event.message || ''
        if (typeof event.percent === 'number') {
          progress.value = event.percent
          if (taskId != null) {
            tasksStore.updateTask(taskId, {
              progress: event.percent,
              subtitle: phaseLabel.value,
            })
          }
        }
      }
      if (event.type === 'error') {
        statusError.value = event.message || t('common.error')
      }
      if (event.type === 'done') {
        progress.value = 100
      }
    })
    await refreshStatus()
    setNotification({type: 'success', text: t('settings_labels.local_ai.download_done')})
  } catch (error) {
    if ((error as Error)?.name !== 'AbortError') {
      statusError.value = error instanceof Error ? error.message : String(error)
    }
  } finally {
    downloading.value = false
    if (taskId != null) {
      tasksStore.removeTask(taskId)
      taskId = null
    }
    abortController = null
  }
}

async function onConfirmDelete() {
  confirmDelete.value = false
  busy.value = true
  statusError.value = ''
  try {
    const result = await deleteLocalAiModel()
    status.value = result.status
    setNotification({type: 'success', text: t('settings_labels.local_ai.delete_done')})
  } catch (error) {
    statusError.value = error instanceof Error ? error.message : String(error)
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>
