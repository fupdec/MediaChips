<template>
  <section class="widget-health mb-6">
    <div class="widget-health__hero">
      <div class="widget-health__glow" aria-hidden="true"/>

      <div class="widget-health__top">
        <div class="widget-health__title">
          <v-icon size="20" class="mr-2">mdi-heart-pulse</v-icon>
          <span>{{ t('home.widgets.health_title') }}</span>
        </div>

        <v-btn
          v-if="checked || loading"
          v-tooltip:top="t('home.widgets.health_run_check')"
          icon
          size="small"
          variant="tonal"
          color="primary"
          :loading="loading"
          :aria-label="t('home.widgets.health_run_check')"
          @click="runCheck"
        >
          <v-icon>mdi-refresh</v-icon>
        </v-btn>
      </div>

      <v-btn
        v-if="!checked && !loading"
        @click="runCheck"
        color="primary"
        rounded
        variant="flat"
        prepend-icon="mdi-play-circle-outline"
        class="mb-1"
      >
        {{ t('home.widgets.health_run_check') }}
      </v-btn>

      <div v-if="loading && !checked" class="mt-1">
        <v-progress-linear indeterminate color="primary" rounded height="4" class="mb-2"/>
        <div class="text-caption text-medium-emphasis">
          {{ t('home.widgets.health_checking') }}
        </div>
      </div>

      <template v-else-if="checked">
        <div class="widget-health__score-row">
          <div class="widget-health__ring-wrap">
            <v-progress-circular
              :model-value="health.score"
              :size="96"
              :width="7"
              :color="scoreColor"
              bg-color="rgba(var(--v-theme-on-surface), 0.08)"
            >
              <div class="widget-health__ring-inner">
                <div class="widget-health__score" :class="scoreToneClass">{{ health.score }}</div>
                <div class="widget-health__score-unit">%</div>
              </div>
            </v-progress-circular>
          </div>

          <div class="widget-health__score-meta">
            <div class="widget-health__score-label" :class="scoreToneClass">{{ scoreLabel }}</div>
            <div class="text-caption text-medium-emphasis mb-2">{{ databaseSizeLabel }}</div>

            <div v-if="issueAlerts.length" class="widget-health__completion mb-2">
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-caption font-weight-medium">
                  {{ t('home.widgets.health_issues_left', {count: issueAlerts.length}) }}
                </span>
              </div>
              <v-progress-linear
                :model-value="health.score"
                :color="scoreColor"
                height="5"
                rounded
              />
            </div>

            <div v-if="nextIssue" class="widget-health__next">
              <span class="text-caption text-medium-emphasis">
                {{ t('settings_labels.database.health_guide_next') }}:
              </span>
              <button
                type="button"
                class="widget-health__next-link"
                @click="nextIssue.action?.()"
              >
                <v-icon size="14">{{ nextIssue.icon }}</v-icon>
                {{ nextIssue.text }}
              </button>
            </div>
          </div>
        </div>

        <div class="widget-health__actions">
          <div class="d-flex flex-wrap ga-2 align-center">
            <template v-if="canFixSafe">
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
              <span
                v-if="actionsEtaLabel"
                class="text-caption text-medium-emphasis"
              >
                {{ actionsEtaLabel }}
              </span>
            </template>

            <v-btn
              color="primary"
              size="small"
              variant="tonal"
              rounded
              prepend-icon="mdi-cog-outline"
              @click="openDatabaseSettings"
            >
              {{ t('home.widgets.health_open_settings') }}
            </v-btn>
          </div>

          <div
            v-if="healthFix.state.value.running"
            class="widget-health__fix-progress"
          >
            <div class="text-caption text-medium-emphasis mb-1">{{ fixProgressLabel }}</div>
            <v-progress-linear
              :model-value="healthFix.state.value.progress"
              color="primary"
              height="4"
              rounded
            />
          </div>
        </div>

        <div
          v-if="!issueAlerts.length"
          class="widget-health__success"
        >
          <div class="widget-health__success-icon">
            <v-icon size="20">mdi-check-circle-outline</v-icon>
          </div>
          <div class="text-body-2 font-weight-medium">
            {{ t('home.widgets.health_no_issues') }}
          </div>
        </div>

        <div v-else class="widget-health__issues">
          <button
            v-for="alert in issueAlerts"
            :key="alert.id"
            type="button"
            class="widget-health__issue"
            :class="`widget-health__issue--${alert.type}`"
            @click="alert.action?.()"
          >
            <div class="widget-health__issue-icon">
              <v-icon size="18">{{ alert.icon }}</v-icon>
            </div>

            <div class="widget-health__issue-body">
              <div class="widget-health__issue-text">{{ alert.text }}</div>
              <div class="widget-health__issue-actions">
                <span
                  v-if="alert.actionLabel"
                  class="widget-health__issue-cta"
                >
                  {{ alert.actionLabel }}
                </span>
                <span
                  class="widget-health__issue-snooze"
                  role="button"
                  tabindex="0"
                  :title="t('home.widgets.health_snooze_week')"
                  @click.stop="snoozeAlert(alert.id)"
                  @keydown.enter.stop="snoozeAlert(alert.id)"
                >
                  {{ t('home.widgets.health_snooze') }}
                </span>
              </div>
            </div>

            <v-icon size="18" class="widget-health__issue-chevron">mdi-chevron-right</v-icon>
          </button>
        </div>

        <div
          v-if="tipAlerts.length || activeTasksCount > 0"
          class="widget-health__tips"
        >
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
    </div>
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
import {useLibraryHealthFixQueue} from '@/composable/useLibraryHealthFixQueue'
import {
  buildLibrarySetupPhases,
  openLibrarySetupWizardQuery,
  phaseIdFromStage,
  primaryPrepareLibraryLabelKey,
  totalLibrarySetupEtaSeconds,
  type LibrarySetupPhaseId,
} from '@/composable/useLibrarySetupWizard'
import {formatLibrarySetupEta} from '@/composable/librarySetupEta'
import {getReadableFileSize} from '@/services/formatUtils'
import type {HealthAlertItem, HomeHealthData} from '@/types/widgets'
import {emptyHomeHealthUi, toHomeHealthUi} from '@/types/widgets'
import type {HomeHealthQueueItemUi} from '@shared/entities/widgets-ui'
import type {Locale} from '@/utils/translate'

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

