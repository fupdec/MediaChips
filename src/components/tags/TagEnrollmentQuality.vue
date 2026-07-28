<template>
  <div v-if="shouldShow" class="tag-enrollment-quality mt-3">
    <v-alert
      v-if="loading"
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-0"
    >
      {{ t('enrollment_quality.checking_tag') }}
    </v-alert>

    <v-alert
      v-else-if="error"
      type="error"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-0"
    >
      {{ error }}
    </v-alert>

    <v-card
      v-else-if="result"
      variant="tonal"
      rounded="xl"
      class="pa-3"
    >
      <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
        <div class="text-body-2 font-weight-medium">
          {{ t('enrollment_quality.tag_panel_title') }}
        </div>
        <v-chip size="small" :color="gradeColor(result.grade)" variant="flat">
          {{ gradeLabel(result.grade) }}
        </v-chip>
      </div>

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
    </v-card>
  </div>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
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
const settingsStore = useSettingsStore()

const loading = ref(false)
const error = ref('')
const result = ref<QualityResult | null>(null)

const performerMetaId = computed(() => Number(settingsStore['faceMatch.performerMetaId'] || 0))
const shouldShow = computed(() => (
  Boolean(props.tagId)
  && Boolean(props.metaId)
  && performerMetaId.value > 0
  && Number(props.metaId) === performerMetaId.value
))

const gradeColor = (grade: string) => {
  if (grade === 'good') return 'success'
  if (grade === 'ok') return 'primary'
  if (grade === 'weak') return 'warning'
  if (grade === 'bad') return 'error'
  return 'secondary'
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

watch(
  () => [props.tagId, props.metaId, performerMetaId.value, shouldShow.value] as const,
  () => {
    void load()
  },
  {immediate: true},
)

defineExpose({reload: load})
</script>
