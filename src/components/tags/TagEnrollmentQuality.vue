<template>
  <div v-if="shouldShow" class="tag-enrollment-quality">
    <v-menu
      v-model="menuOpen"
      :open-on-hover="!isTouch"
      :close-on-content-click="false"
      location="bottom start"
      offset="8"
    >
      <template #activator="{props: menuProps}">
        <button
          v-bind="menuProps"
          type="button"
          class="tag-enrollment-quality__trigger"
          :title="triggerTitle"
          :disabled="loading && !result"
          @click.stop="menuOpen = !menuOpen"
        >
          <v-progress-circular
            v-if="loading && !result"
            indeterminate
            :size="36"
            :width="3.5"
            color="primary"
            bg-color="surface-variant"
          />
          <v-progress-circular
            v-else
            :model-value="gradePercent(result?.grade)"
            :color="gradeColor(result?.grade || (error ? 'bad' : 'none'))"
            :size="36"
            :width="3.5"
            bg-color="surface-variant"
          >
            <v-icon
              v-if="error"
              icon="mdi-alert-circle-outline"
              size="16"
              color="error"
            />
            <span v-else class="tag-enrollment-quality__score">
              {{ gradeShort(result?.grade) }}
            </span>
          </v-progress-circular>
        </button>
      </template>

      <v-card min-width="280" max-width="360" rounded="xl" class="tag-enrollment-quality__menu">
        <v-card-title class="text-body-2 d-flex align-center justify-space-between ga-2 pb-1">
          <span>{{ t('enrollment_quality.tag_panel_title') }}</span>
          <div class="d-flex align-center ga-1">
            <v-chip
              v-if="result"
              size="small"
              :color="gradeColor(result.grade)"
              variant="flat"
            >
              {{ gradeLabel(result.grade) }}
            </v-chip>
            <v-btn
              icon
              size="x-small"
              variant="text"
              :loading="loading"
              :disabled="loading"
              :title="t('enrollment_quality.refresh')"
              @click.stop="refresh"
            >
              <v-icon icon="mdi-refresh" size="18" />
            </v-btn>
          </div>
        </v-card-title>

        <v-card-text class="pt-0">
          <div v-if="loading && !result" class="text-caption text-medium-emphasis">
            {{ t('enrollment_quality.checking_tag') }}
          </div>

          <div v-else-if="error" class="text-caption text-error">
            {{ error }}
          </div>

          <template v-else-if="result">
            <div class="text-caption text-medium-emphasis mb-2">
              {{ t('enrollment_quality.tag_panel_hint') }}
            </div>

            <div class="text-caption mb-2">
              {{ t('enrollment_quality.tag_stats', {
                images: result.imageCount,
                enrolled: result.enrolledCount,
                intra: formatScore(result.intraSimilarity),
                confusion: formatScore(result.confusionScore),
              }) }}
              <span v-if="result.confusedWithTagName">
                · {{ t('enrollment_quality.confused_with', {name: result.confusedWithTagName}) }}
              </span>
            </div>

            <div v-if="result.issues.length" class="d-flex flex-wrap ga-1 mb-2">
              <v-chip
                v-for="issue in result.issues"
                :key="issue"
                size="x-small"
                color="warning"
                variant="tonal"
              >
                {{ issueLabel(issue) }}
              </v-chip>
            </div>

            <div class="d-flex flex-wrap ga-2">
              <v-chip
                v-for="image in result.images"
                :key="image.type"
                size="small"
                :color="gradeColor(image.grade)"
                variant="tonal"
              >
                {{ image.type }}
                <span v-if="image.detectScore != null" class="ml-1 opacity-70">
                  {{ Number(image.detectScore).toFixed(2) }}
                </span>
              </v-chip>
              <span v-if="!result.images.length" class="text-caption text-medium-emphasis">
                {{ t('enrollment_quality.no_images') }}
              </span>
            </div>
          </template>
        </v-card-text>
      </v-card>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, onBeforeUnmount, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'

