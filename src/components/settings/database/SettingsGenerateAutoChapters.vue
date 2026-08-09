<template>
  <div id="settings-generate-auto-chapters" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.generate_auto_chapters')"
      icon="bookmark-multiple-outline"
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
        {{ t('settings_labels.database.generate_auto_chapters_hint') }}
      </span>
    </v-alert>

    <div v-if="statusLoading" class="text-body-2 text-medium-emphasis mb-4">
      {{ t('common.loading') }}
    </div>

    <div v-else-if="statusLoaded" class="text-body-2 text-medium-emphasis mb-3">
      {{ t('settings_labels.database.generate_auto_chapters_status', status) }}
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

    <div v-if="running && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ currentPath }}
    </div>

    <div v-if="running" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.generate_auto_chapters_progress', counters) }}
    </div>

    <div v-if="lastSummary" class="text-body-2 mb-3">
      {{ t('settings_labels.database.generate_auto_chapters_complete', lastSummary) }}
    </div>

    <div class="d-flex flex-wrap ga-2">
      <v-btn
        v-if="!running"
        color="primary"
        rounded
        variant="flat"
        class="pr-4"
        :disabled="!statusLoaded || statusLoading || status.pending === 0"
        @click="startGeneration(false)"
      >
        <v-icon icon="mdi-play" start/>
        {{ t('settings_labels.database.generate_auto_chapters_start') }}
      </v-btn>

      <v-btn
        v-if="!running"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
        :disabled="!statusLoaded || statusLoading || status.total === 0"
        @click="startGeneration(true)"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.generate_auto_chapters_regenerate') }}
      </v-btn>

      <v-btn
        v-if="running"
        color="error"
        rounded
        variant="flat"
        class="pr-4"
        @click="stopGeneration"
      >
        <v-icon icon="mdi-stop" start/>
        {{ t('common.stop') }}
      </v-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import {onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useTasksStore} from '@/stores/tasks'
import {setNotification} from '@/services/notificationService'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'

const {t, locale} = useI18n()
const tasksStore = useTasksStore()

const status = ref({total: 0, withChapters: 0, pending: 0})
const statusLoaded = ref(false)
const statusLoading = ref(false)
const statusError = ref('')
const running = ref(false)
const progress = ref(0)
const currentPath = ref('')
const counters = ref({processed: 0, total: 0, created: 0, skipped: 0, failed: 0})
const lastSummary = ref<{created: number; skipped: number; failed: number} | null>(null)

let abortController: AbortController | null = null
let taskId: string | number | null = null

async function fetchStatus() {
  statusLoading.value = true
  statusError.value = ''
  try {
    const response = await typedApi.getAutoChapterGenerationStatus()
    const data = (response.data || {}) as {
      total?: number
      withChapters?: number
      pending?: number
    }
    status.value = {
      total: Number(data.total) || 0,
      withChapters: Number(data.withChapters) || 0,
      pending: Number(data.pending) || 0,
    }
    statusLoaded.value = true
  } catch (error) {
    statusError.value = error instanceof Error
      ? error.message
      : t('settings_labels.database.generate_auto_chapters_api_unavailable')
    statusLoaded.value = false
  } finally {
    statusLoading.value = false
  }
}

function stopGeneration() {
  abortController?.abort()
}

async function startGeneration(force: boolean) {
  if (running.value) return
  running.value = true
  progress.value = 0
  currentPath.value = ''
  counters.value = {processed: 0, total: status.value.total, created: 0, skipped: 0, failed: 0}
  lastSummary.value = null
  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t('settings_labels.database.generate_auto_chapters'),
    subtitle: t('settings_labels.database.generate_auto_chapters_progress', {
      ...counters.value,
      percent: 0,
    }),
    icon: 'bookmark-multiple-outline',
    progress: 0,
    action: () => abortController?.abort(),
  })

  try {
    await typedApi.streamAutoChapterGeneration(
      {
        force,
        useSilence: true,
        useLlmTitles: true,
        locale: String(locale.value || 'en'),
      },
      {signal: abortController.signal},
      (event) => {
        if (event.type === 'progress' || event.type === 'item') {
          counters.value = {
            processed: Number(event.processed) || 0,
            total: Number(event.total) || counters.value.total,
            created: Number(event.created) || 0,
            skipped: Number(event.skipped) || 0,
            failed: Number(event.failed) || 0,
          }
          if (event.path) currentPath.value = String(event.path)
          const itemProgress = Math.min(1, Math.max(0, Number(event.itemProgress) || 0))
          const effective = counters.value.processed
            + (event.type === 'progress' ? itemProgress : 0)
          progress.value = counters.value.total > 0
            ? Math.min((effective / counters.value.total) * 100, 100)
            : 0
          if (taskId != null) {
            tasksStore.updateTask(String(taskId), {
              subtitle: t('settings_labels.database.generate_auto_chapters_progress', {
                ...counters.value,
                percent: Math.round(progress.value),
              }),
              progress: progress.value,
            })
          }
        }
        if (event.type === 'complete') {
          lastSummary.value = {
            created: Number(event.created) || 0,
            skipped: Number(event.skipped) || 0,
            failed: Number(event.failed) || 0,
          }
          progress.value = 100
          if (taskId != null) {
            tasksStore.updateTask(String(taskId), {
              subtitle: event.stopped
                ? t('common.stop')
                : t('settings_labels.database.generate_auto_chapters_complete', lastSummary.value),
              progress: 100,
              color: event.stopped ? 'warning' : 'success',
              done: true,
              action: undefined,
            })
          }
          if (!event.stopped) {
            setNotification({
              type: (lastSummary.value.created || 0) > 0 ? 'success' : 'info',
              title: t('settings_labels.database.generate_auto_chapters'),
              text: t('settings_labels.database.generate_auto_chapters_complete', lastSummary.value),
              icon: 'bookmark-multiple-outline',
            })
          }
        }
        if (event.type === 'error') {
          throw new Error(event.message || 'Auto chapter generation failed')
        }
      },
    )
    await fetchStatus()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (err.name !== 'AbortError') {
      setNotification({
        type: 'error',
        title: t('settings_labels.database.generate_auto_chapters'),
        text: err.message,
      })
      if (taskId != null) {
        tasksStore.updateTask(taskId, {
          subtitle: err.message,
          color: 'error',
          done: true,
          action: undefined,
        })
      }
    } else if (taskId != null) {
      tasksStore.updateTask(taskId, {
        subtitle: t('common.stop'),
        color: 'warning',
        done: true,
        action: undefined,
      })
    }
  } finally {
    running.value = false
    abortController = null
    taskId = null
  }
}

onMounted(() => {
  void fetchStatus()
})

onBeforeUnmount(() => {
  abortController?.abort()
})
</script>
