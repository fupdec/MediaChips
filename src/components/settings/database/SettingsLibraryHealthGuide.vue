<template>
  <div id="settings-library-health-guide" class="health-guide">
    <div class="health-guide__hero">
      <div class="health-guide__hero-glow" aria-hidden="true"/>

      <div class="health-guide__hero-top">
        <div>
          <div class="health-guide__eyebrow">
            <v-icon size="16" class="mr-1">mdi-heart-pulse</v-icon>
            {{ t('settings_labels.database.health_guide_title') }}
          </div>
          <p class="health-guide__lede">
            {{ t('settings_labels.database.health_guide_hint') }}
          </p>
        </div>

        <v-btn
          icon
          size="small"
          variant="tonal"
          color="primary"
          class="health-guide__refresh"
          :loading="loading"
          :title="t('home.widgets.health_run_check')"
          @click="runCheck"
        >
          <v-icon>mdi-refresh</v-icon>
        </v-btn>
      </div>

      <div v-if="loading && !checked" class="health-guide__loading">
        <v-progress-linear indeterminate color="primary" rounded height="4" class="mb-2"/>
        <div class="text-caption text-medium-emphasis">
          {{ t('home.widgets.health_checking') }}
        </div>
      </div>

      <template v-else-if="checked">
        <div class="health-guide__score-row">
          <div class="health-guide__ring-wrap">
            <v-progress-circular
              :model-value="health.score"
              :size="112"
              :width="8"
              :color="scoreColor"
              bg-color="rgba(var(--v-theme-on-surface), 0.08)"
              class="health-guide__ring"
            >
              <div class="health-guide__ring-inner">
                <div class="health-guide__score" :class="scoreToneClass">{{ health.score }}</div>
                <div class="health-guide__score-unit">%</div>
              </div>
            </v-progress-circular>
          </div>

          <div class="health-guide__score-meta">
            <div class="health-guide__score-label" :class="scoreToneClass">{{ scoreLabel }}</div>
            <div class="text-caption text-medium-emphasis mb-3">{{ databaseSizeLabel }}</div>

            <div class="health-guide__completion">
              <div class="d-flex justify-space-between align-center mb-1">
                <span class="text-caption font-weight-medium">
                  {{ t('settings_labels.database.health_guide_steps_progress', {
                    done: completedScoredSteps,
                    total: scoredStepsTotal,
                  }) }}
                </span>
                <span class="text-caption text-medium-emphasis">
                  {{ completionPercent }}%
                </span>
              </div>
              <v-progress-linear
                :model-value="completionPercent"
                :color="scoreColor"
                height="6"
                rounded
              />
            </div>

            <div v-if="nextStep" class="health-guide__next mt-3">
              <span class="text-caption text-medium-emphasis">
                {{ t('settings_labels.database.health_guide_next') }}:
              </span>
              <button type="button" class="health-guide__next-link" @click="openSection(nextStep.settingsSection)">
                <v-icon size="14" start>{{ nextStep.icon }}</v-icon>
                {{ nextStep.title }}
              </button>
            </div>
          </div>
        </div>

        <div v-if="canFixSafe" class="health-guide__actions">
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

          <div v-if="healthFix.state.value.running" class="health-guide__fix-progress">
            <div class="text-caption text-medium-emphasis mb-1">{{ fixProgressLabel }}</div>
            <v-progress-linear
              :model-value="healthFix.state.value.progress"
              color="primary"
              height="4"
              rounded
            />
          </div>
        </div>

        <div class="health-guide__timeline" role="list">
          <button
            v-for="(step, index) in steps"
            :key="step.id"
            type="button"
            class="health-guide__step"
            :class="{
              'health-guide__step--done': step.done && !step.tip,
              'health-guide__step--pending': !step.done && !step.tip,
              'health-guide__step--tip': step.tip,
              'health-guide__step--next': nextStep?.id === step.id,
            }"
            role="listitem"
            @click="openSection(step.settingsSection)"
          >
            <div class="health-guide__step-track" aria-hidden="true">
              <div
                class="health-guide__step-node"
                :class="{
                  'bg-success': step.done && !step.tip,
                  'bg-primary': !step.done && !step.tip,
                }"
              >
                <v-icon v-if="step.done && !step.tip" size="14">mdi-check</v-icon>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div
                v-if="index < steps.length - 1"
                class="health-guide__step-line"
                :class="{ 'health-guide__step-line--done': step.done && !step.tip }"
              />
            </div>

            <div class="health-guide__step-card">
              <div class="health-guide__step-icon">
                <v-icon size="20">{{ step.icon }}</v-icon>
              </div>

              <div class="health-guide__step-body">
                <div class="health-guide__step-title-row">
                  <span class="health-guide__step-title">{{ step.title }}</span>
                  <v-chip
                    v-if="step.tip"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                  >
                    {{ t('settings_labels.database.health_guide_optional') }}
                  </v-chip>
                  <v-chip
                    v-else-if="step.done"
                    size="x-small"
                    variant="tonal"
                    color="success"
                  >
                    {{ t('settings_labels.database.health_guide_done') }}
                  </v-chip>
                  <v-chip
                    v-else-if="step.count > 0"
                    size="x-small"
                    variant="tonal"
                    color="warning"
                  >
                    {{ t('settings_labels.database.health_guide_pending', {count: step.count}) }}
                  </v-chip>
                </div>

                <div class="health-guide__step-meta">
                  <template v-if="step.clipModelNeeded">
                    {{ t('settings_labels.database.health_guide_clip_model_needed') }}
                  </template>
                  <template v-else-if="step.tip">
                    {{ t('settings_labels.database.health_guide_weight_tip') }}
                  </template>
                  <template v-else-if="step.weight > 0">
                    {{ t('settings_labels.database.health_guide_impact') }}
                    · {{ t('settings_labels.database.health_guide_weight', {weight: step.weight}) }}
                  </template>
                </div>

                <div v-if="step.weight > 0" class="health-guide__weight-bar">
                  <div
                    class="health-guide__weight-fill"
                    :class="step.done ? 'health-guide__weight-fill--done' : ''"
                    :style="{ width: `${(step.weight / maxWeight) * 100}%` }"
                  />
                </div>
              </div>

              <v-icon size="18" class="health-guide__step-chevron">mdi-chevron-right</v-icon>
            </div>
          </button>
        </div>
      </template>

      <div v-else class="d-flex">
        <v-btn
          color="primary"
          rounded
          variant="flat"
          prepend-icon="mdi-play-circle-outline"
          @click="runCheck"
        >
          {{ t('home.widgets.health_run_check') }}
        </v-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {getReadableFileSize} from '@/services/formatUtils'
