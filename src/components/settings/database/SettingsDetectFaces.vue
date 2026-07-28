<template>
  <div id="settings-detect-faces" class="mx-4 pb-4">
    <settings-category-divider
      :title="t('settings_labels.database.face_workflow_title')"
      icon="face-recognition"
    >
      <template #actions>
        <v-spacer/>
        <button-documentation id="media.face_recognition"/>
      </template>
    </settings-category-divider>

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

    <p class="text-body-2 text-medium-emphasis mb-3">
      {{ t('settings_labels.database.face_workflow_intro') }}
    </p>

    <v-alert
      :type="nextStep.alertType"
      variant="tonal"
      density="comfortable"
      rounded="xl"
      class="mb-5 face-next-step"
    >
      <div class="text-body-2 font-weight-medium mb-1">
        {{ nextStep.title }}
      </div>
      <div class="text-caption mb-3">
        {{ nextStep.text }}
      </div>
      <v-btn
        v-if="nextStep.action"
        :color="nextStep.alertType === 'success' ? 'secondary' : 'primary'"
        rounded
        variant="flat"
        size="small"
        class="pr-3"
        :loading="nextStep.loading"
        :disabled="busy && !nextStep.allowWhileBusy"
        @click="nextStep.action"
      >
        <v-icon :icon="nextStep.icon" start/>
        {{ nextStep.actionLabel }}
      </v-btn>
    </v-alert>

    <div class="face-steps mb-6">
      <div
        v-for="step in steps"
        :key="step.id"
        class="face-step"
        :class="{'face-step--done': step.done, 'face-step--current': step.current}"
      >
        <div class="face-step__badge">
          <v-icon v-if="step.done" icon="mdi-check" size="18"/>
          <span v-else>{{ step.number }}</span>
        </div>
        <div class="face-step__body">
          <div class="face-step__title">{{ step.title }}</div>
          <div class="face-step__text text-caption text-medium-emphasis">{{ step.text }}</div>
          <div v-if="step.status" class="text-caption mt-1">{{ step.status }}</div>

          <div v-if="step.id === 'category'" class="mt-3">
            <v-autocomplete
              v-model="selectedPerformerMeta"
              :items="arrayMetas"
              item-value="id"
              item-title="name"
              :label="t('settings_labels.database.face_match_performer_meta')"
              :placeholder="t('settings_labels.database.face_match_performer_meta_placeholder')"
              return-object
              clearable
              variant="outlined"
              rounded
              density="comfortable"
              hide-details
              :disabled="busy"
              @update:model-value="onPerformerMetaChange"
            >
              <template #selection="{ item }">
                <v-icon start>mdi-{{ item.raw.icon || 'account-group' }}</v-icon>
                <span>{{ item.raw.name }}</span>
              </template>
              <template #item="{ item, props: itemProps }">
                <v-list-item v-bind="itemProps">
                  <template #title>
                    <v-icon start>mdi-{{ item.raw.icon || 'account-group' }}</v-icon>
                    <span>{{ item.raw.name }}</span>
                  </template>
                </v-list-item>
              </template>
            </v-autocomplete>
          </div>

          <div v-if="step.id === 'enroll'" class="mt-3 d-flex flex-wrap ga-2">
            <v-btn
              color="primary"
              rounded
              variant="flat"
              class="pr-4"
              :disabled="busy || !selectedPerformerMeta || !modelReady"
              @click="startEnrollment(false)"
            >
              <v-icon icon="mdi-account-box-multiple" start/>
              {{ t('settings_labels.database.face_match_enroll') }}
            </v-btn>
            <v-btn
              v-if="matchStatusView.enrolledTags > 0"
              color="secondary"
              rounded
              variant="outlined"
              class="pr-4"
              :disabled="busy || !selectedPerformerMeta || !modelReady"
              @click="startEnrollment(true)"
            >
              <v-icon icon="mdi-refresh" start/>
              {{ t('settings_labels.database.face_match_enroll_force') }}
            </v-btn>
            <v-btn
              color="secondary"
              rounded
              variant="tonal"
              class="pr-4"
              :disabled="busy || !selectedPerformerMeta || !modelReady"
              @click="openEnrollmentQuality"
            >
              <v-icon icon="mdi-clipboard-check-outline" start/>
              {{ t('settings_labels.database.face_match_enrollment_quality') }}
            </v-btn>
          </div>

          <div
            v-if="step.id === 'enroll' && (activeJob === 'enroll' || (lastCompletedJob === 'enroll' && lastSummary && !activeJob))"
            class="mt-3"
          >
            <v-progress-linear
              v-if="activeJob === 'enroll'"
              :model-value="progress"
              color="primary"
              height="8"
              rounded
              striped
              class="mb-2"
            />
            <div v-if="activeJob === 'enroll' && currentPath" class="text-caption text-medium-emphasis mb-1 selectable">
              {{ currentPath }}
            </div>
            <div v-if="activeJob === 'enroll'" class="text-caption text-medium-emphasis">
              {{ activeProgressLabel }}
            </div>
            <div v-if="lastCompletedJob === 'enroll' && lastSummary && !activeJob" class="text-body-2">
              {{ lastSummary }}
            </div>
            <div v-if="activeJob === 'enroll'" class="mt-2">
              <v-btn
                @click="stopJob"
                color="error"
                rounded
                variant="flat"
                size="small"
                class="pr-3"
              >
                <v-icon icon="mdi-stop" start/>
                {{ t('common.stop') }}
              </v-btn>
            </div>
          </div>

          <div
            v-if="step.id === 'enroll'"
            class="face-reference-tips mt-4"
          >
            <v-img
              src="/images/face-reference-tips.svg"
              max-height="160"
              class="face-reference-tips__art mb-3"
              contain
            />
            <div class="face-reference-tips__copy">
              <div class="text-body-2 font-weight-medium mb-1">
                {{ t('settings_labels.database.face_match_reference_tips_title') }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t('settings_labels.database.face_match_reference_tips') }}
              </div>
            </div>
          </div>

          <div v-if="step.id === 'detect'" class="mt-3 d-flex flex-wrap ga-2">
            <v-btn
              color="primary"
              rounded
              variant="flat"
              class="pr-4"
              :disabled="busy || !statusLoaded || !modelReady || !canDetect"
              @click="startDetection(false)"
            >
              <v-icon icon="mdi-play" start/>
              {{ t('settings_labels.database.detect_faces_start') }}
            </v-btn>
            <v-btn
              color="secondary"
              rounded
              variant="outlined"
              class="pr-4"
              :disabled="busy || !statusLoaded || !modelReady || status.total === 0"
              @click="startDetection(true)"
            >
              <v-icon icon="mdi-refresh" start/>
              {{ t('settings_labels.database.detect_faces_regenerate') }}
            </v-btn>
          </div>

          <div
            v-if="step.id === 'detect' && (activeJob === 'detect' || (lastCompletedJob === 'detect' && lastSummary && !activeJob))"
            class="mt-3"
          >
            <v-progress-linear
              v-if="activeJob === 'detect'"
              :model-value="progress"
              color="primary"
              height="8"
              rounded
              striped
              class="mb-2"
            />
            <div v-if="activeJob === 'detect' && currentPath" class="text-caption text-medium-emphasis mb-1 selectable">
              {{ currentPath }}
            </div>
            <div v-if="activeJob === 'detect'" class="text-caption text-medium-emphasis">
              {{ activeProgressLabel }}
            </div>
            <div v-if="lastCompletedJob === 'detect' && lastSummary && !activeJob" class="text-body-2">
              {{ lastSummary }}
            </div>
            <div v-if="activeJob === 'detect'" class="mt-2">
              <v-btn
                @click="stopJob"
                color="error"
                rounded
                variant="flat"
                size="small"
                class="pr-3"
              >
                <v-icon icon="mdi-stop" start/>
                {{ t('common.stop') }}
              </v-btn>
            </div>
          </div>

          <div v-if="step.id === 'match'" class="mt-3 d-flex flex-wrap ga-2">
            <v-btn
              color="primary"
              rounded
              variant="flat"
              class="pr-4"
              :disabled="busy || matchStatusView.enrolledTags === 0 || matchStatusView.faces === 0"
              @click="startMatching(false)"
            >
              <v-icon icon="mdi-link-variant" start/>
              {{ t('settings_labels.database.face_match_run') }}
            </v-btn>
          </div>

          <div
            v-if="step.id === 'match' && (activeJob === 'match' || (lastCompletedJob === 'match' && lastSummary && !activeJob))"
            class="mt-3"
          >
            <v-progress-linear
              v-if="activeJob === 'match'"
              :model-value="progress"
              color="primary"
              height="8"
              rounded
              striped
              class="mb-2"
            />
            <div v-if="activeJob === 'match' && currentPath" class="text-caption text-medium-emphasis mb-1 selectable">
              {{ currentPath }}
            </div>
            <div v-if="activeJob === 'match'" class="text-caption text-medium-emphasis">
              {{ activeProgressLabel }}
            </div>
            <div v-if="lastCompletedJob === 'match' && lastSummary && !activeJob" class="text-body-2">
              {{ lastSummary }}
            </div>
            <div v-if="activeJob === 'match'" class="mt-2">
              <v-btn
                @click="stopJob"
                color="error"
                rounded
                variant="flat"
                size="small"
                class="pr-3"
              >
                <v-icon icon="mdi-stop" start/>
                {{ t('common.stop') }}
              </v-btn>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <v-btn
        @click="refreshStatus"
        :loading="statusLoading"
        :disabled="busy && !activeJob"
        color="secondary"
        rounded
        variant="outlined"
        class="pr-4"
      >
        <v-icon icon="mdi-refresh" start/>
        {{ t('settings_labels.database.refresh_status') }}
      </v-btn>
    </div>

    <v-expansion-panels variant="accordion" rounded="xl" class="face-advanced">
      <v-expansion-panel>
        <v-expansion-panel-title>
          {{ t('settings_labels.database.face_workflow_advanced') }}
        </v-expansion-panel-title>
        <v-expansion-panel-text>
          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_detect_strictness') }}: {{ asPercent(detectMinScore) }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_detect_strictness_hint') }}
            </div>
            <div class="d-flex flex-wrap ga-2 mb-2">
              <v-btn
                v-for="preset in detectStrictnessPresets"
                :key="preset.value"
                size="small"
                rounded
                :variant="Math.abs(detectMinScore - preset.value) < 0.01 ? 'flat' : 'outlined'"
                :color="Math.abs(detectMinScore - preset.value) < 0.01 ? 'primary' : 'secondary'"
                :disabled="busy"
                @click="saveDetectMinScorePreset(preset.value)"
              >
                {{ t(preset.labelKey) }}
              </v-btn>
            </div>
            <v-slider
              v-model="detectMinScore"
              :min="0.5"
              :max="0.75"
              :step="0.01"
              color="primary"
              thumb-label
              :disabled="busy"
              @end="saveDetectMinScore"
            >
              <template #thumb-label="{ modelValue }">
                {{ asPercent(modelValue) }}
              </template>
            </v-slider>
          </div>

          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_match_confidence') }}: {{ asPercent(minConfidence) }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_match_confidence_hint') }}
            </div>
            <v-slider
              v-model="minConfidence"
              :min="0.3"
              :max="0.9"
              :step="0.05"
              color="primary"
              thumb-label
              :disabled="busy"
              @end="saveConfidence"
            >
              <template #thumb-label="{ modelValue }">
                {{ asPercent(modelValue) }}
              </template>
            </v-slider>
          </div>

          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_detect_frames') }}: {{ framesPerVideo }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_detect_frames_hint') }}
            </div>
            <v-slider
              v-model="framesPerVideo"
              :min="1"
              :max="99"
              :step="1"
              color="primary"
              thumb-label
              :disabled="busy"
              @end="saveFramesPerVideo"
            />
          </div>

          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_match_candidates') }}: {{ candidateLimit }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_match_candidates_hint') }}
            </div>
            <v-slider
              v-model="candidateLimit"
              :min="3"
              :max="20"
              :step="1"
              color="primary"
              thumb-label
              :disabled="busy"
              @end="saveCandidateLimit"
            />
          </div>

          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_detect_gender') }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_detect_gender_hint') }}
            </div>
            <div class="d-flex flex-wrap ga-2 mb-2">
              <v-btn
                v-for="preset in genderFilterPresets"
                :key="preset.value"
                size="small"
                rounded
                :variant="genderFilter === preset.value ? 'flat' : 'outlined'"
                :color="genderFilter === preset.value ? 'primary' : 'secondary'"
                :disabled="busy"
                @click="saveGenderFilter(preset.value)"
              >
                {{ t(preset.labelKey) }}
              </v-btn>
            </div>
          </div>

          <div class="face-advanced__group">
            <div class="face-advanced__title">
              {{ t('settings_labels.database.face_match_mode') }}
            </div>
            <div class="face-advanced__hint">
              {{ t('settings_labels.database.face_match_mode_hint') }}
            </div>
            <div class="d-flex flex-wrap ga-2 mb-2">
              <v-btn
                v-for="preset in matchModePresets"
                :key="preset.value"
                size="small"
                rounded
                :variant="matchMode === preset.value ? 'flat' : 'outlined'"
                :color="matchMode === preset.value ? 'primary' : 'secondary'"
                :disabled="busy"
                @click="saveMatchMode(preset.value)"
              >
                {{ t(preset.labelKey) }}
              </v-btn>
            </div>
            <div class="mt-10">
              <settings-switch
                option="faceMatch.matchAfterDetect"
                :title="t('settings_labels.database.face_match_after_detect')"
                :hint="t('settings_labels.database.face_match_after_detect_hint')"
                :disabled="busy"
                @update="saveMatchAfterDetect"
              />
            </div>
          </div>
        </v-expansion-panel-text>
      </v-expansion-panel>
    </v-expansion-panels>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useTasksStore} from '@/stores/tasks'
