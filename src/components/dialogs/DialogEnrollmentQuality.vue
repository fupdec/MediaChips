<template>
  <v-dialog
    :model-value="dialogsStore.enrollmentQuality.show"
    :fullscreen="xs"
    :width="xl ? 960 : 760"
    @update:model-value="onVisibilityChange"
  >
    <v-card class="enrollment-quality-root">
      <DialogHeader
        class="enrollment-quality-header"
        @close="close"
        :header="t('enrollment_quality.title')"
        :subheader="t('enrollment_quality.subtitle')"
        icon="face-recognition"
        closable
        :buttons="headerButtons"
      />

      <div class="enrollment-quality-toolbar pa-3 pa-sm-4 pb-2">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <div v-if="running || paused || tags.length" class="mb-3">
          <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
            <div class="text-caption text-medium-emphasis">
              {{ progressLabel }}
            </div>
            <v-chip
              v-if="paused"
              size="x-small"
              color="warning"
              variant="flat"
            >
              {{ t('enrollment_quality.paused') }}
            </v-chip>
          </div>
          <v-progress-linear
            :model-value="progress"
            :indeterminate="running && !paused && !total"
            color="primary"
            height="8"
            rounded
            class="mt-1"
          />
        </div>

        <v-text-field
          v-model="searchQuery"
          :label="t('enrollment_quality.search')"
          prepend-inner-icon="mdi-magnify"
          variant="outlined"
          density="compact"
          rounded
          clearable
          hide-details
          class="mb-3"
        />

        <div class="text-caption text-medium-emphasis mb-1">
          {{ t('enrollment_quality.filter_preset') }}
        </div>
        <v-chip-group v-model="preset" mandatory selected-class="text-primary" class="mb-2">
          <v-chip value="problems" filter variant="tonal" size="small">
            {{ t('enrollment_quality.filter_problems') }}
            <span class="ml-1 opacity-70">{{ problemTags.length }}</span>
          </v-chip>
          <v-chip value="all" filter variant="tonal" size="small">
            {{ t('enrollment_quality.filter_all') }}
            <span class="ml-1 opacity-70">{{ tags.length }}</span>
          </v-chip>
        </v-chip-group>

        <div class="text-caption text-medium-emphasis mb-1">
          {{ t('enrollment_quality.filter_grades') }}
        </div>
        <div class="d-flex flex-wrap ga-1 mb-3">
          <v-chip
            v-for="grade in GRADE_OPTIONS"
            :key="`grade-filter-${grade}`"
            size="small"
            :color="gradeColor(grade)"
            :variant="selectedGrades.includes(grade) ? 'flat' : 'outlined'"
            filter
            @click="toggleGrade(grade)"
          >
            {{ gradeLabel(grade) }}
            <span class="ml-1 opacity-70">{{ counters[grade] }}</span>
          </v-chip>
          <v-btn
            v-if="selectedGrades.length"
            size="x-small"
            variant="text"
            class="ml-1"
            @click="selectedGrades = []"
          >
            {{ t('enrollment_quality.clear_filters') }}
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis mb-1">
          {{ t('enrollment_quality.filter_issues') }}
        </div>
        <div class="d-flex flex-wrap ga-1 mb-2">
          <v-chip
            v-for="issue in ISSUE_OPTIONS"
            :key="issue"
            size="small"
            color="warning"
            :variant="selectedIssues.includes(issue) ? 'flat' : 'outlined'"
            filter
            @click="toggleIssue(issue)"
          >
            {{ issueLabel(issue) }}
            <span class="ml-1 opacity-70">{{ issueCounts[issue] || 0 }}</span>
          </v-chip>
          <v-btn
            v-if="selectedIssues.length"
            size="x-small"
            variant="text"
            class="ml-1"
            @click="selectedIssues = []"
          >
            {{ t('enrollment_quality.clear_filters') }}
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis">
          {{ t('enrollment_quality.filter_result', {shown: visibleTags.length, total: tags.length}) }}
        </div>
      </div>

      <div ref="listHostRef" class="enrollment-quality-list-host px-3 px-sm-4 pb-3">
        <div v-if="!running && !paused && !tags.length && !error" class="text-medium-emphasis text-body-2 py-2">
          {{ t('enrollment_quality.empty') }}
        </div>
        <div
          v-else-if="tags.length && !visibleTags.length"
          class="text-medium-emphasis text-body-2 py-2"
        >
          {{ t('enrollment_quality.filter_empty') }}
        </div>

        <v-virtual-scroll
          v-else-if="visibleTags.length"
          :items="visibleTags"
          :item-height="ITEM_HEIGHT"
          :height="listHeightPx"
          class="enrollment-quality-list"
        >
          <template #default="{ item: tag }">
            <div class="enrollment-quality-item">
              <v-card
                variant="tonal"
                rounded="xl"
                class="enrollment-quality-card pa-3"
              >
                <div class="d-flex align-center justify-space-between flex-wrap ga-2 mb-2">
                  <div class="font-weight-medium text-truncate">{{ tag.tagName || `#${tag.tagId}` }}</div>
                  <v-chip
                    size="small"
                    :color="gradeColor(tag.grade)"
                    variant="flat"
                  >
                    {{ gradeLabel(tag.grade) }}
                  </v-chip>
                </div>
                <div class="text-caption text-medium-emphasis mb-2 text-truncate">
                  {{ t('enrollment_quality.tag_stats', {
                    images: tag.imageCount,
                    enrolled: tag.enrolledCount,
                    intra: formatScore(tag.intraSimilarity),
                    confusion: formatScore(tag.confusionScore),
                  }) }}
                  <span v-if="tag.confusedWithTagName">
                    · {{ t('enrollment_quality.confused_with', {name: tag.confusedWithTagName}) }}
                  </span>
                </div>
                <div v-if="tag.issues.length" class="d-flex flex-wrap ga-1 mb-2 enrollment-quality-card__chips">
                  <v-chip
                    v-for="issue in tag.issues"
                    :key="`${tag.tagId}-${issue}`"
                    size="x-small"
                    color="warning"
                    variant="tonal"
                    @click="toggleIssue(issue)"
                  >
                    {{ issueLabel(issue) }}
                  </v-chip>
                </div>
                <div class="d-flex flex-wrap ga-2 enrollment-quality-card__chips">
                  <v-chip
                    v-for="image in tag.images"
                    :key="`${tag.tagId}-${image.type}`"
                    size="small"
                    :color="gradeColor(image.grade)"
                    variant="tonal"
                  >
                    {{ image.type }}
                    <span v-if="image.detectScore != null" class="ml-1 opacity-70">
                      {{ Number(image.detectScore).toFixed(2) }}
                    </span>
                  </v-chip>
                </div>
              </v-card>
            </div>
          </template>
        </v-virtual-scroll>
      </div>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import DialogHeader from '@/components/elements/DialogHeader.vue'