import {
  hasOnlyVisualStages,
  useLibraryHealthFixQueue,
} from '@/composable/useLibraryHealthFixQueue'
import type {HomeHealthData} from '@/types/widgets'
import {emptyHomeHealthUi, toHomeHealthUi} from '@/types/widgets'
import type {HomeHealthQueueItemId} from '@shared/entities/widgets-ui'
import type {Locale} from '@/utils/translate'

type HealthGuideStep = {
  id: HomeHealthQueueItemId
  title: string
  icon: string
  settingsSection: string
  done: boolean
  count: number
  weight: number
  tip?: boolean
  clipModelNeeded?: boolean
}

const {t, locale} = useI18n()
const router = useRouter()
const settingsStore = useSettingsStore()
const healthFix = useLibraryHealthFixQueue()

const checked = ref(false)
const loading = ref(false)
const health = ref<HomeHealthData>(emptyHomeHealthUi())
const maxWeight = 25

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

function visualsPending(data: HomeHealthData): number {
  const types = ['preview', 'grid', 'marks'] as const
  let pending = 0
  for (const key of types) {
    pending += Number(data.generatedImages?.byType?.[key]?.pending || 0)
  }
  pending += Number(data.imageThumbs?.pending || 0)
  return pending
}

function duplicateCount(data: HomeHealthData): number {
  return Math.max(
    Number(data.duplicates?.byFilesize || 0),
    Number(data.duplicates?.byFingerprint || 0),
    Number(data.duplicates?.byVisualHash || 0),
  )
}

