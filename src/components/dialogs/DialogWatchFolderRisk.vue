<template>
  <v-dialog
    :model-value="state.open"
    persistent
    width="520"
    scrollable
  >
    <v-card
      class="watch-risk-dialog"
      rounded="xl"
    >
      <v-card-title class="text-h6 pt-5 px-6">
        {{ t('settings_labels.tools.watch_risk_title') }}
      </v-card-title>

      <v-card-text class="px-6 pb-2">
        <p class="text-body-2 text-medium-emphasis mb-4">
          {{ t('settings_labels.tools.watch_risk_hint') }}
        </p>

        <div
          v-if="assessment"
          class="watch-risk-dialog__meter mb-4"
        >
          <div class="d-flex align-center justify-space-between mb-2">
            <v-chip
              size="small"
              variant="tonal"
              :color="gradeColor"
            >
              {{ gradeLabel }}
            </v-chip>
            <span class="text-caption text-medium-emphasis">
              {{ t('settings_labels.tools.watch_risk_files', {
                count: assessment.fileCount,
                limit: assessment.limit,
              }) }}
            </span>
          </div>
          <v-progress-linear
            :model-value="meterPercent"
            :color="gradeColor"
            height="10"
            rounded
          />
          <div
            v-if="assessment.usePolling || assessment.hddFactorApplied"
            class="text-caption text-medium-emphasis mt-2"
          >
            <span v-if="assessment.usePolling">
              {{ t('settings_labels.tools.watch_risk_polling') }}
            </span>
            <span v-if="assessment.hddFactorApplied">
              {{ assessment.usePolling ? ' · ' : '' }}
              {{ t('settings_labels.tools.watch_risk_hdd') }}
            </span>
          </div>
        </div>

        <div class="text-caption text-medium-emphasis mb-1">
          {{ state.folderPath }}
        </div>

        <div class="watch-risk-dialog__excludes mt-4">
          <div class="text-subtitle-2 mb-2">
            {{ t('settings_labels.tools.excluded_paths') }}
          </div>
          <div class="d-flex flex-wrap ga-2 mb-2">
            <v-chip
              v-for="path in state.excludedPaths"
              :key="path"
              size="small"
              closable
              @click:close="removeExclude(path)"
            >
              {{ path }}
            </v-chip>
          </div>
          <div class="d-flex ga-2">
            <v-btn
              size="small"
              variant="tonal"
              prepend-icon="mdi-folder-plus-outline"
              @click="openExcludeBrowse"
            >
              {{ t('settings_labels.tools.add_excluded_path') }}
            </v-btn>
            <v-btn
              size="small"
              variant="text"
              :loading="state.loading"
              :disabled="!state.excludedPaths.length"
              @click="reassess"
            >
              {{ t('settings_labels.tools.watch_risk_recheck') }}
            </v-btn>
          </div>
        </div>
      </v-card-text>

      <v-card-actions class="px-5 pb-5 pt-2">
        <v-btn
          variant="text"
          rounded="pill"
          @click="onSkip"
        >
          {{ t('settings_labels.tools.watch_risk_skip') }}
        </v-btn>
        <v-spacer/>
        <v-btn
          variant="tonal"
          rounded="pill"
          :color="assessment?.grade === 'green' ? 'success' : 'warning'"
          @click="onAsIs"
        >
          {{ assessment?.grade === 'green'
            ? t('settings_labels.tools.watch_risk_continue')
            : t('settings_labels.tools.watch_risk_as_is') }}
        </v-btn>
      </v-card-actions>
    </v-card>

    <DialogBrowseFolder
      v-if="showBrowse"
      v-model="showBrowse"
      :header="t('settings_labels.tools.add_excluded_path')"
      :initial-path="state.folderPath"
      @confirm="onExcludeConfirm"
    />
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  refreshWatchFolderRiskAssessment,
  resolveWatchFolderRiskGate,
  setWatchFolderRiskExcludes,
  useWatchFolderRiskGateState,
} from '@/composable/useWatchFolderRiskGate'
import {
  isStrictChildPath,
  normalizeExcludedPathsClient,
} from '@/utils/watchedFolderExcludes'

const DialogBrowseFolder = defineAsyncComponent(() =>
  import('@/components/dialogs/DialogBrowseFolder.vue'),
)

const {t} = useI18n()
const state = useWatchFolderRiskGateState()
const showBrowse = ref(false)

const assessment = computed(() => state.assessment)

const gradeColor = computed(() => {
  const grade = assessment.value?.grade
  if (grade === 'red') return 'error'
  if (grade === 'yellow') return 'warning'
  return 'success'
})

const gradeLabel = computed(() => {
  const grade = assessment.value?.grade || 'green'
  return t(`settings_labels.tools.watch_risk_grade_${grade}`)
})

const meterPercent = computed(() => {
  const ratio = assessment.value?.ratio ?? 0
  return Math.min(100, Math.round(ratio * 100))
})

const openExcludeBrowse = () => {
  window.setTimeout(() => {
    showBrowse.value = true
  }, 0)
}

const removeExclude = (path: string) => {
  setWatchFolderRiskExcludes(state.excludedPaths.filter((item) => item !== path))
  void reassess()
}

const onExcludeConfirm = (paths: string[]) => {
  const cleaned = (paths || []).map((p) => String(p || '').trim()).filter(Boolean)
  const valid = cleaned.filter((next) => isStrictChildPath(state.folderPath, next))
  const next = normalizeExcludedPathsClient(
    state.folderPath,
    [...state.excludedPaths, ...valid],
  )
  setWatchFolderRiskExcludes(next)
  showBrowse.value = false
  void reassess()
}

const reassess = async () => {
  await refreshWatchFolderRiskAssessment()
}

const onSkip = () => {
  resolveWatchFolderRiskGate({action: 'skip'})
}

const onAsIs = () => {
  resolveWatchFolderRiskGate({
    action: 'proceed',
    excludedPaths: [...state.excludedPaths],
  })
}
</script>

<style scoped>
.watch-risk-dialog__meter {
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.08);
}
</style>