const ITEM_HEIGHT = 156
const GRADE_OPTIONS = ['good', 'ok', 'weak', 'bad', 'none'] as const
const ISSUE_OPTIONS = [
  'missing_file',
  'no_face',
  'multi_face',
  'low_score',
  'face_too_small',
  'not_enrolled',
  'inconsistent',
  'confused',
] as const

type Grade = typeof GRADE_OPTIONS[number]
type Issue = typeof ISSUE_OPTIONS[number]

interface QualityImage {
  type: string
  detectScore: number | null
  grade: string
  issues: string[]
}

interface QualityTag {
  tagId: number
  tagName: string | null
  imageCount: number
  enrolledCount: number
  intraSimilarity: number | null
  confusionScore: number | null
  confusedWithTagName: string | null
  images: QualityImage[]
  issues: string[]
  grade: string
}

const emit = defineEmits<{close: []}>()
const {t} = useI18n()
const {xs, xl} = useDisplay()
const dialogsStore = useDialogsStore()
const settingsStore = useSettingsStore()

const running = ref(false)
const paused = ref(false)
const error = ref('')
const tags = ref<QualityTag[]>([])
const preset = ref<'problems' | 'all'>('problems')
const selectedGrades = ref<Grade[]>([])
const selectedIssues = ref<Issue[]>([])
const searchQuery = ref('')
const processed = ref(0)
const total = ref(0)
const counters = ref({good: 0, ok: 0, weak: 0, bad: 0, none: 0})
const abortController = ref<AbortController | null>(null)
const listHostRef = ref<HTMLElement | null>(null)
const listHeightPx = ref(280)
let listResizeObserver: ResizeObserver | null = null