function isClipModelReady(modelStatus?: string): boolean {
  return modelStatus === 'downloaded'
    || modelStatus === 'loaded'
    || modelStatus === 'loading'
}

const steps = computed((): HealthGuideStep[] => {
  const data = health.value
  const visualsCount = visualsPending(data)
  const fingerprintCount = Number(data.fingerprint?.pending || 0)
  const codecCount = Number(data.videoCodec?.pending || 0)
  const clipCount = Number(data.clip?.pending || 0)
  const facesCount = Number(data.faces?.pending || 0)
  const dupCount = duplicateCount(data)
  const tagUpscale = data.tagImageAiUpscale
  const tagUpscalePending = !tagUpscale.done
    && (tagUpscale.suggested || Number(tagUpscale.pendingCount) > 0)
  const clipReady = isClipModelReady(data.clip?.modelStatus)

  return [
    {
      id: 'visuals',
      title: t('settings_labels.database.health_guide_step_visuals'),
      icon: 'mdi-image-multiple-outline',
      settingsSection: 'generate_video_images',
      done: visualsCount <= 0,
      count: visualsCount,
      weight: 25,
    },
    {
      id: 'fingerprint',
      title: t('settings_labels.database.health_guide_step_fingerprint'),
      icon: 'mdi-fingerprint',
      settingsSection: 'oshash_backfill',
      done: fingerprintCount <= 0,
      count: fingerprintCount,
      weight: 15,
    },
    {
      id: 'codec',
      title: t('settings_labels.database.health_guide_step_codec'),
      icon: 'mdi-movie-filter-outline',
      settingsSection: 'video_codec_backfill',
      done: codecCount <= 0,
      count: codecCount,
      weight: 10,
    },
    {
      id: 'clip',
      title: t('settings_labels.database.health_guide_step_clip'),
      icon: 'mdi-brain',
      settingsSection: 'clip_embedding_backfill',
      done: clipCount <= 0,
      count: clipCount,
      weight: 20,
      clipModelNeeded: clipCount > 0 && !clipReady,
    },
    {
      id: 'faces',
      title: t('settings_labels.database.health_guide_step_faces'),
      icon: 'mdi-face-recognition',
      settingsSection: 'detect_faces',
      done: facesCount <= 0,
      count: facesCount,
      weight: 10,
    },
    {
      id: 'duplicates',
      title: t('settings_labels.database.health_guide_step_duplicates'),
      icon: 'mdi-content-copy',
      settingsSection: 'find_duplicates',
      done: dupCount <= 0,
      count: dupCount,
      weight: 15,
    },
    {
      id: 'tagUpscale',
      title: t('settings_labels.database.health_guide_step_tag_upscale'),
      icon: 'mdi-image-auto-adjust',
      settingsSection: 'tag_image_ai_upscale',
      done: !tagUpscalePending,
      count: Number(tagUpscale.pendingCount) || 0,
      weight: 5,
    },
    {
      id: 'missing',
      title: t('settings_labels.database.health_guide_step_missing'),
      icon: 'mdi-folder-search-outline',
      settingsSection: 'find_missing',
      done: false,
      count: 0,
      weight: 0,
      tip: true,
    },
  ]
})

const scoredSteps = computed(() => steps.value.filter((step) => !step.tip))
const scoredStepsTotal = computed(() => scoredSteps.value.length)
const completedScoredSteps = computed(() => scoredSteps.value.filter((step) => step.done).length)
const completionPercent = computed(() => {
  if (!scoredStepsTotal.value) return 100
  return Math.round((completedScoredSteps.value / scoredStepsTotal.value) * 100)
})

