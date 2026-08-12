<template>
  <SettingsHealthTask
    v-for="item in mediaTypes"
    :id="item.domId"
    :key="item.id"
    :status="taskStatusOf(item.id)"
    compact
  >
    <div>
      <SettingsHealthSectionHeader
        :title="t(item.titleKey)"
        :icon="item.icon"
        :hint="t(item.hintKey)"
        :status="taskStatusOf(item.id)"
        :status-label="statusChipLabelOf(item.id)"
        compact
      />

      <v-alert
        v-if="statusError"
        type="error"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-3"
      >
        <span class="text-caption">{{ statusError }}</span>
      </v-alert>

      <SettingsHealthProgress
        v-if="statusLoaded || statusLoading"
        :label="statusLabelOf(item)"
        :percent="statusPercentOf(item.id)"
        :active="activeId === item.id"
        :striped="activeId === item.id"
      />

      <div
        v-if="activeId === item.id && currentPath"
        class="text-caption text-medium-emphasis mb-3 selectable"
      >
        {{ currentPath }}
      </div>

      <div
        v-if="activeId === item.id"
        class="text-caption text-medium-emphasis mb-3"
      >
        {{ t(item.progressKey, counters) }}
      </div>

      <div
        v-else-if="lastSummary[item.id]"
        class="text-body-2 mb-3"
      >
        {{ t(item.completeKey, lastSummary[item.id]!) }}
      </div>

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-if="activeId !== item.id"
          :disabled="!canStart(item.id, false)"
          :loading="statusLoading && !statusLoaded"
          color="primary"
          rounded
          variant="flat"
          class="pr-4"
          @click="startGeneration(item.id, false)"
        >
          <v-icon icon="mdi-play" start/>
          {{ t(item.startKey) }}
        </v-btn>

        <v-btn
          v-if="activeId !== item.id"
          :disabled="!canStart(item.id, true)"
          color="secondary"
          rounded
          variant="outlined"
          class="pr-4"
          @click="startGeneration(item.id, true)"
        >
          <v-icon icon="mdi-refresh" start/>
          {{ t(item.regenerateKey) }}
        </v-btn>

        <v-btn
          v-else
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
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {ref, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTasksStore} from '@/stores/tasks'
import {typedApi} from '@/services/typedApi'
import {getErrorStatus} from '@/types/vue'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import SettingsHealthProgress from '@/components/settings/database/SettingsHealthProgress.vue'
import {setNotification} from '@/services/notificationService'

type MediaTypeId = 'preview' | 'grid' | 'marks' | 'image_thumbs'
type VideoTypeId = 'preview' | 'grid' | 'marks'

interface MediaTypeConfig {
  id: MediaTypeId
  kind: 'video' | 'image'
  titleKey: string
  hintKey: string
  statusKey: string
  startKey: string
  regenerateKey: string
  progressKey: string
  completeKey: string
  icon: string
  domId: string
}