const progress = computed(() => (
  total.value ? Math.min((processed.value / total.value) * 100, 100) : 0
))

const progressLabel = computed(() => {
  if (paused.value) {
    return t('enrollment_quality.progress_paused', {
      processed: processed.value,
      total: total.value || '—',
    })
  }
  if (!total.value && running.value) return t('enrollment_quality.scanning')
  return t('enrollment_quality.progress', {
    processed: processed.value,
    total: total.value,
  })
})

const problemTags = computed(() => tags.value.filter((tag) => (
  tag.grade === 'weak' || tag.grade === 'bad' || tag.issues.length > 0
)))

const issueCounts = computed(() => {
  const counts = Object.fromEntries(ISSUE_OPTIONS.map((issue) => [issue, 0])) as Record<Issue, number>
  for (const tag of tags.value) {
    for (const issue of tag.issues) {
      if (issue in counts) counts[issue as Issue] += 1
    }
  }
  return counts
})

const visibleTags = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  const grades = selectedGrades.value
  const issues = selectedIssues.value

  return tags.value.filter((tag) => {
    if (preset.value === 'problems') {
      const isProblem = tag.grade === 'weak' || tag.grade === 'bad' || tag.issues.length > 0
      if (!isProblem) return false
    }
    if (grades.length && !grades.includes(tag.grade as Grade)) return false
    if (issues.length && !issues.some((issue) => tag.issues.includes(issue))) return false
    if (query) {
      const name = String(tag.tagName || '').toLowerCase()
      const id = String(tag.tagId)
      const confused = String(tag.confusedWithTagName || '').toLowerCase()
      if (!name.includes(query) && !id.includes(query) && !confused.includes(query)) return false
    }
    return true
  })
})

const headerButtons = computed(() => {
  const buttons: Array<{
    icon: string
    text: string
    color: string
    outlined?: boolean
    disabled?: boolean
    action: () => void
  }> = []

  if (running.value || paused.value) {
    buttons.push({
      icon: paused.value ? 'play' : 'pause',
      text: paused.value ? t('enrollment_quality.resume') : t('enrollment_quality.pause'),
      color: paused.value ? 'success' : 'warning',
      outlined: !paused.value,
      action: togglePause,
    })
  }

  buttons.push({
    icon: 'refresh',
    text: t('enrollment_quality.rescan'),
    color: 'primary',
    action: () => void startScan(),
  })

  return buttons
})

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

const toggleGrade = (grade: Grade) => {
  const next = new Set(selectedGrades.value)
  if (next.has(grade)) next.delete(grade)
  else next.add(grade)
  selectedGrades.value = [...next]
}