const nextStep = computed(() =>
  steps.value.find((step) => !step.tip && !step.done) || null,
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

function openSection(section: string) {
  router.push({
    path: '/settings',
    query: {tab: 'database', section},
  })
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

async function fixSafeIssues() {
  const ok = await healthFix.run(
    health.value,
    String(settingsStore.locale || locale.value || 'en') as Locale,
  )
  if (ok) await runCheck()
}

onMounted(() => {
  void runCheck()
})

onBeforeUnmount(() => {
  healthFix.stop()
})
</script>

<style lang="scss" scoped>
.health-guide__hero {
  position: relative;
  overflow: hidden;
  border-radius: 22px;
  padding: 18px 18px 16px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  background:
    radial-gradient(ellipse at top right, rgba(var(--v-theme-primary), 0.16), transparent 55%),
    radial-gradient(ellipse at bottom left, rgba(var(--v-theme-success), 0.08), transparent 50%),
    rgba(var(--v-theme-on-surface), 0.025);
}

.health-guide__hero-glow {
  pointer-events: none;
  position: absolute;
  inset: -40% auto auto -20%;
  width: 280px;
  height: 280px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(var(--v-theme-primary), 0.18), transparent 70%);
  filter: blur(8px);
}

.health-guide__hero-top {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.health-guide__eyebrow {
  display: inline-flex;
  align-items: center;
  font-size: 0.95rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  margin-bottom: 6px;
}

.health-guide__lede {
  margin: 0;
  max-width: 46rem;
  color: rgba(var(--v-theme-on-surface), 0.66);
  font-size: 0.8125rem;
  line-height: 1.45;
}

.health-guide__score-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.health-guide__ring-wrap {
  flex: 0 0 auto;
}

.health-guide__ring-inner {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 1px;
}

.health-guide__score {
  font-size: 2rem;
  font-weight: 800;
  line-height: 1;
}

.health-guide__score-unit {
  font-size: 0.85rem;
  font-weight: 600;
  opacity: 0.65;
}

.health-guide__score-meta {
  flex: 1 1 220px;
  min-width: 0;
}

.health-guide__score-label {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 2px;
}

.health-guide__next {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.health-guide__next-link {
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
}

.health-guide__next-link:hover {
  text-decoration: underline;
}

.health-guide__actions {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
}

.health-guide__fix-progress {
  width: 100%;
  max-width: 420px;
}

.health-guide__timeline {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.health-guide__step {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  width: 100%;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.health-guide__step-track {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
}

.health-guide__step-node {
  width: 24px;
  height: 24px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-on-primary));
  font-size: 11px;
  font-weight: 700;
  z-index: 1;
  box-shadow: 0 0 0 4px rgba(var(--v-theme-primary), 0.12);
}

.health-guide__step--done .health-guide__step-node {
  box-shadow: 0 0 0 4px rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-on-success));
}

.health-guide__step--tip .health-guide__step-node {
  background: transparent !important;
  color: rgb(var(--v-theme-primary)) !important;
  border: 1.5px dashed rgba(var(--v-theme-primary), 0.55);
  box-shadow: none;
}

.health-guide__step-line {
  flex: 1 1 auto;
  width: 2px;
  min-height: 18px;
  margin-top: 4px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.health-guide__step-line--done {
  background: rgba(var(--v-theme-success), 0.45);
}

.health-guide__step-card {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  padding: 12px 12px 12px 10px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}

.health-guide__step:hover .health-guide__step-card {
  transform: translateY(-1px);
  border-color: rgba(var(--v-theme-primary), 0.28);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
}

.health-guide__step--next .health-guide__step-card {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), transparent 60%),
    rgba(var(--v-theme-surface), 0.65);
}

.health-guide__step--done .health-guide__step-card {
  opacity: 0.82;
}

.health-guide__step--tip .health-guide__step-card {
  border-style: dashed;
}

.health-guide__step-icon {
  flex: 0 0 40px;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
}

.health-guide__step--done .health-guide__step-icon {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}

.health-guide__step--pending .health-guide__step-icon {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.health-guide__step-body {
  flex: 1 1 auto;
  min-width: 0;
}

.health-guide__step-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.health-guide__step-title {
  font-size: 0.9rem;
  font-weight: 650;
  line-height: 1.3;
}

.health-guide__step-meta {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
  line-height: 1.35;
}

.health-guide__weight-bar {
  margin-top: 8px;
  height: 4px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.health-guide__weight-fill {
  height: 100%;
  border-radius: inherit;
  background: rgb(var(--v-theme-warning));
}

.health-guide__weight-fill--done {
  background: rgb(var(--v-theme-success));
}

.health-guide__step-chevron {
  color: rgba(var(--v-theme-on-surface), 0.45);
  flex: 0 0 auto;
}
</style>