import {useItemsListSync} from '@/composable/itemsListSync'
import {buildApiUrl} from '@/services/apiClient'
import {getAuthToken} from '@/services/authSession'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import {setNotification} from '@/services/notificationService'
import type { Meta } from '@/types/stores'

interface DetectionStatus {
  total: number
  pending: number
  generated: number
  faces: number
}

interface StreamEvent {
  type: 'progress' | 'complete' | 'error' | 'status'
  phase?: 'downloading_embed' | 'downloading_align' | 'embed_ready' | 'downloading_detect' | 'detect_ready' | 'downloading_gender' | 'gender_ready'
  processed?: number
  total?: number
  created?: number
  skipped?: number
  missing?: number
  failed?: number
  faces?: number
  enrolled?: number
  matched?: number
  applied?: number
  current?: string
  mediaId?: number
  message?: string
  sizeMb?: number
  stopped?: boolean
}

const {t} = useI18n()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()
const tasksStore = useTasksStore()
const listSync = useItemsListSync()

const buildRequestHeaders = (withJson = false): Record<string, string> => {
  const token = getAuthToken()
  return {
    ...(withJson ? {'Content-Type': 'application/json'} : {}),
    ...(token ? {Authorization: `Bearer ${token}`} : {}),
  }
}

const matchModePresets = [
  {value: 'auto', labelKey: 'settings_labels.database.face_match_mode_auto'},
  {value: 'suggest', labelKey: 'settings_labels.database.face_match_mode_suggest'},
]

