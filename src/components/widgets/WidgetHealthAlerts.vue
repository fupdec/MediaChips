<template>
  <section class="widget-health-alerts mb-6">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6">
        <v-icon class="mr-2" size="24">mdi-heart-pulse</v-icon>
        <span>{{ t('home.widgets.health_title') }}</span>
      </div>

      <v-btn
        v-if="checked && !loading"
        @click="runCheck"
        color="primary"
        icon
        size="small"
        variant="text"
        :title="t('home.widgets.health_run_check')"
      >
        <v-icon>mdi-refresh</v-icon>
      </v-btn>
    </div>

    <v-btn
      v-if="!checked && !loading"
      @click="runCheck"
      color="primary"
      rounded
      variant="tonal"
      prepend-icon="mdi-play-circle-outline"
    >
      {{ t('home.widgets.health_run_check') }}
    </v-btn>

    <div v-if="loading" class="mt-2">
      <v-progress-linear indeterminate color="primary" rounded height="4" class="mb-2"/>
      <div class="text-caption text-medium-emphasis">
        {{ t('home.widgets.health_checking') }}
      </div>
    </div>

    <template v-else-if="checked">
      <div class="widget-health-alerts__score d-flex align-center ga-4 mb-3">
        <div
          class="widget-health-alerts__score-value text-h3 font-weight-bold"
          :class="scoreToneClass"
        >
          {{ health.score }}
        </div>
        <div>
          <div class="text-body-1 font-weight-medium">{{ scoreLabel }}</div>
          <div class="text-caption text-medium-emphasis">
            {{ databaseSizeLabel }}
          </div>
        </div>
      </div>

      <div
        v-if="canFixSafe"
        class="mb-2"
      >
        <div class="d-flex flex-wrap ga-2 align-center">
          <v-btn
            v-if="!healthFix.state.value.running"
            color="primary"
            rounded
            variant="flat"
            prepend-icon="mdi-auto-fix"
            @click="fixSafeIssues"
          >
            {{ primaryFixLabel }}
          </v-btn>
          <v-btn
            v-else
            color="error"
            rounded
            variant="flat"
            prepend-icon="mdi-stop"
            @click="healthFix.stop()"
          >
            {{ t('common.stop') }}
          </v-btn>
          <v-btn
            color="primary"
            size="small"
            variant="text"
            rounded
            @click="openDatabaseSettings"
          >
            {{ t('home.widgets.health_open_settings') }}
          </v-btn>
        </div>
        <div
          v-if="healthFix.state.value.running"
          class="text-caption text-medium-emphasis mt-2"
        >
          {{ fixProgressLabel }}
        </div>
        <v-progress-linear
          v-if="healthFix.state.value.running"
          :model-value="healthFix.state.value.progress"
          color="primary"
          height="4"
          rounded
          class="mt-1"
        />
      </div>

      <v-alert
        v-if="!issueAlerts.length"
        type="success"
        icon="mdi-check-circle-outline"
        variant="tonal"
        rounded="lg"
        density="compact"
        class="mb-2"
      >
        {{ t('home.widgets.health_no_issues') }}
      </v-alert>

      <div v-else class="d-flex flex-column ga-2 mb-2">
        <v-alert
          v-for="alert in issueAlerts"
          :key="alert.id"
          :type="alert.type"
          :icon="alert.icon"
          variant="tonal"
          rounded="lg"
          density="compact"
          class="widget-health-alerts__item"
        >
          <div class="d-flex align-center justify-space-between flex-wrap ga-2">
            <span class="text-body-2">{{ alert.text }}</span>
            <div class="d-flex align-center ga-1">
              <v-btn
                v-if="alert.actionLabel && alert.action"
                @click="alert.action"
                color="primary"
                size="small"
                variant="text"
                rounded
              >
                {{ alert.actionLabel }}
              </v-btn>
              <v-btn
                @click="snoozeAlert(alert.id)"
                color="primary"
                size="small"
                variant="text"
                rounded
                :title="t('home.widgets.health_snooze_week')"
              >
                {{ t('home.widgets.health_snooze') }}
              </v-btn>
            </div>
          </div>
        </v-alert>
      </div>

      <div class="d-flex flex-wrap ga-2">
        <v-btn
          v-for="tip in tipAlerts"
          :key="tip.id"
          size="small"
          variant="tonal"
          rounded
          prepend-icon="mdi-folder-search-outline"
          @click="tip.action?.()"
        >
          {{ tip.actionLabel }}
        </v-btn>
        <v-btn
          v-if="activeTasksCount > 0"
          size="small"
          variant="tonal"
          rounded
          prepend-icon="mdi-cogs"
          @click="openTasks"
        >
          {{ t('home.widgets.health_open_tasks') }} ({{ activeTasksCount }})
        </v-btn>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onMounted, onBeforeUnmount, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useTasksStore} from '@/stores/tasks'
