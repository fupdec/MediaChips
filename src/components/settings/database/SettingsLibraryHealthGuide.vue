<template>
  <div id="settings-library-health-guide" class="health-guide">
    <div class="health-guide__hero">
      <div class="health-guide__hero-glow" aria-hidden="true"/>

      <div class="health-guide__hero-top">
        <div>
          <div class="health-guide__eyebrow">
            <v-icon size="16" class="mr-1">mdi-auto-fix</v-icon>
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
                    done: completedEssentialPhases,
                    total: essentialPhasesTotal,
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

            <div v-if="nextPhase" class="health-guide__next mt-3">
              <span class="text-caption text-medium-emphasis">
                {{ t('settings_labels.database.health_guide_next') }}:
              </span>
              <button
                type="button"
                class="health-guide__next-link"
                @click="focusPhase(nextPhase.id)"
              >
                <v-icon size="14" start>{{ nextPhase.icon }}</v-icon>
                {{ t(nextPhase.titleKey) }}
              </button>
              <span
                v-if="formatEta(nextPhase.etaSeconds)"
                class="text-caption text-medium-emphasis"
              >
                · {{ t('settings_labels.database.health_guide_eta', {eta: formatEta(nextPhase.etaSeconds)}) }}
              </span>
            </div>
          </div>
        </div>

        <div v-if="canFixSafe" class="health-guide__actions">
          <div class="health-guide__actions-row">
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
              class="text-caption text-medium-emphasis health-guide__actions-eta"
            >
              {{ actionsEtaLabel }}
            </span>
          </div>

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

        <div class="health-guide__phases" role="list">
          <div
            v-for="(phase, index) in phases"
            :id="phaseDomId(phase.id)"
            :key="phase.id"
            class="health-guide__phase"
            :class="{
              'health-guide__phase--done': phase.done && phase.id !== 'optional',
              'health-guide__phase--pending': !phase.done,
              'health-guide__phase--optional': phase.id === 'optional',
              'health-guide__phase--active': activePhaseId === phase.id,
              'health-guide__phase--running': runningPhaseId === phase.id,
            }"
            role="listitem"
          >
            <div class="health-guide__phase-track" aria-hidden="true">
              <div
                class="health-guide__phase-node"
                :class="{
                  'bg-success': phase.done && phase.id !== 'optional',
                  'bg-primary': !phase.done || phase.id === 'optional',
                }"
              >
                <v-icon v-if="phase.done && phase.id !== 'optional'" size="14">mdi-check</v-icon>
                <span v-else>{{ index + 1 }}</span>
              </div>
              <div
                v-if="index < phases.length - 1"
                class="health-guide__phase-line"
                :class="{ 'health-guide__phase-line--done': phase.done && phase.id !== 'optional' }"
              />
            </div>

            <div class="health-guide__phase-card">
              <button
                type="button"
                class="health-guide__phase-header"
                @click="togglePhase(phase.id)"
              >
                <div class="health-guide__phase-icon">
                  <v-icon size="20">{{ phase.icon }}</v-icon>
                </div>

                <div class="health-guide__phase-body">
                  <div class="health-guide__phase-title-row">
                    <span class="health-guide__phase-title">{{ t(phase.titleKey) }}</span>
                    <v-chip
                      v-if="phase.id === 'optional'"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                    >
                      {{ t('settings_labels.database.health_guide_optional') }}
                    </v-chip>
                    <v-chip
                      v-else-if="phase.done"
                      size="x-small"
                      variant="tonal"
                      color="success"
                    >
                      {{ t('settings_labels.database.health_guide_done') }}
                    </v-chip>
                    <v-chip
                      v-else-if="phase.pendingCount > 0"
                      size="x-small"
                      variant="tonal"
                      color="warning"
                    >
                      {{ t('settings_labels.database.health_guide_pending', {count: phase.pendingCount}) }}
                    </v-chip>
                    <v-chip
                      v-if="runningPhaseId === phase.id"
                      size="x-small"
                      variant="tonal"
                      color="primary"
                    >
                      {{ t('settings_labels.database.health_guide_running') }}
                    </v-chip>
                    <v-chip
                      v-if="phaseEtaLabel(phase)"
                      size="x-small"
                      variant="tonal"
                      color="secondary"
                    >
                      {{ phaseEtaLabel(phase) }}
                    </v-chip>
                  </div>
                  <div class="health-guide__phase-hint">{{ t(phase.hintKey) }}</div>
                  <div v-if="phase.clipModelNeeded" class="health-guide__phase-meta">
                    {{ t('settings_labels.database.health_guide_clip_model_needed') }}
                  </div>
                </div>

                <v-icon size="18" class="health-guide__phase-chevron">
                  {{ expandedPhaseId === phase.id ? 'mdi-chevron-up' : 'mdi-chevron-down' }}
                </v-icon>
              </button>

              <div v-if="expandedPhaseId === phase.id" class="health-guide__phase-details">
                <div class="health-guide__phase-actions">
                  <v-btn
                    v-if="phase.autoFixable && !healthFix.state.value.running"
                    size="small"
                    color="primary"
                    rounded
                    variant="tonal"
                    prepend-icon="mdi-play"
                    @click="runPhase(phase.id)"
                  >
                    {{ t('settings_labels.database.health_guide_run_phase') }}
                  </v-btn>
                </div>

                <button
                  v-for="task in phase.tasks"
                  :key="task.id"
                  type="button"
                  class="health-guide__task"
                  @click="openSection(task.settingsSection)"
                >
                  <v-icon size="16" class="mr-2">{{ task.icon }}</v-icon>
                  <span class="health-guide__task-title">{{ t(task.titleKey) }}</span>
                  <v-chip
                    v-if="task.tip"
                    size="x-small"
                    variant="tonal"
                    color="primary"
                    class="ml-2"
                  >
                    {{ t('settings_labels.database.health_guide_optional') }}
                  </v-chip>
                  <v-chip
                    v-else-if="task.done"
                    size="x-small"
                    variant="tonal"
                    color="success"
                    class="ml-2"
                  >
                    {{ t('settings_labels.database.health_guide_done') }}
                  </v-chip>
                  <v-chip
                    v-else-if="task.count > 0"
                    size="x-small"
                    variant="tonal"
                    color="warning"
                    class="ml-2"
                  >
                    {{ t('settings_labels.database.health_guide_pending', {count: task.count}) }}
                  </v-chip>
                  <v-chip
                    v-if="!task.done && formatEta(task.etaSeconds)"
                    size="x-small"
                    variant="tonal"
                    color="secondary"
                    class="ml-2"
                  >
                    {{ t('settings_labels.database.health_guide_eta', {eta: formatEta(task.etaSeconds)}) }}
                  </v-chip>
                  <v-icon size="16" class="health-guide__task-chevron">mdi-chevron-right</v-icon>
                </button>
              </div>
            </div>
          </div>
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
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useSettingsStore} from '@/stores/settings'
import {getReadableFileSize} from '@/services/formatUtils'
import {useLibraryHealthFixQueue} from '@/composable/useLibraryHealthFixQueue'
import {
  buildLibrarySetupPhases,
  isLibrarySetupPhaseId,
  nextLibrarySetupPhase,
  phaseIdFromStage,
  primaryPrepareLibraryLabelKey,
  totalLibrarySetupEtaSeconds,
  type LibrarySetupPhaseId,
} from '@/composable/useLibrarySetupWizard'
import {formatLibrarySetupEta} from '@/composable/librarySetupEta'
import type {HomeHealthData} from '@/types/widgets'
import {emptyHomeHealthUi, toHomeHealthUi} from '@/types/widgets'
import type {Locale} from '@/utils/translate'