interface QualityResult {
  tagId: number
  imageCount: number
  enrolledCount: number
  intraSimilarity: number | null
  confusionScore: number | null
  confusedWithTagName: string | null
  images: Array<{type: string; detectScore: number | null; grade: string}>
  issues: string[]
  grade: string
}

const props = defineProps<{
  tagId: number
  metaId: number
}>()

const {t} = useI18n()
const {mobile} = useDisplay()
const settingsStore = useSettingsStore()

const loading = ref(false)
const error = ref('')
const result = ref<QualityResult | null>(null)
const menuOpen = ref(false)
const isTouch = ref(false)

const performerMetaId = computed(() => Number(settingsStore['faceMatch.performerMetaId'] || 0))
const shouldShow = computed(() => (
  Boolean(props.tagId)
  && Boolean(props.metaId)
  && performerMetaId.value > 0
  && Number(props.metaId) === performerMetaId.value
))

const triggerTitle = computed(() => {
  if (loading.value && !result.value) return t('enrollment_quality.checking_tag')
  if (error.value) return error.value
  if (!result.value) return t('enrollment_quality.tag_panel_title')
  return `${t('enrollment_quality.tag_panel_title')}: ${gradeLabel(result.value.grade)}`
})

const gradeColor = (grade: string) => {
  if (grade === 'good') return 'success'
  if (grade === 'ok') return 'primary'
  if (grade === 'weak') return 'warning'
  if (grade === 'bad') return 'error'
  return 'secondary'
}

const gradePercent = (grade?: string | null) => {
  if (grade === 'good') return 92
  if (grade === 'ok') return 72
  if (grade === 'weak') return 42
  if (grade === 'bad') return 18
  return 0
}

const gradeShort = (grade?: string | null) => {
  if (grade === 'good') return 'A'
  if (grade === 'ok') return 'B'
  if (grade === 'weak') return 'C'
  if (grade === 'bad') return 'D'
  return '—'
}

const gradeLabel = (grade: string) => t(`enrollment_quality.grade_${grade}`)
const issueLabel = (issue: string) => t(`enrollment_quality.issue_${issue}`)
const formatScore = (score: number | null | undefined) => (
  score == null || !Number.isFinite(Number(score)) ? '—' : Number(score).toFixed(2)
)

const load = async () => {
  if (!shouldShow.value) {
    result.value = null
    return
  }
  loading.value = true
  error.value = ''
  try {
    const response = await typedApi.getEnrollmentQualityForTag(Number(props.tagId))
    result.value = response.data as QualityResult
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
    result.value = null
  } finally {
    loading.value = false
  }
}

/** Rebuild face references in DB, then refresh the quality readout. */
const refresh = async () => {
  if (!shouldShow.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const response = await typedApi.enrollTagFaces({
      tagId: Number(props.tagId),
      force: true,
    })
    const data = response.data as {quality?: QualityResult | null} | undefined
    if (data?.quality) {
      result.value = data.quality
      return
    }
    const qualityResponse = await typedApi.getEnrollmentQualityForTag(Number(props.tagId))
    result.value = qualityResponse.data as QualityResult
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.tagId, props.metaId, performerMetaId.value, shouldShow.value] as const,
  () => {
    void load()
  },
  {immediate: true},
)

onMounted(() => {
  isTouch.value = mobile.value
    || (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0))
})

onBeforeUnmount(() => {
  menuOpen.value = false
})

const applyResult = (data: QualityResult | Record<string, unknown> | null) => {
  if (!shouldShow.value) {
    result.value = null
    return
  }
  error.value = ''
  loading.value = false
  result.value = data ? (data as QualityResult) : null
}

const beginRefresh = () => {
  if (!shouldShow.value) return
  loading.value = true
  error.value = ''
}

defineExpose({reload: load, applyResult, beginRefresh})
</script>

<style scoped>
.tag-enrollment-quality {
  display: inline-flex;
}

.tag-enrollment-quality__trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: rgba(var(--v-theme-surface), 0.92);
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.16);
}

.tag-enrollment-quality__score {
  font-size: 0.7rem;
  font-weight: 700;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.tag-enrollment-quality__menu {
  overflow: hidden;
}
</style>