const detectStrictnessPresets = [
  {value: 0.5, labelKey: 'settings_labels.database.face_detect_strictness_loose'},
  {value: 0.6, labelKey: 'settings_labels.database.face_detect_strictness_balanced'},
  {value: 0.7, labelKey: 'settings_labels.database.face_detect_strictness_strict'},
]

const genderFilterPresets = [
  {value: 'both', labelKey: 'settings_labels.database.face_detect_gender_both'},
  {value: 'female', labelKey: 'settings_labels.database.face_detect_gender_female'},
  {value: 'male', labelKey: 'settings_labels.database.face_detect_gender_male'},
]

const emptyStatus: DetectionStatus = {total: 0, pending: 0, generated: 0, faces: 0}
const status = ref<DetectionStatus>({...emptyStatus})
const statusLoading = ref(false)
const statusLoaded = ref(false)
const statusError = ref('')
const activeJob = ref<'detect' | 'enroll' | 'match' | null>(null)
const lastCompletedJob = ref<'detect' | 'enroll' | 'match' | null>(null)
const progress = ref(0)
const currentPath = ref('')
const lastSummary = ref('')
const modelStatus = ref('unknown')
const modelDownloading = ref(false)
const embedStatus = ref('unknown')
const embedDownloading = ref(false)
const abortController = ref<AbortController | null>(null)
const taskId = ref<string | null>(null)
const counters = ref<Record<string, number>>({})