interface TypeStatus {
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

const mediaTypes: MediaTypeConfig[] = [
  {
    id: 'preview',
    kind: 'video',
    titleKey: 'settings_labels.database.generate_video_images_preview',
    hintKey: 'settings_labels.database.generate_video_images_preview_hint',
    statusKey: 'settings_labels.database.generate_video_images_status',
    startKey: 'settings_labels.database.generate_video_images_start',
    regenerateKey: 'settings_labels.database.generate_video_images_regenerate',
    progressKey: 'settings_labels.database.generate_video_images_progress',
    completeKey: 'settings_labels.database.generate_video_images_complete',
    icon: 'movie-open-outline',
    // Keep legacy deep-link id used by prepare-library / settings routes.
    domId: 'settings-generate-video-images',
  },
  {
    id: 'grid',
    kind: 'video',
    titleKey: 'settings_labels.database.generate_video_images_grid',
    hintKey: 'settings_labels.database.generate_video_images_grid_hint',
    statusKey: 'settings_labels.database.generate_video_images_status',
    startKey: 'settings_labels.database.generate_video_images_start',
    regenerateKey: 'settings_labels.database.generate_video_images_regenerate',
    progressKey: 'settings_labels.database.generate_video_images_progress',
    completeKey: 'settings_labels.database.generate_video_images_complete',
    icon: 'view-grid-outline',
    domId: 'settings-generate-video-images-grid',
  },
  {
    id: 'marks',
    kind: 'video',
    titleKey: 'settings_labels.database.generate_video_images_marks',
    hintKey: 'settings_labels.database.generate_video_images_marks_hint',
    statusKey: 'settings_labels.database.generate_video_images_status',
    startKey: 'settings_labels.database.generate_video_images_start',
    regenerateKey: 'settings_labels.database.generate_video_images_regenerate',
    progressKey: 'settings_labels.database.generate_video_images_progress',
    completeKey: 'settings_labels.database.generate_video_images_complete',
    icon: 'bookmark-outline',
    domId: 'settings-generate-video-images-marks',
  },
  {
    id: 'image_thumbs',
    kind: 'image',
    titleKey: 'settings_labels.database.generate_image_thumbs',
    hintKey: 'settings_labels.database.generate_image_thumbs_hint',
    statusKey: 'settings_labels.database.generate_image_thumbs_status',
    startKey: 'settings_labels.database.generate_image_thumbs_start',
    regenerateKey: 'settings_labels.database.generate_image_thumbs_regenerate',
    progressKey: 'settings_labels.database.generate_image_thumbs_progress',
    completeKey: 'settings_labels.database.generate_image_thumbs_complete',
    icon: 'image-outline',
    domId: 'settings-generate-image-thumbs',
  },
]

const emptyStatus: TypeStatus = {total: 0, pending: 0, generated: 0}

const status = ref<Record<MediaTypeId, TypeStatus>>({
  preview: {...emptyStatus},
  grid: {...emptyStatus},
  marks: {...emptyStatus},
  image_thumbs: {...emptyStatus},
})

const activeId = ref<MediaTypeId | null>(null)
const progress = ref(0)
const currentPath = ref('')
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const lastSummary = ref<Partial<Record<MediaTypeId, GenerationSummary | null>>>({})
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

function statusOf(id: MediaTypeId): TypeStatus {
  return status.value[id] || emptyStatus
}

function pendingOf(id: MediaTypeId): number {
  return Number(statusOf(id).pending || 0)
}

function taskStatusOf(id: MediaTypeId): 'idle' | 'pending' | 'done' {
  if (!statusLoaded.value) return 'idle'
  return pendingOf(id) > 0 ? 'pending' : 'done'
}

function statusChipLabelOf(id: MediaTypeId): string | undefined {
  const state = taskStatusOf(id)
  if (state === 'pending') {
    return t('settings_labels.database.health_guide_pending', {count: pendingOf(id)})
  }
  if (state === 'done') {
    return t('settings_labels.database.health_guide_done')
  }
  return undefined
}

function canStart(id: MediaTypeId, force: boolean): boolean {
  if (!statusLoaded.value || statusLoading.value || activeId.value) return false
  const item = statusOf(id)
  return force ? item.total > 0 : item.pending > 0
}

function statusLabelOf(item: MediaTypeConfig): string {
  if (statusLoaded.value) return t(item.statusKey, statusOf(item.id))
  if (statusLoading.value) return t('common.loading')
  return t('settings_labels.database.status_not_loaded')
}

function statusPercentOf(id: MediaTypeId): number {
  if (activeId.value === id) return progress.value
  const item = statusOf(id)
  if (!item.total) return 0
  return Math.min((Number(item.generated || 0) / Number(item.total)) * 100, 100)
}

const fetchStatus = async () => {
  statusLoading.value = true
  statusError.value = ''

  try {
    const [videoRes, imageRes] = await Promise.all([
      typedApi.getVideoImagesGenerationStatus(),
      typedApi.getImageThumbsGenerationStatus(),
    ])
    status.value = {
      preview: {...emptyStatus, ...(videoRes.data.preview || {})},
      grid: {...emptyStatus, ...(videoRes.data.grid || {})},
      marks: {...emptyStatus, ...(videoRes.data.marks || {})},
      image_thumbs: {...emptyStatus, ...(imageRes.data || {})},
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
    console.error('Failed to load media images generation status:', error)
  }
}

const stopGeneration = () => {
  abortController?.abort()
}

const startGeneration = async (id: MediaTypeId, force = false) => {
  if (activeId.value) return

  const typeStatus = statusOf(id)
  if (!force && typeStatus.pending === 0) return
  if (force && typeStatus.total === 0) return

  const config = mediaTypes.find((item) => item.id === id)
  if (!config) return

  activeId.value = id
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = {...lastSummary.value, [id]: null}
  counters.value = {
    processed: 0,
    total: force ? typeStatus.total : typeStatus.pending,
    created: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
  }

  abortController = new AbortController()

  taskId = tasksStore.setTask({
    title: t(config.titleKey),
    subtitle: t(config.progressKey, counters.value),
    icon: config.icon,
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
          subtitle: t(config.progressKey, counters.value),
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
        lastSummary.value = {...lastSummary.value, [id]: summary}
        progress.value = 100

        tasksStore.updateTask(currentTaskId, {
          subtitle: event.stopped
            ? t('common.stop')
            : t(config.completeKey, summary),
          progress: 100,
          color: event.stopped ? 'warning' : 'success',
          done: true,
          action: undefined,
        })

        if (!event.stopped) {
          setNotification({
            type: summary.created > 0 ? 'success' : 'info',
            title: t(config.titleKey),
            text: t(config.completeKey, summary),
            icon: config.icon,
          })
        }
      }

      if (event.type === 'error') {
        throw new Error(event.message || 'Media images generation failed')
      }
    }

    if (config.kind === 'image') {
      await typedApi.streamImageThumbsGeneration(
        {force, signal: abortController.signal},
        handleEvent as (event: import('@/services/typedApi/tasks').GenerationStreamEvent) => void,
      )
    } else {
      await typedApi.streamVideoImagesGeneration(
        {type: id as VideoTypeId, force, signal: abortController.signal},
        handleEvent as (event: import('@/services/typedApi/tasks').GenerationStreamEvent) => void,
      )
    }

    await fetchStatus()
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))
    if (err.name !== 'AbortError') {
      console.error('Media images generation failed:', err)
      setNotification({
        type: 'error',
        title: t(config.titleKey),
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
    activeId.value = null
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