const {t, locale} = useI18n()
const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
const healthFix = useLibraryHealthFixQueue()

const checked = ref(false)
const loading = ref(false)
const health = ref<HomeHealthData>(emptyHomeHealthUi())
const expandedPhaseId = ref<LibrarySetupPhaseId | null>(null)
const activePhaseId = ref<LibrarySetupPhaseId | null>(null)

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

const phases = computed(() => buildLibrarySetupPhases(health.value))
const essentialPhases = computed(() => phases.value.filter((phase) => phase.id !== 'optional'))
const essentialPhasesTotal = computed(() => essentialPhases.value.length)
const completedEssentialPhases = computed(() =>
  essentialPhases.value.filter((phase) => phase.done).length,
)
const completionPercent = computed(() => {
  if (!essentialPhasesTotal.value) return 100
  return Math.round((completedEssentialPhases.value / essentialPhasesTotal.value) * 100)
})

const nextPhase = computed(() => nextLibrarySetupPhase(phases.value))
const totalEtaSeconds = computed(() => totalLibrarySetupEtaSeconds(phases.value))

const fixStages = computed(() => healthFix.stagesFromHealth(health.value))

const canFixSafe = computed(() =>
  fixStages.value.length > 0 || healthFix.state.value.running,
)

const primaryFixLabel = computed(() =>
  t(primaryPrepareLibraryLabelKey(fixStages.value, phases.value)),
)

const runningPhaseId = computed(() =>
  phaseIdFromStage(healthFix.state.value.stage),
)

function formatEta(seconds: number | null | undefined) {
  return formatLibrarySetupEta(Number(seconds) || 0)
}

function phaseEtaLabel(phase: {id: LibrarySetupPhaseId, etaSeconds: number, done: boolean}) {
  if (phase.done) return ''
  if (healthFix.state.value.running && runningPhaseId.value === phase.id) {
    const live = healthFix.state.value.etaSeconds
    if (live && live > 0) {
      return t('settings_labels.database.health_guide_eta_left', {eta: formatEta(live)})
    }
  }
  if (!phase.etaSeconds) return ''
  return t('settings_labels.database.health_guide_eta', {eta: formatEta(phase.etaSeconds)})
}

const actionsEtaLabel = computed(() => {
  if (healthFix.state.value.running) {
    const live = healthFix.state.value.etaSeconds
    if (!live) return ''
    return t('settings_labels.database.health_guide_eta_left', {eta: formatEta(live)})
  }
  if (!totalEtaSeconds.value) return ''
  return t('settings_labels.database.health_guide_eta', {eta: formatEta(totalEtaSeconds.value)})
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
  return `${base} · ${t('settings_labels.database.health_guide_eta_left', {eta: formatEta(live)})}`
})