const selectedPerformerMeta = ref<Meta | null>(null)
const minConfidence = ref(Number(settingsStore['faceMatch.minConfidence'] || 0.55))
const candidateLimit = ref(Number(settingsStore['faceMatch.candidateLimit'] || 10))
const detectMinScore = ref(Math.min(0.75, Math.max(0.5, Number(settingsStore['faceDetect.minScore'] || 0.5))))
const framesPerVideo = ref(Number(settingsStore['faceDetect.framesPerVideo'] || 6))
const genderFilter = ref<'both' | 'female' | 'male'>(
  ['both', 'female', 'male'].includes(String(settingsStore['faceDetect.genderFilter'] || 'both'))
    ? (String(settingsStore['faceDetect.genderFilter'] || 'both') as 'both' | 'female' | 'male')
    : 'both',
)
const matchMode = ref(String(settingsStore['faceMatch.mode'] || 'auto'))
const matchAfterDetect = ref(String(settingsStore['faceMatch.matchAfterDetect'] || '1') === '1')

const asPercent = (value: number | string | null | undefined) => (
  `${Math.round(Number(value || 0) * 100)}%`
)
const matchStatusView = ref({
  performerTags: 0,
  enrolledTags: 0,
  enrolledFaces: 0,
  faces: 0,
  matchedFaces: 0,
})

const arrayMetas = computed(() => (
  (appStore.meta || []).filter((meta) => meta.type === 'array')
))

const busy = computed(() => Boolean(activeJob.value) || statusLoading.value || modelDownloading.value || embedDownloading.value)
const modelReady = computed(() => ['downloaded', 'loaded'].includes(modelStatus.value))
const embedReady = computed(() => ['downloaded', 'loaded'].includes(embedStatus.value))
const modelsReady = computed(() => modelReady.value && embedReady.value)
const canDetect = computed(() => status.value.pending > 0 || (matchAfterDetect.value && status.value.total > 0 && matchStatusView.value.enrolledTags > 0 && matchStatusView.value.matchedFaces < matchStatusView.value.faces))

const hasCategory = computed(() => Boolean(selectedPerformerMeta.value))
const hasPerformers = computed(() => matchStatusView.value.performerTags > 0)
const hasEnrollments = computed(() => matchStatusView.value.enrolledTags > 0)
const hasFaces = computed(() => matchStatusView.value.faces > 0 || status.value.faces > 0)
const hasMatches = computed(() => matchStatusView.value.matchedFaces > 0)