const scoreColor = computed(() => {
  const score = health.value.score
  if (score >= 90) return 'success'
  if (score >= 70) return 'primary'
  if (score >= 40) return 'warning'
  return 'error'
})

const QUEUE_ICONS: Record<HomeHealthQueueItemUi['id'], string> = {
  visuals: 'mdi-image-multiple-outline',
  fingerprint: 'mdi-fingerprint',
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

function openSettingsSection(section?: string, wizardStep?: LibrarySetupPhaseId) {
  if (section === 'library_health_guide' || wizardStep) {
    router.push({
      path: '/settings',
      query: openLibrarySetupWizardQuery(wizardStep),
    })
    return
  }

  router.push({
    path: '/settings',
    query: section
      ? {tab: 'database', section}
      : {tab: 'database'},
  })
}

function wizardStepForQueueItem(id: HomeHealthQueueItemUi['id']): LibrarySetupPhaseId | undefined {
  if (id === 'visuals') return 'visuals'
  if (id === 'fingerprint' || id === 'codec') return 'reliability'
  if (id === 'clip') return 'search'
  return undefined
}

function actionForQueueItem(item: HomeHealthQueueItemUi): () => void {
  if (item.id === 'clip' && item.autoFixable) {
    return () => { void fixClipIndex() }
  }
  // Optional / expert tools live under Experts — deep-link to the section.
  if (
    item.id === 'faces'
    || item.id === 'duplicates'
    || item.id === 'tagUpscale'
    || item.id === 'missing'
  ) {
    return () => openSettingsSection(item.settingsSection)
  }
  const wizardStep = wizardStepForQueueItem(item.id)
  if (wizardStep) {
    return () => openSettingsSection('library_health_guide', wizardStep)
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

const nextIssue = computed(() => issueAlerts.value[0] || null)

const phases = computed(() => buildLibrarySetupPhases(health.value))
const fixStages = computed(() => healthFix.stagesFromHealth(health.value))
const totalEtaSeconds = computed(() => totalLibrarySetupEtaSeconds(phases.value))

const canFixSafe = computed(() =>
  fixStages.value.length > 0 || healthFix.state.value.running,
)

const primaryFixLabel = computed(() =>
  t(primaryPrepareLibraryLabelKey(fixStages.value, phases.value)),
)

const actionsEtaLabel = computed(() => {
  if (healthFix.state.value.running) {
    const live = healthFix.state.value.etaSeconds
    if (!live) return ''
    return t('settings_labels.database.health_guide_eta_left', {
      eta: formatLibrarySetupEta(live),
    })
  }
  if (!totalEtaSeconds.value) return ''
  return t('settings_labels.database.health_guide_eta', {
    eta: formatLibrarySetupEta(totalEtaSeconds.value),
  })
})

const fixProgressLabel = computed(() => {
  const stage = healthFix.state.value.stage
  if (!stage) return ''
  const phaseId = phaseIdFromStage(stage)
  const phaseLabel = phaseId
    ? t(`settings_labels.database.health_guide_phase_${phaseId}`)
    : t(`home.widgets.health_fix_stage_${stage}`)
  const base = t('home.widgets.health_prepare_library_progress', {
    phase: phaseLabel,
    stage: t(`home.widgets.health_fix_stage_${stage}`),
    processed: healthFix.state.value.processed,
    total: healthFix.state.value.total,
  })
  const live = healthFix.state.value.etaSeconds
  if (!live) return base
  return `${base} · ${t('settings_labels.database.health_guide_eta_left', {
    eta: formatLibrarySetupEta(live),
  })}`
})

async function fixSafeIssues() {
  const ok = await healthFix.run(
    health.value,
    String(settingsStore.locale || locale.value || 'en') as Locale,
    {
      titleKey: primaryPrepareLibraryLabelKey(fixStages.value, phases.value),
      doneKey: 'home.widgets.health_prepare_library_done',
    },
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
  openSettingsSection('library_health_guide', nextIssue.value
    ? wizardStepForQueueItem(nextIssue.value.id as HomeHealthQueueItemUi['id'])
    : undefined)
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
.widget-health__hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  background:
    radial-gradient(ellipse at top right, rgba(var(--v-theme-primary), 0.16), transparent 55%),
    radial-gradient(ellipse at bottom left, rgba(var(--v-theme-success), 0.08), transparent 50%),
    rgba(var(--v-theme-on-surface), 0.025);
}

.widget-health__glow {
  pointer-events: none;
  position: absolute;
  inset: -40% auto auto -20%;
  width: 220px;
  height: 220px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.18), transparent 70%);
  filter: blur(8px);
}

.widget-health__top {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.widget-health__title {
  display: inline-flex;
  align-items: center;
  font-size: 1.05rem;
  font-weight: 700;
}

.widget-health__score-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.widget-health__ring-inner {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
}

.widget-health__score {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
}

.widget-health__score-unit {
  font-size: 0.8rem;
  font-weight: 600;
  opacity: 0.65;
}

.widget-health__score-meta {
  flex: 1 1 180px;
  min-width: 0;
}

.widget-health__score-label {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 2px;
}

.widget-health__next {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.widget-health__next-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-align: left;
}

.widget-health__next-link:hover {
  text-decoration: underline;
}

.widget-health__actions {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 12px;
}

.widget-health__fix-progress {
  width: 100%;
  max-width: 420px;
}

.widget-health__success {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-success), 0.22);
  background: rgba(var(--v-theme-success), 0.08);
}

.widget-health__success-icon {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.14);
}

.widget-health__issues {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.widget-health__issue {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 12px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
  text-align: left;
  color: inherit;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.widget-health__issue:hover {
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.28);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.widget-health__issue--warning {
  border-color: rgba(var(--v-theme-warning), 0.22);
}

.widget-health__issue--error {
  border-color: rgba(var(--v-theme-error), 0.22);
}

.widget-health__issue-icon {
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.widget-health__issue--warning .widget-health__issue-icon {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.14);
}

.widget-health__issue--error .widget-health__issue-icon {
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.14);
}

.widget-health__issue-body {
  flex: 1 1 auto;
  min-width: 0;
}

.widget-health__issue-text {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
}

.widget-health__issue-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

.widget-health__issue-cta {
  color: rgb(var(--v-theme-primary));
  font-size: 0.75rem;
  font-weight: 650;
}

.widget-health__issue-snooze {
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.75rem;
  font-weight: 550;
  cursor: pointer;
}

.widget-health__issue-snooze:hover {
  color: rgb(var(--v-theme-primary));
}

.widget-health__issue-chevron {
  color: rgba(var(--v-theme-on-surface), 0.45);
  flex: 0 0 auto;
}

.widget-health__tips {
  position: relative;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
</style>