import {useSettingsStore} from '@/stores/settings'
import {useAppShell} from '@/composable/appShell'
import {isHealthQueueItemSnoozed, snoozeHealthQueueItem} from '@/services/healthQueueSnooze'
import {isStartupHealthNotificationsEnabled} from '@/composable/useStartupHealthNotifications'
import {
  hasOnlyVisualStages,
  useLibraryHealthFixQueue,
} from '@/composable/useLibraryHealthFixQueue'
import {getReadableFileSize} from '@/services/formatUtils'
import type { HealthAlertItem, HomeHealthData } from '@/types/widgets'
import { emptyHomeHealthUi, toHomeHealthUi } from '@/types/widgets'
import type { HomeHealthQueueItemUi } from '@shared/entities/widgets-ui'
import type { Locale } from '@/utils/translate'

const {t, locale} = useI18n()
const router = useRouter()
const tasksStore = useTasksStore()
const settingsStore = useSettingsStore()
const appShell = useAppShell()
const healthFix = useLibraryHealthFixQueue()

const autoCheckEnabled = computed(() =>
  isStartupHealthNotificationsEnabled(settingsStore.startupHealthNotifications),
)

const checked = ref(false)
const loading = ref(false)
const health = ref<HomeHealthData>(emptyHomeHealthUi())
const snoozeTick = ref(0)

const activeTasksCount = computed(() => tasksStore.list.length)

const databaseSizeLabel = computed(() => {
  const bytes = health.value.database?.bytes
  const size = getReadableFileSize(bytes == null ? 0 : Number(bytes))
  const name = health.value.database?.name

  if (name) {
    return t('home.widgets.health_database_size_named', {name, size})
  }

  return t('home.widgets.health_database_size', {size})
})

const scoreLabel = computed(() => {
  const score = health.value.score
  if (score >= 90) return t('home.widgets.health_score_excellent')
  if (score >= 70) return t('home.widgets.health_score_good')
  if (score >= 40) return t('home.widgets.health_score_needs_work')
  return t('home.widgets.health_score_poor')
})

const scoreToneClass = computed(() => {
  const score = health.value.score
  if (score >= 90) return 'text-success'
  if (score >= 70) return 'text-primary'
  if (score >= 40) return 'text-warning'
  return 'text-error'
})

const QUEUE_ICONS: Record<HomeHealthQueueItemUi['id'], string> = {
  visuals: 'mdi-image-off-outline',
  fingerprint: 'mdi-fingerprint-off',
  codec: 'mdi-movie-filter-outline',
  clip: 'mdi-brain',
  faces: 'mdi-face-recognition',
  duplicates: 'mdi-content-copy',
  missing: 'mdi-folder-search-outline',
  tagUpscale: 'mdi-image-auto-adjust',
}

function queueText(item: HomeHealthQueueItemUi): string {
  switch (item.id) {
    case 'visuals':
      return t('home.widgets.health_generated_images_pending', {count: item.count})
    case 'fingerprint':
      return t('home.widgets.health_fingerprint_pending', {count: item.count})
    case 'codec':
      return t('home.widgets.health_video_codec_pending', {count: item.count})
    case 'clip':
      return t('home.widgets.health_clip_pending', {count: item.count})
    case 'faces':
      return t('home.widgets.health_faces_pending', {count: item.count})
    case 'duplicates':
      return t('home.widgets.health_duplicates_pending', {count: item.count})
    case 'tagUpscale':
      return t('home.widgets.health_tag_image_ai_upscale', {
        size: health.value.tagImageAiUpscale.downloadSizeMb || 50,
        count: item.count,
      })
    case 'missing':
      return t('home.widgets.health_missing_check')
    default:
      return item.id
  }
}

function openSettingsSection(section?: string) {
  router.push({
    path: '/settings',
    query: section
      ? {tab: 'database', section}
      : {tab: 'database'},
  })
}

function actionForQueueItem(item: HomeHealthQueueItemUi): () => void {
  if (item.id === 'clip' && item.autoFixable) {
    return () => { void fixClipIndex() }
  }
  return () => openSettingsSection(item.settingsSection)
}

function actionLabelForQueueItem(item: HomeHealthQueueItemUi): string {
  if (item.id === 'missing') return t('home.widgets.health_open_missing')
  if (item.id === 'duplicates') return t('home.widgets.health_show_duplicates')
  if (item.id === 'faces') return t('home.widgets.health_open_faces')
  if (item.id === 'clip') {
    return item.autoFixable
      ? t('home.widgets.health_run_clip')
      : t('home.widgets.health_open_clip_setup')
  }
  if (item.id === 'visuals') return t('home.widgets.health_open_image_generation')
  if (item.id === 'codec') return t('home.widgets.health_open_video_codec_backfill')
  if (item.id === 'fingerprint') return t('home.widgets.health_open_settings')
  if (item.id === 'tagUpscale') return t('home.widgets.health_open_tag_image_ai_upscale')
  return t('home.widgets.health_open_settings')
}