const activeProgressLabel = computed(() => {
  if (activeJob.value === 'enroll') {
    return t('settings_labels.database.face_match_enroll_progress', counters.value)
  }
  if (activeJob.value === 'match') {
    return t('settings_labels.database.face_match_run_progress', counters.value)
  }
  return t('settings_labels.database.detect_faces_progress', counters.value)
})

const steps = computed(() => {
  const categoryDone = hasCategory.value
  const enrollDone = hasEnrollments.value
  const detectDone = hasFaces.value
  const matchDone = hasMatches.value || (matchAfterDetect.value && detectDone && enrollDone)

  return [
    {
      id: 'category',
      number: 1,
      done: categoryDone,
      current: !categoryDone,
      title: t('settings_labels.database.face_workflow_step1_title'),
      text: t('settings_labels.database.face_workflow_step1_text'),
      status: categoryDone
        ? t('settings_labels.database.face_workflow_step1_done', {
          name: selectedPerformerMeta.value?.name || '',
          count: matchStatusView.value.performerTags,
        })
        : '',
    },
    {
      id: 'enroll',
      number: 2,
      done: enrollDone,
      current: categoryDone && !enrollDone,
      title: t('settings_labels.database.face_workflow_step3_title'),
      text: t('settings_labels.database.face_workflow_step3_text'),
      status: enrollDone
        ? t('settings_labels.database.face_workflow_step3_done', {
          enrolledTags: matchStatusView.value.enrolledTags,
          enrolledFaces: matchStatusView.value.enrolledFaces,
        })
        : '',
    },
    {
      id: 'detect',
      number: 3,
      done: detectDone,
      current: categoryDone && enrollDone && !detectDone,
      title: t('settings_labels.database.face_workflow_step4_title'),
      text: t('settings_labels.database.face_workflow_step4_text'),
      status: statusLoaded.value
        ? t('settings_labels.database.detect_faces_status', status.value)
        : '',
    },
    {
      id: 'match',
      number: 4,
      done: matchDone,
      current: categoryDone && enrollDone && detectDone && !matchDone,
      title: t('settings_labels.database.face_workflow_step5_title'),
      text: t('settings_labels.database.face_workflow_step5_text'),
      status: detectDone
        ? t('settings_labels.database.face_workflow_step5_done', {
          matchedFaces: matchStatusView.value.matchedFaces,
          faces: matchStatusView.value.faces || status.value.faces,
        })
        : '',
    },
  ]
})

const nextStep = computed(() => {
  if (!hasCategory.value) {
    return {
      alertType: 'info' as const,
      title: t('settings_labels.database.face_workflow_next_category_title'),
      text: t('settings_labels.database.face_workflow_next_category_text'),
      action: null as (() => void) | null,
      actionLabel: '',
      icon: 'mdi-account-group',
      loading: false,
      allowWhileBusy: false,
    }
  }
  if (!hasPerformers.value) {
    return {
      alertType: 'warning' as const,
      title: t('settings_labels.database.face_workflow_next_performers_title'),
      text: t('settings_labels.database.face_workflow_next_performers_text'),
      action: null,
      actionLabel: '',
      icon: 'mdi-account-plus',
      loading: false,
      allowWhileBusy: false,
    }
  }
  if (!modelsReady.value) {
    return {
      alertType: 'info' as const,
      title: t('settings_labels.database.face_workflow_next_models_title'),
      text: t('settings_labels.database.face_workflow_next_models_text'),
      action: downloadAllModels,
      actionLabel: t('settings_labels.database.face_workflow_download_models'),
      icon: 'mdi-download',
      loading: modelDownloading.value || embedDownloading.value,
      allowWhileBusy: false,
    }
  }
  if (!hasEnrollments.value) {
    return {
      alertType: 'info' as const,
      title: t('settings_labels.database.face_workflow_next_enroll_title'),
      text: t('settings_labels.database.face_workflow_next_enroll_text'),
      action: () => startEnrollment(false),
      actionLabel: t('settings_labels.database.face_match_enroll'),
      icon: 'mdi-account-box-multiple',
      loading: activeJob.value === 'enroll',
      allowWhileBusy: false,
    }
  }
  if (!hasFaces.value) {
    return {
      alertType: 'info' as const,
      title: t('settings_labels.database.face_workflow_next_detect_title'),
      text: t('settings_labels.database.face_workflow_next_detect_text'),
      action: () => startDetection(false),
      actionLabel: t('settings_labels.database.detect_faces_start'),
      icon: 'mdi-play',
      loading: activeJob.value === 'detect',
      allowWhileBusy: false,
    }
  }
  if (!hasMatches.value && !matchAfterDetect.value) {
    return {
      alertType: 'info' as const,
      title: t('settings_labels.database.face_workflow_next_match_title'),
      text: t('settings_labels.database.face_workflow_next_match_text'),
      action: () => startMatching(false),
      actionLabel: t('settings_labels.database.face_match_run'),
      icon: 'mdi-link-variant',
      loading: activeJob.value === 'match',
      allowWhileBusy: false,
    }
  }
  return {
    alertType: 'success' as const,
    title: t('settings_labels.database.face_workflow_ready_title'),
    text: t('settings_labels.database.face_workflow_ready_text', {
      matchedFaces: matchStatusView.value.matchedFaces,
      faces: matchStatusView.value.faces || status.value.faces,
      enrolledTags: matchStatusView.value.enrolledTags,
    }),
    action: status.value.pending > 0 ? () => startDetection(false) : null,
    actionLabel: t('settings_labels.database.detect_faces_start'),
    icon: 'mdi-play',
    loading: activeJob.value === 'detect',
    allowWhileBusy: false,
  }
})