const toggleIssue = (issue: Issue | string) => {
  if (!ISSUE_OPTIONS.includes(issue as Issue)) return
  const key = issue as Issue
  const next = new Set(selectedIssues.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selectedIssues.value = [...next]
}

const updateListHeight = () => {
  const el = listHostRef.value
  if (!el) return
  listHeightPx.value = Math.max(180, Math.floor(el.clientHeight))
}

const observeListHost = async () => {
  await nextTick()
  listResizeObserver?.disconnect()
  const el = listHostRef.value
  if (!el || typeof ResizeObserver === 'undefined') {
    updateListHeight()
    return
  }
  listResizeObserver = new ResizeObserver(() => updateListHeight())
  listResizeObserver.observe(el)
  updateListHeight()
}

const waitWhilePaused = async (signal: AbortSignal) => {
  while (paused.value) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    await new Promise((resolve) => setTimeout(resolve, 120))
  }
}

const togglePause = () => {
  if (!running.value && !paused.value) return
  paused.value = !paused.value
  if (!paused.value) running.value = true
}

const stopScan = () => {
  abortController.value?.abort()
  abortController.value = null
  running.value = false
  paused.value = false
}

const close = () => {
  stopScan()
  dialogsStore.closeEnrollmentQuality()
  emit('close')
}

const onVisibilityChange = (open: boolean) => {
  if (!open) close()
}

const startScan = async () => {
  stopScan()
  error.value = ''
  tags.value = []
  processed.value = 0
  total.value = 0
  counters.value = {good: 0, ok: 0, weak: 0, bad: 0, none: 0}
  running.value = true
  paused.value = false
  void observeListHost()

  const controller = new AbortController()
  abortController.value = controller
  const metaId = (
    dialogsStore.enrollmentQuality.metaId
    ?? Number(settingsStore['faceMatch.performerMetaId'] || 0)
  ) || null

  try {
    await typedApi.streamEnrollmentQualityReport(
      {metaId},
      {
        signal: controller.signal,
        beforeRead: () => waitWhilePaused(controller.signal),
      },
      (event) => {
        if (event.type === 'progress') {
          processed.value = Number(event.processed || 0)
          total.value = Number(event.total || 0)
          counters.value = {
            good: Number(event.good || 0),
            ok: Number(event.ok || 0),
            weak: Number(event.weak || 0),
            bad: Number(event.bad || 0),
            none: Number(event.none || 0),
          }
        }
        if (event.type === 'tag' && event.tag) {
          tags.value.push(event.tag as QualityTag)
        }
        if (event.type === 'error') {
          throw new Error(String(event.message || 'Enrollment quality failed'))
        }
      },
    )
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      error.value = err instanceof Error ? err.message : String(err)
    }
  } finally {
    running.value = false
    paused.value = false
    abortController.value = null
  }
}

watch(() => dialogsStore.enrollmentQuality.show, (show) => {
  if (show) {
    void observeListHost()
    void startScan()
  }
})

watch([xs, visibleTags], () => {
  void observeListHost()
})

onMounted(() => {
  void observeListHost()
  if (dialogsStore.enrollmentQuality.show) void startScan()
})

onBeforeUnmount(() => {
  listResizeObserver?.disconnect()
  listResizeObserver = null
  stopScan()
})
</script>

<style scoped>
.enrollment-quality-root {
  display: flex;
  flex-direction: column;
  max-height: min(90vh, 920px);
  height: min(90vh, 920px);
  overflow: hidden;
}

.enrollment-quality-header {
  flex: 0 0 auto;
}

.enrollment-quality-toolbar {
  flex: 0 1 auto;
  max-height: 46%;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-bottom: 1px solid rgba(var(--v-theme-on-surface), 0.08);
}

.enrollment-quality-list-host {
  flex: 1 1 auto;
  min-height: 200px;
  overflow: hidden;
}

.enrollment-quality-item {
  height: 156px;
  padding: 0 2px 12px;
  box-sizing: border-box;
}

.enrollment-quality-card {
  height: 100%;
  overflow: hidden;
}

.enrollment-quality-card__chips {
  max-height: 28px;
  overflow: hidden;
}

:global(.v-dialog--fullscreen) .enrollment-quality-root {
  height: 100%;
  max-height: 100%;
}
</style>