const queueAlerts = computed((): HealthAlertItem[] => {
  void snoozeTick.value
  return (health.value.queue || [])
    .filter((item) => !isHealthQueueItemSnoozed(item.id))
    .map((item) => ({
      id: item.id,
      type: item.severity,
      icon: QUEUE_ICONS[item.id] || 'mdi-alert-circle-outline',
      text: queueText(item),
      actionLabel: actionLabelForQueueItem(item),
      action: actionForQueueItem(item),
    }))
})

function snoozeAlert(id: string) {
  snoozeHealthQueueItem(id)
  snoozeTick.value += 1
}

const issueAlerts = computed(() =>
  queueAlerts.value.filter((alert) => alert.id !== 'missing'),
)

const tipAlerts = computed(() =>
  queueAlerts.value.filter((alert) => alert.id === 'missing'),
)

const fixStages = computed(() => healthFix.stagesFromHealth(health.value))

const canFixSafe = computed(() =>
  fixStages.value.length > 0 || healthFix.state.value.running,
)

const primaryFixLabel = computed(() => {
  if (hasOnlyVisualStages(fixStages.value)) {
    return t('home.widgets.health_make_library_look_good')
  }
  return t('home.widgets.health_fix_safe_issues')
})

const fixProgressLabel = computed(() => {
  const stage = healthFix.state.value.stage
  if (!stage) return ''
  return t('home.widgets.health_fix_safe_progress', {
    stage: t(`home.widgets.health_fix_stage_${stage}`),
    processed: healthFix.state.value.processed,
    total: healthFix.state.value.total,
  })
})

async function fixSafeIssues() {
  const ok = await healthFix.run(
    health.value,
    String(settingsStore.locale || locale.value || 'en') as Locale,
  )
  if (ok) await runCheck()
}

async function fixClipIndex() {
  if (healthFix.state.value.running) return
  let mediaIds: number[] = []
  try {
    const sampleRes = await typedApi.getVisualSearchQuickSample()
    mediaIds = Array.isArray(sampleRes.data?.ids)
      ? sampleRes.data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
  } catch (error) {
    console.error(error)
  }

  const ok = await healthFix.runStages(
    ['grid', 'clip'],
    String(settingsStore.locale || locale.value || 'en') as Locale,
    {
      health: health.value,
      mediaIds: mediaIds.length ? mediaIds : undefined,
      titleKey: mediaIds.length
        ? 'globalSearch.setup_visual_search_quick'
        : 'globalSearch.setup_visual_search_full',
      doneKey: mediaIds.length
        ? 'globalSearch.setup_visual_search_quick_done'
        : 'globalSearch.setup_visual_search_full_done',
      titleParams: mediaIds.length ? {count: mediaIds.length} : undefined,
      doneParams: mediaIds.length ? {count: mediaIds.length} : undefined,
      doneActions: mediaIds.length
        ? [{
          id: 'visual-search-full',
          text: t('globalSearch.setup_visual_search_full'),
          icon: 'database-sync-outline',
          action: () => { void fixClipIndexFull() },
          hide: true,
        }]
        : undefined,
    },
  )
  if (ok) await runCheck()
}

async function fixClipIndexFull() {
  if (healthFix.state.value.running) return
  const ok = await healthFix.runStages(
    ['grid', 'clip'],
    String(settingsStore.locale || locale.value || 'en') as Locale,
    {
      health: health.value,
      titleKey: 'globalSearch.setup_visual_search_full',
      doneKey: 'globalSearch.setup_visual_search_full_done',
    },
  )
  if (ok) await runCheck()
}

function openDatabaseSettings() {
  openSettingsSection()
}

function openTasks() {
  appShell.openTasksMenu()
}

async function loadHealth() {
  const response = await typedApi.getHomeHealth()
  health.value = toHomeHealthUi(response.data)
}

async function runCheck() {
  if (loading.value) return

  loading.value = true
  checked.value = false
  health.value = emptyHomeHealthUi()

  try {
    await loadHealth()
    checked.value = true
  } catch (error) {
    console.error(error)
    checked.value = true
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  if (autoCheckEnabled.value) {
    void runCheck()
  }
})

onBeforeUnmount(() => {
  healthFix.stop()
})
</script>

<style lang="scss" scoped>
.widget-health-alerts {
  &__item {
    margin-bottom: 0;
  }

  &__score-value {
    line-height: 1;
    min-width: 3.5rem;
  }
}
</style>