const syncSelectedMetaFromSettings = () => {
  const configured = Number(settingsStore['faceMatch.performerMetaId'] || 0)
  if (configured) {
    selectedPerformerMeta.value = arrayMetas.value.find((meta) => Number(meta.id) === configured) || null
    return
  }
  selectedPerformerMeta.value = arrayMetas.value.find((meta) => Boolean(meta.scraper)) || null
}

const onPerformerMetaChange = (meta: Meta | null) => {
  selectedPerformerMeta.value = meta
  void setOption(meta?.id ? String(meta.id) : '', 'faceMatch.performerMetaId')
  void refreshMatchStatus()
}

const saveConfidence = () => {
  void setOption(String(minConfidence.value), 'faceMatch.minConfidence')
}

const saveCandidateLimit = () => {
  const value = Math.min(20, Math.max(3, Math.round(Number(candidateLimit.value) || 10)))
  candidateLimit.value = value
  void setOption(String(value), 'faceMatch.candidateLimit')
}

const saveDetectMinScore = () => {
  const value = Math.min(0.75, Math.max(0.5, Number(detectMinScore.value) || 0.5))
  detectMinScore.value = value
  void setOption(String(value), 'faceDetect.minScore')
}

const saveDetectMinScorePreset = (value: number) => {
  detectMinScore.value = value
  saveDetectMinScore()
}

const saveFramesPerVideo = () => {
  const value = Math.min(99, Math.max(1, Math.round(Number(framesPerVideo.value) || 6)))
  framesPerVideo.value = value
  void setOption(String(value), 'faceDetect.framesPerVideo')
}

const saveGenderFilter = (value: string | null) => {
  if (!value || !['both', 'female', 'male'].includes(value)) return
  genderFilter.value = value as 'both' | 'female' | 'male'
  void setOption(value, 'faceDetect.genderFilter')
}

const saveMatchMode = (value: string | null) => {
  if (!value) return
  matchMode.value = value
  void setOption(value, 'faceMatch.mode')
}

const saveMatchAfterDetect = (value: string | number | boolean) => {
  matchAfterDetect.value = value === true || value === '1' || value === 1
}

const refreshModelStatus = async () => {
  try {
    const response = await typedApi.getFaceModelStatus()
    modelStatus.value = response.data?.status || 'unknown'
  } catch {
    modelStatus.value = 'error'
  }
}

const refreshEmbedStatus = async () => {
  try {
    const response = await typedApi.getFaceEmbedModelStatus()
    embedStatus.value = response.data?.status || 'unknown'
  } catch {
    embedStatus.value = 'error'
  }
}

const refreshMatchStatus = async () => {
  try {
    const response = await typedApi.getFaceMatchStatus()
    const data = response.data || {}
    matchStatusView.value = {
      performerTags: Number(data.performerTags || 0),
      enrolledTags: Number(data.enrolledTags || 0),
      enrolledFaces: Number(data.enrolledFaces || 0),
      faces: Number(data.faces || 0),
      matchedFaces: Number(data.matchedFaces || 0),
    }
    if (data.embedModel?.status) embedStatus.value = String(data.embedModel.status)
    if (data.settings?.minConfidence != null) minConfidence.value = Number(data.settings.minConfidence)
    if (data.settings?.candidateLimit != null) candidateLimit.value = Number(data.settings.candidateLimit)
    if (data.settings?.mode) matchMode.value = String(data.settings.mode)
    if (data.settings?.matchAfterDetect != null) matchAfterDetect.value = Boolean(data.settings.matchAfterDetect)
  } catch {
    // Keep previous values.
  }
}

const downloadModel = async () => {
  modelDownloading.value = true
  modelStatus.value = 'loading'
  try {
    const response = await typedApi.downloadFaceModel()
    modelStatus.value = response.data?.status || 'downloaded'
  } catch {
    modelStatus.value = 'error'
    throw new Error(t('settings_labels.database.detect_faces_model_failed'))
  } finally {
    modelDownloading.value = false
  }
}

