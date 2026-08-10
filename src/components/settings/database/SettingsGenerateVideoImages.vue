<template>
  <SettingsHealthTask id="settings-generate-video-images" :status="taskStatus">
  <div class="pb-1">
    <SettingsHealthSectionHeader
      :title="t('settings_labels.database.generate_video_images')"
      icon="image-auto-adjust"
      :hint="t('settings_labels.database.generate_video_images_hint')"
      :step="1"
      :status="taskStatus"
      :status-label="statusChipLabel"
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

    <v-progress-linear
      v-if="activeType"
      :model-value="progress"
      color="primary"
      height="8"
      rounded
      striped
      class="mb-2"
    />

    <div v-if="activeType && currentPath" class="text-caption text-medium-emphasis mb-4 selectable">
      {{ activeTypeLabel }} · {{ currentPath }}
    </div>

    <div v-if="activeType" class="text-caption text-medium-emphasis mb-4">
      {{ t('settings_labels.database.generate_video_images_progress', counters) }}
    </div>

    <div
      v-for="imageType in imageTypes"
      :key="imageType.id"
      class="mb-6"
    >
      <div class="text-subtitle-2 mb-1">
        {{ t(imageType.titleKey) }}
      </div>

      <div class="text-body-2 text-medium-emphasis mb-3">
        <template v-if="statusLoaded">
          {{ t('settings_labels.database.generate_video_images_status', status[imageType.id] || emptyStatus) }}
        </template>
        <template v-else>
          {{ t('settings_labels.database.status_not_loaded') }}
        </template>
      </div>

      <div v-if="lastSummary[imageType.id]" class="text-body-2 mb-3">
        {{ t('settings_labels.database.generate_video_images_complete', {
          created: lastSummary[imageType.id]!.created,
          skipped: lastSummary[imageType.id]!.skipped,
          missing: lastSummary[imageType.id]!.missing,
          failed: lastSummary[imageType.id]!.failed,
        }) }}
      </div>

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="activeType !== imageType.id"
          @click="startGeneration(imageType.id, false)"
          :disabled="!statusLoaded || statusLoading || !!activeType || (status[imageType.id]?.pending || 0) === 0"
          color="primary"
          rounded
          variant="flat"
          class="pr-4"
        >
          <v-icon icon="mdi-play" start/>
          {{ t('settings_labels.database.generate_video_images_start') }}
        </v-btn>

        <v-btn
          v-if="activeType !== imageType.id"
          @click="startGeneration(imageType.id, true)"
          :disabled="!statusLoaded || statusLoading || !!activeType || (status[imageType.id]?.total || 0) === 0"
          color="secondary"
          rounded
          variant="outlined"
          class="pr-4"
        >
          <v-icon icon="mdi-refresh" start/>
          {{ t('settings_labels.database.generate_video_images_regenerate') }}
        </v-btn>

        <v-btn
          v-if="activeType === imageType.id"
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
  </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {ref, computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {typedApi} from '@/services/typedApi'
import {getErrorStatus} from '@/types/vue'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import {setNotification} from '@/services/notificationService'

type ImageTypeId = 'preview' | 'grid' | 'marks'

interface ImageTypeConfig {
  id: ImageTypeId
  titleKey: string
}

interface ImageTypeStatus {
  total: number
  pending: number
  generated: number
}

interface GenerationCounters {
  processed: number
  total: number
  created: number
  skipped: number
  missing: number
  failed: number
}

interface GenerationSummary {
  created: number
  skipped: number
  missing: number
  failed: number
  stopped: boolean
}

interface GenerationEvent {
  type: 'progress' | 'complete' | 'error'
  processed?: number
  total?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  current?: string
  message?: string
  stopped?: boolean
}

const {t} = useI18n()
const tasksStore = useTasksStore()

const imageTypes: ImageTypeConfig[] = [
  {id: 'preview', titleKey: 'settings_labels.database.generate_video_images_preview'},
  {id: 'grid', titleKey: 'settings_labels.database.generate_video_images_grid'},
  {id: 'marks', titleKey: 'settings_labels.database.generate_video_images_marks'},
]

const emptyStatus: ImageTypeStatus = {total: 0, pending: 0, generated: 0}

const status = ref<Record<ImageTypeId, ImageTypeStatus>>({
  preview: {...emptyStatus},
  grid: {...emptyStatus},
  marks: {...emptyStatus},
})

const activeType = ref<ImageTypeId | null>(null)
const progress = ref(0)
const currentPath = ref('')
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const lastSummary = ref<Partial<Record<ImageTypeId, GenerationSummary | null>>>({})
const counters = ref<GenerationCounters>({
  processed: 0,
  total: 0,
  created: 0,
  skipped: 0,
  missing: 0,
  failed: 0,
})

let abortController: AbortController | null = null
let taskId: string | null = null

const activeTypeLabel = computed(() => {
  const item = imageTypes.find((type) => type.id === activeType.value)
  return item ? t(item.titleKey) : ''
})

const pendingTotal = computed(() =>
  imageTypes.reduce((sum, type) => sum + Number(status.value[type.id]?.pending || 0), 0),
)

const taskStatus = computed(() => {
  if (!statusLoaded.value) return 'idle' as const
  return pendingTotal.value > 0 ? 'pending' as const : 'done' as const
})

const statusChipLabel = computed(() => {
  if (taskStatus.value === 'pending') {
    return t('settings_labels.database.health_guide_pending', {count: pendingTotal.value})
  }
  if (taskStatus.value === 'done') {
    return t('settings_labels.database.health_guide_done')
  }
  return undefined
})

const fetchStatus = async () => {
  statusLoading.value = true
  statusError.value = ''

  try {
    const {data} = await typedApi.getVideoImagesGenerationStatus()
    status.value = {
      preview: {...emptyStatus, ...(data.preview || {})},
      grid: {...emptyStatus, ...(data.grid || {})},
      marks: {...emptyStatus, ...(data.marks || {})},
    }
    statusLoaded.value = true
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (getErrorStatus(error) === 404) {
      statusError.value = t('settings_labels.database.generate_video_images_api_unavailable')
    } else {
      statusError.value = err.message
    }
    throw err
  } finally {
    statusLoading.value = false
  }
}

const refreshStatus = async () => {
  try {
    await fetchStatus()
  } catch (error) {
    console.error('Failed to load video images generation status:', error)
  }
}

const stopGeneration = () => {
  abortController?.abort()
}

const startGeneration = async (imageType: ImageTypeId, force = false) => {
  if (activeType.value) return

  const typeStatus = status.value[imageType] || emptyStatus
  if (!force && typeStatus.pending === 0) return
  if (force && typeStatus.total === 0) return

  activeType.value = imageType
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = {...lastSummary.value, [imageType]: null}
  counters.value = {
    processed: 0,
    total: force ? typeStatus.total : typeStatus.pending,
    created: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  }

  abortController = new AbortController()

  const typeItem = imageTypes.find((type) => type.id === imageType)
  if (!typeItem) return

  taskId = tasksStore.setTask({
    title: t(typeItem.titleKey),
    subtitle: t('settings_labels.database.generate_video_images_progress', counters.value),
    icon: 'image-auto-adjust',
    progress: 0,
    action: stopGeneration,
  })
  const currentTaskId = taskId

  try {
    const handleEvent = (event: GenerationEvent) => {
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
          ? Math.min(((event.processed ?? 0) / event.total) * 100, 100)
          : 0

        tasksStore.updateTask(currentTaskId, {
          subtitle: t('settings_labels.database.generate_video_images_progress', counters.value),
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
        lastSummary.value = {...lastSummary.value, [imageType]: summary}
        progress.value = 100

        tasksStore.updateTask(currentTaskId, {
          subtitle: event.stopped
            ? t('common.stop')
            : t('settings_labels.database.generate_video_images_complete', {
              created: summary.created,
              skipped: summary.skipped,
              missing: summary.missing,
              failed: summary.failed,
            }),
          progress: 100,
          color: event.stopped ? 'warning' : 'success',
          done: true,
          action: undefined,
        })

        if (!event.stopped) {
          setNotification({
            type: summary.created > 0 ? 'success' : 'info',
            title: t(typeItem.titleKey),
            text: t('settings_labels.database.generate_video_images_complete', {
              created: summary.created,
              skipped: summary.skipped,
              missing: summary.missing,
              failed: summary.failed,
            }),
            icon: 'image-auto-adjust',
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Video images generation failed')
      }
    }

    await typedApi.streamVideoImagesGeneration(
      {type: imageType, force, signal: abortController.signal},
      handleEvent as (event: import('@/services/typedApi/tasks').GenerationStreamEvent) => void,
    )

    await fetchStatus()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (err.name !== 'AbortError') {
      console.error('Video images generation failed:', err)
      setNotification({
        type: 'error',
        title: t(typeItem.titleKey),
        text: err.message,
      })

      if (taskId) {
        tasksStore.updateTask(taskId, {
          subtitle: err.message,
          color: 'error',
          done: true,
          action: undefined,
        })
      }
    } else if (taskId) {
      tasksStore.updateTask(taskId, {
        subtitle: t('common.stop'),
        color: 'warning',
        done: true,
        action: undefined,
      })
    }
  } finally {
    activeType.value = null
    abortController = null
    currentPath.value = ''
    await fetchStatus().catch(() => {})
  }
}

onMounted(() => {
  void refreshStatus()
})
</script>

<style scoped>
.selectable {
  user-select: text;
  word-break: break-all;
}
</style>