function phaseDomId(id: LibrarySetupPhaseId) {
  return `library-setup-phase-${id}`
}

function togglePhase(id: LibrarySetupPhaseId) {
  expandedPhaseId.value = expandedPhaseId.value === id ? null : id
  activePhaseId.value = id
}

function focusPhase(id: LibrarySetupPhaseId) {
  expandedPhaseId.value = id
  activePhaseId.value = id
  nextTick(() => {
    document.getElementById(phaseDomId(id))?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    })
  })
}

function openSection(section: string) {
  void router.push({
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
    if (!expandedPhaseId.value && nextPhase.value) {
      expandedPhaseId.value = nextPhase.value.id
    }
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
    {
      titleKey: primaryPrepareLibraryLabelKey(fixStages.value, phases.value),
      doneKey: 'home.widgets.health_prepare_library_done',
    },
  )
  if (ok) await runCheck()
}

async function runPhase(phaseId: LibrarySetupPhaseId) {
  const phase = phases.value.find((item) => item.id === phaseId)
  if (!phase?.autoFixable) return

  const ok = await healthFix.runStages(
    phase.stages,
    String(settingsStore.locale || locale.value || 'en') as Locale,
    {
      health: health.value,
      titleKey: phase.titleKey,
      doneKey: 'home.widgets.health_prepare_library_done',
    },
  )
  if (ok) await runCheck()
}

function applyWizardStepFromRoute() {
  const step = route.query.wizardStep
  if (!isLibrarySetupPhaseId(step)) return
  focusPhase(step)
}

watch(
  () => route.query.wizardStep,
  () => {
    applyWizardStepFromRoute()
  },
)

onMounted(() => {
  void runCheck().then(() => {
    applyWizardStepFromRoute()
  })
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

.health-guide__actions-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.health-guide__actions-eta {
  white-space: nowrap;
}

.health-guide__fix-progress {
  width: 100%;
  max-width: 420px;
}

.health-guide__phases {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0;
}

.health-guide__phase {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 12px;
  width: 100%;
}

.health-guide__phase-track {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 14px;
}

.health-guide__phase-node {
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

.health-guide__phase--done .health-guide__phase-node {
  box-shadow: 0 0 0 4px rgba(var(--v-theme-success), 0.14);
  color: rgb(var(--v-theme-on-success));
}

.health-guide__phase--optional .health-guide__phase-node {
  background: transparent !important;
  color: rgb(var(--v-theme-primary)) !important;
  border: 1.5px dashed rgba(var(--v-theme-primary), 0.55);
  box-shadow: none;
}

.health-guide__phase-line {
  flex: 1 1 auto;
  width: 2px;
  min-height: 18px;
  margin-top: 4px;
  background: rgba(var(--v-theme-on-surface), 0.12);
}

.health-guide__phase-line--done {
  background: rgba(var(--v-theme-success), 0.45);
}

.health-guide__phase-card {
  margin-bottom: 10px;
  border-radius: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.health-guide__phase--active .health-guide__phase-card,
.health-guide__phase--running .health-guide__phase-card {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), transparent 60%),
    rgba(var(--v-theme-surface), 0.65);
}

.health-guide__phase--done .health-guide__phase-card {
  opacity: 0.88;
}

.health-guide__phase--optional .health-guide__phase-card {
  border-style: dashed;
}

.health-guide__phase-header {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 12px 12px 10px;
  border: 0;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: pointer;
}

.health-guide__phase-header:hover {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.health-guide__phase-icon {
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

.health-guide__phase--done .health-guide__phase-icon {
  color: rgb(var(--v-theme-success));
  background: rgba(var(--v-theme-success), 0.12);
}

.health-guide__phase--pending .health-guide__phase-icon {
  color: rgb(var(--v-theme-warning));
  background: rgba(var(--v-theme-warning), 0.12);
}

.health-guide__phase-body {
  flex: 1 1 auto;
  min-width: 0;
}

.health-guide__phase-title-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.health-guide__phase-title {
  font-size: 0.95rem;
  font-weight: 650;
  line-height: 1.3;
}

.health-guide__phase-hint,
.health-guide__phase-meta {
  margin-top: 4px;
  color: rgba(var(--v-theme-on-surface), 0.58);
  font-size: 0.75rem;
  line-height: 1.35;
}

.health-guide__phase-chevron {
  color: rgba(var(--v-theme-on-surface), 0.45);
  flex: 0 0 auto;
}

.health-guide__phase-details {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 10px 12px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.health-guide__phase-actions {
  padding-top: 10px;
}

.health-guide__task {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px 8px;
  border: 0;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.health-guide__task:hover {
  background: rgba(var(--v-theme-primary), 0.08);
}

.health-guide__task-title {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 0.8125rem;
  font-weight: 550;
}

.health-guide__task-chevron {
  color: rgba(var(--v-theme-on-surface), 0.4);
  margin-left: auto;
}
</style>