const downloadEmbedModel = async () => {
  embedDownloading.value = true
  embedStatus.value = 'loading'
  setNotification({
    type: 'info',
    text: t('settings_labels.database.face_match_embed_downloading'),
  })
  try {
    const response = await typedApi.downloadFaceEmbedModel()
    embedStatus.value = response.data?.status || 'downloaded'
    setNotification({
      type: 'success',
      text: t('settings_labels.database.face_match_embed_downloaded'),
    })
  } catch {
    embedStatus.value = 'error'
    throw new Error(t('settings_labels.database.face_match_embed_failed'))
  } finally {
    embedDownloading.value = false
  }
}

const downloadAllModels = async () => {
  try {
    if (!modelReady.value) await downloadModel()
    if (!embedReady.value) await downloadEmbedModel()
    else setNotification({type: 'success', text: t('settings.path_parser.statuses.downloaded')})
  } catch (error: unknown) {
    setNotification({
      type: 'error',
      text: error instanceof Error ? error.message : String(error),
    })
  }
}

const refreshStatus = async () => {
  statusLoading.value = true
  statusError.value = ''
  try {
    syncSelectedMetaFromSettings()
    await Promise.all([refreshModelStatus(), refreshEmbedStatus(), refreshMatchStatus()])
    const response = await typedApi.getFaceDetectionStatus()
    status.value = {
      total: Number(response.data?.total || 0),
      pending: Number(response.data?.pending || 0),
      generated: Number(response.data?.generated || 0),
      faces: Number(response.data?.faces || 0),
    }
    statusLoaded.value = true
  } catch (error: unknown) {
    statusError.value = error instanceof Error ? error.message : String(error)
    statusLoaded.value = false
  } finally {
    statusLoading.value = false
  }
}

const stopJob = () => {
  abortController.value?.abort()
}

onBeforeUnmount(() => {
  stopJob()
  if (taskId.value) {
    tasksStore.removeTask(taskId.value)
    taskId.value = null
  }
  abortController.value = null
  activeJob.value = null
})

const runStreamJob = async (options: {
  job: 'detect' | 'enroll' | 'match'
  url: string
  body: Record<string, unknown>
  title: string
  progressKey: string
  completeKey: string
}) => {
  if (activeJob.value) return
  activeJob.value = options.job
  progress.value = 0
  currentPath.value = ''
  lastSummary.value = ''
  lastCompletedJob.value = null
  counters.value = {processed: 0, total: 0}

  abortController.value = new AbortController()
  taskId.value = tasksStore.setTask({
    title: options.title,
    subtitle: '',
    icon: 'face-recognition',
    progress: 0,
    action: stopJob,
  })
  const refreshedMediaIds = new Set<number>()

  try {
    const response = await fetch(buildApiUrl(options.url), {
      method: 'POST',
      headers: buildRequestHeaders(true),
      body: JSON.stringify(options.body),
      signal: abortController.value.signal,
    })

    if (!response.ok || !response.body) {
      throw new Error(t('settings_labels.database.detect_faces_api_unavailable'))
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
        const event = JSON.parse(line) as StreamEvent
        if (event.type === 'status') {
          if (event.phase === 'downloading_detect') {
            setNotification({
              type: 'info',
              text: t('settings_labels.database.face_detect_model_downloading'),
            })
            if (taskId.value) {
              tasksStore.updateTask(taskId.value, {
                subtitle: t('settings_labels.database.face_detect_model_downloading'),
                progress: 0,
              })
            }
          }
          if (event.phase === 'detect_ready') {
            setNotification({
              type: 'success',
              text: t('settings_labels.database.face_detect_model_downloaded'),
            })
          }
          if (event.phase === 'downloading_gender') {
            setNotification({
              type: 'info',
              text: t('settings_labels.database.face_detect_gender_downloading'),
            })
            if (taskId.value) {
              tasksStore.updateTask(taskId.value, {
                subtitle: t('settings_labels.database.face_detect_gender_downloading'),
                progress: 0,
              })
            }
          }
          if (event.phase === 'gender_ready') {
            setNotification({
              type: 'success',
              text: t('settings_labels.database.face_detect_gender_downloaded'),
            })
          }
          if (event.phase === 'downloading_align') {
            setNotification({
              type: 'info',
              text: t('settings_labels.database.face_match_align_downloading'),
            })
            if (taskId.value) {
              tasksStore.updateTask(taskId.value, {
                subtitle: t('settings_labels.database.face_match_align_downloading'),
                progress: 0,
              })
            }
          }
          if (event.phase === 'downloading_embed') {
            embedDownloading.value = true
            embedStatus.value = 'loading'
            setNotification({
              type: 'info',
              text: t('settings_labels.database.face_match_embed_downloading'),
            })
            if (taskId.value) {
              tasksStore.updateTask(taskId.value, {
                subtitle: t('settings_labels.database.face_match_embed_downloading'),
                progress: 0,
              })
            }
          }
          if (event.phase === 'embed_ready') {
            embedDownloading.value = false
            embedStatus.value = 'downloaded'
            setNotification({
              type: 'success',
              text: t('settings_labels.database.face_match_embed_downloaded'),
            })
          }
          continue
        }
        if (event.type === 'progress') {
          const mediaId = Number(event.mediaId)
          if (Number.isFinite(mediaId) && mediaId > 0) refreshedMediaIds.add(mediaId)
          counters.value = {...event} as unknown as Record<string, number>
          currentPath.value = event.current || ''
          progress.value = event.total
            ? Math.min(((event.processed || 0) / event.total) * 100, 100)
            : 0
          if (taskId.value) {
            tasksStore.updateTask(taskId.value, {
              subtitle: t(options.progressKey, counters.value),
              progress: progress.value,
            })
          }
        }
        if (event.type === 'complete') {
          counters.value = {...event} as unknown as Record<string, number>
          lastSummary.value = t(options.completeKey, counters.value)
          lastCompletedJob.value = options.job
          progress.value = 100
        }
        if (event.type === 'error') {
          throw new Error(event.message || t('settings_labels.database.detect_faces_api_unavailable'))
        }
      }
    }

    if (refreshedMediaIds.size && (options.job === 'detect' || options.job === 'match')) {
      listSync.getItemsFromDb({
        ids: [...refreshedMediaIds],
        type: 'media',
      })
    }

    setNotification({type: 'success', text: lastSummary.value || options.title})
  } catch (error: unknown) {
    if ((error as {name?: string})?.name !== 'AbortError') {
      setNotification({
        type: 'error',
        text: error instanceof Error ? error.message : String(error),
      })
    }
  } finally {
    if (taskId.value) {
      tasksStore.removeTask(taskId.value)
      taskId.value = null
    }
    abortController.value = null
    activeJob.value = null
    await refreshStatus()
  }
}

const startDetection = (force: boolean) => runStreamJob({
  job: 'detect',
  url: '/api/Task/streamFaceDetection',
  body: {force},
  title: t('settings_labels.database.detect_faces'),
  progressKey: 'settings_labels.database.detect_faces_progress',
  completeKey: 'settings_labels.database.detect_faces_complete',
})

const startEnrollment = (force: boolean) => runStreamJob({
  job: 'enroll',
  url: '/api/Task/streamFaceEnrollment',
  body: {
    force,
    metaId: selectedPerformerMeta.value?.id || undefined,
  },
  title: t('settings_labels.database.face_match_enroll'),
  progressKey: 'settings_labels.database.face_match_enroll_progress',
  completeKey: 'settings_labels.database.face_match_enroll_complete',
})

const openEnrollmentQuality = () => {
  dialogsStore.openEnrollmentQuality(
    selectedPerformerMeta.value?.id != null ? Number(selectedPerformerMeta.value.id) : null,
  )
}

const startMatching = (force: boolean) => runStreamJob({
  job: 'match',
  url: '/api/Task/streamFaceMatching',
  body: {force},
  title: t('settings_labels.database.face_match_run'),
  progressKey: 'settings_labels.database.face_match_run_progress',
  completeKey: 'settings_labels.database.face_match_run_complete',
})

onMounted(() => {
  const storedStrictness = Number(settingsStore['faceDetect.minScore'] || 0.5)
  if (Number.isFinite(storedStrictness) && storedStrictness > 0.75) {
    saveDetectMinScore()
  }
  void refreshStatus()
})
</script>

<style scoped>
.selectable {
  user-select: text;
}

.face-next-step {
  box-shadow: 0 1px 0 rgba(var(--v-theme-on-surface), 0.04);
}

.face-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.face-step {
  display: flex;
  gap: 12px;
  padding: 14px 14px 14px 12px;
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.03);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.06);
}

.face-step--current {
  border-color: rgba(var(--v-theme-primary), 0.35);
  background: rgba(var(--v-theme-primary), 0.06);
}

.face-step--done {
  opacity: 0.92;
}

.face-step__badge {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  font-size: 13px;
  font-weight: 600;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.face-step--done .face-step__badge {
  background: rgba(var(--v-theme-success), 0.18);
  color: rgb(var(--v-theme-success));
}

.face-step--current .face-step__badge {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.face-step__title {
  font-weight: 600;
  margin-bottom: 2px;
}

.face-advanced :deep(.v-expansion-panel-title) {
  font-size: 0.95rem;
}

.face-advanced__group {
  padding: 14px 0;
}

.face-advanced__group:first-child {
  padding-top: 4px;
}

.face-advanced__group:last-child {
  padding-bottom: 0;
}

.face-advanced__title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.87);
  margin-bottom: 4px;
}

.face-advanced__hint {
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), 0.6);
  margin-bottom: 8px;
}

.face-reference-tips {
  padding: 14px 16px 14px;
  border-radius: 16px;
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  overflow: hidden;
}

.face-reference-tips__art {
  max-width: none;
}

.face-reference-tips__art :deep(.v-img__img) {
  object-position: left center;
}

.face-reference-tips__copy {
  padding: 0;
}
</style>
