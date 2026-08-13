<template>
  <v-dialog
    :model-value="dialogsStore.camgirlFinder.show"
    width="880"
    scrollable
    @update:model-value="close"
  >
    <v-card rounded="xl">
      <DialogHeader
        @close="close"
        :header="t('camgirlfinder.title')"
        :subheader="t('camgirlfinder.subtitle')"
        icon="face-recognition"
        closable
      />

      <v-card-text class="py-5">
        <v-alert
          v-if="hintVisible"
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4 cgf-hint"
          closable
          @click:close="hintVisible = false"
        >
          {{ t('camgirlfinder.hint') }}
        </v-alert>

        <div class="d-flex flex-wrap ga-3 mb-4 align-start">
          <v-btn-toggle
            v-model="mode"
            mandatory
            density="comfortable"
            color="primary"
            rounded="xl"
            divided
            class="cgf-mode-toggle"
          >
            <v-btn value="face" :disabled="!cropPath && !hasFaceSearch">
              {{ t('camgirlfinder.mode_face') }}
            </v-btn>
            <v-btn value="name">
              {{ t('camgirlfinder.mode_name') }}
            </v-btn>
          </v-btn-toggle>

          <form class="cgf-search-form flex-grow-1" @submit.prevent="runSearch()">
            <v-text-field
              v-model="query"
              :disabled="searchInProgress || mode === 'face'"
              :loading="searchInProgress"
              :placeholder="t('camgirlfinder.query_placeholder')"
              append-inner-icon="mdi-magnify"
              hide-details
              density="comfortable"
              variant="outlined"
              rounded="lg"
              @click:append-inner="runSearch()"
            />
          </form>

          <v-btn
            color="primary"
            rounded="xl"
            variant="flat"
            :loading="searchInProgress"
            :disabled="!canSearch"
            @click="runSearch()"
          >
            {{ t('camgirlfinder.search') }}
          </v-btn>
        </div>

        <div
          v-if="performers.length"
          class="d-flex flex-wrap align-center justify-space-between ga-3 mb-3"
        >
          <div
            v-if="showMatchScores"
            class="cgf-legend"
            :title="t('camgirlfinder.score_legend_hint')"
          >
            <span class="cgf-legend__label">{{ t('camgirlfinder.score_legend') }}</span>
            <span
              v-for="item in scoreLegend"
              :key="item.color"
              class="cgf-legend__item"
            >
              <v-progress-circular
                :model-value="item.percent"
                :color="item.color"
                :size="16"
                :width="2.5"
                bg-color="surface-variant"
              />
              <span>{{ item.label }}</span>
            </span>
          </div>
          <v-spacer v-else/>

          <v-btn-toggle
            v-model="previewMode"
            mandatory
            density="compact"
            color="secondary"
            rounded
            divided
            class="cgf-preview-toggle"
          >
            <v-btn value="face" :title="t('camgirlfinder.preview_face')">
              <v-icon start icon="mdi-face-recognition"/>
              {{ t('camgirlfinder.preview_face') }}
            </v-btn>
            <v-btn value="scene" :title="t('camgirlfinder.preview_scene')">
              <v-icon start icon="mdi-image-area"/>
              {{ t('camgirlfinder.preview_scene') }}
            </v-btn>
          </v-btn-toggle>
        </div>

        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          {{ error }}
        </v-alert>

        <v-alert
          v-else-if="!searchInProgress && searched && !performers.length"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="mb-4"
        >
          {{ emptyMessage }}
        </v-alert>

        <v-row v-if="performers.length">
          <v-col
            v-for="item in performers"
            :key="item.id"
            cols="6"
            sm="4"
            md="3"
          >
            <v-card
              height="100%"
              variant="outlined"
              rounded="xl"
              class="cgf-card"
              @click="openTransfer(item)"
            >
              <div class="cgf-card__preview">
                <v-img
                  :src="cardImage(item)"
                  height="160"
                  cover
                >
                  <template #placeholder>
                    <div class="d-flex align-center justify-center fill-height">
                      <v-icon icon="mdi-account" size="36"/>
                    </div>
                  </template>
                </v-img>
                <v-progress-circular
                  v-if="matchConfidence(item) != null"
                  class="cgf-card__score"
                  :model-value="scorePercent(matchConfidence(item))"
                  :color="scoreColor(item)"
                  :size="34"
                  :width="3.5"
                  bg-color="surface-variant"
                  :title="scoreTooltip(item)"
                >
                  <span class="cgf-card__score-text">
                    {{ formatConfidence(matchConfidence(item)) }}
                  </span>
                </v-progress-circular>
              </div>
              <div class="pa-2 text-body-2 text-truncate">
                {{ item.name }}
              </div>
              <div class="px-2 pb-2 text-caption text-medium-emphasis d-flex align-center ga-1">
                <span v-if="item.platformLabel" class="text-truncate">{{ item.platformLabel }}</span>
              </div>
            </v-card>
          </v-col>
        </v-row>

        <v-dialog v-model="dialogDataTransfer" max-width="1000px" scrollable>
          <v-card rounded="xl">
            <DialogHeader
              @close="dialogDataTransfer = false"
              :header="t('scraper.data_transfer', {name: selected?.name || ''})"
              :buttons="transferButtons"
              closable
            />
            <v-card-text>
              <v-alert
                v-if="willCreateTag"
                type="info"
                variant="tonal"
                density="comfortable"
                rounded="lg"
                class="mb-4"
              >
                {{ t('camgirlfinder.create_tag_hint', {name: selected?.name || ''}) }}
              </v-alert>
              <v-alert
                v-else-if="!canApply"
                type="warning"
                variant="tonal"
                density="comfortable"
                rounded="lg"
                class="mb-4"
              >
                {{ t('camgirlfinder.apply_needs_tag') }}
              </v-alert>
              <ScraperDataTransfer
                v-if="selected && !willCreateTag"
                :selected="selected"
              />
              <div v-else-if="selected && willCreateTag" class="text-body-2 text-medium-emphasis mb-2">
                {{ t('camgirlfinder.create_tag_details') }}
              </div>
              <ScraperSelectImages
                v-if="selected && willCreateTag"
                :selected="selected"
                default-select-first
              />
            </v-card-text>
          </v-card>
        </v-dialog>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useNotificationsStore} from '@/stores/notifications'
import {useEventBus} from '@/utils/eventBus'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import ScraperDataTransfer from './scraper/ScraperDataTransfer.vue'
import ScraperSelectImages from './scraper/ScraperSelectImages.vue'
import {searchCamGirlFinder} from '../services/camgirlfinderApi'
import {applyCamGirlFinderPerformer} from '../services/camgirlfinderApply'
import {assignmentsFromPosterUrls} from '../utils/scraperPosters'
import type {CamGirlFinderMappedPerformer} from '../types/camgirlfinder'

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  outlined?: boolean
  action?: () => void | Promise<void>
}

const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const eventBus = useEventBus()
const {t} = useI18n()

const mode = ref<'face' | 'name'>('name')
const hintVisible = ref(true)
const previewMode = ref<'face' | 'scene'>('face')
const query = ref('')
const searchInProgress = ref(false)
const searched = ref(false)
const error = ref('')
const performers = ref<CamGirlFinderMappedPerformer[]>([])
const selected = ref<CamGirlFinderMappedPerformer | null>(null)
const dialogDataTransfer = ref(false)
const applyInProgress = ref(false)
const emptyImg = '/images/unavailable.png'

const cropPath = computed(() => String(dialogsStore.camgirlFinder.cropPath || '').trim())
const hasFaceSearch = computed(() => Boolean(cropPath.value))
const canSearch = computed(() => {
  if (searchInProgress.value) return false
  if (mode.value === 'face') return hasFaceSearch.value
  return query.value.trim().length >= 3
})
const canApply = computed(() => {
  return Boolean(
    dialogsStore.camgirlFinder.tag?.id
    && dialogsStore.camgirlFinder.meta?.id,
  ) || Boolean(dialogsStore.tagEditing.show && dialogsStore.tagEditing.tag?.id)
  || canCreateTag.value
})

const faceIds = computed(() => {
  const ids = [
    ...(dialogsStore.camgirlFinder.clusterFaceIds || []),
    dialogsStore.camgirlFinder.faceId,
  ]
  return [...new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
})

const canCreateTag = computed(() => {
  if (dialogsStore.camgirlFinder.tag?.id) return false
  if (dialogsStore.tagEditing.show && dialogsStore.tagEditing.tag?.id) return false
  const hasMeta = Boolean(
    dialogsStore.camgirlFinder.meta?.id
    || peopleMetaFallback.value?.id,
  )
  return hasMeta && Boolean(selected.value?.name)
})

const willCreateTag = computed(() => canCreateTag.value)

const peopleMetaFallback = computed(() => {
  const settingsStore = useSettingsStore()
  const configured = Number(settingsStore['faceMatch.performerMetaId'] || 0)
  if (configured) {
    const byId = (appStore.meta || []).find((meta) => Number(meta.id) === configured)
    if (byId) return byId
  }
  return (appStore.meta || []).find((meta) => meta.type === 'array' && Boolean(meta.scraper)) || null
})
const emptyMessage = computed(() => {
  if (mode.value === 'face') return t('camgirlfinder.empty_face')
  return t('camgirlfinder.empty_name')
})

const showMatchScores = computed(() =>
  performers.value.some((item) => matchConfidence(item) != null),
)

const scoreLegend = computed(() => ([
  {
    color: 'success',
    percent: 85,
    label: t('camgirlfinder.score_high'),
  },
  {
    color: 'warning',
    percent: 60,
    label: t('camgirlfinder.score_medium'),
  },
  {
    color: 'error',
    percent: 30,
    label: t('camgirlfinder.score_low'),
  },
]))

/** CGF returns distance (lower = better). Convert to 0–1 confidence like face results. */
function matchConfidence(item: CamGirlFinderMappedPerformer): number | null {
  if (item.distance == null || !Number.isFinite(Number(item.distance))) return null
  return Math.min(1, Math.max(0, 1 - Number(item.distance)))
}

function scorePercent(score: number | null | undefined) {
  if (score == null || !Number.isFinite(Number(score))) return 0
  return Math.round(Math.min(1, Math.max(0, Number(score))) * 100)
}

function scoreColor(item: CamGirlFinderMappedPerformer) {
  const probability = String(item.probability || '').trim().toLowerCase()
  if (probability === 'high') return 'success'
  if (probability === 'medium') return 'warning'
  if (probability === 'low') return 'error'

  const score = matchConfidence(item)
  if (score == null) return 'secondary'
  if (score >= 0.7) return 'success'
  if (score >= 0.55) return 'warning'
  return 'error'
}

function formatConfidence(score: number | null | undefined) {
  if (score == null || !Number.isFinite(Number(score))) return ''
  return Number(score).toFixed(2)
}

function scoreTooltip(item: CamGirlFinderMappedPerformer) {
  const name = item.name || t('camgirlfinder.unknown')
  const confidence = matchConfidence(item)
  const parts = [name]
  if (item.platformLabel) parts.push(item.platformLabel)
  if (confidence != null) parts.push(formatConfidence(confidence))
  if (item.probability) parts.push(probabilityLabel(item.probability))
  return parts.join(' · ')
}

function probabilityLabel(value: unknown) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'high') return t('camgirlfinder.probability_high')
  if (key === 'medium') return t('camgirlfinder.probability_medium')
  if (key === 'low') return t('camgirlfinder.probability_low')
  return String(value || '')
}

const transferButtons = computed((): DialogHeaderButton[] => [
  {
    icon: 'check',
    text: willCreateTag.value
      ? t('camgirlfinder.create_and_apply')
      : t('common.apply'),
    color: 'success',
    outlined: false,
    action: applySelected,
  },
])

function close() {
  dialogsStore.closeCamGirlFinder()
}

function cardImage(item: CamGirlFinderMappedPerformer) {
  if (previewMode.value === 'scene') {
    return item.fullImage || item.face || emptyImg
  }
  return item.face || item.fullImage || emptyImg
}

function openTransfer(item: CamGirlFinderMappedPerformer) {
  selected.value = item
  dialogsStore.scraper.images = []
  dialogDataTransfer.value = true
}

async function runSearch() {
  if (!canSearch.value) return

  searchInProgress.value = true
  error.value = ''
  searched.value = true

  try {
    const result = await searchCamGirlFinder(
      mode.value === 'face'
        ? {
            mode: 'face',
            cropPath: cropPath.value,
            limit: 24,
          }
        : {
            mode: 'name',
            query: query.value.trim(),
            includeSimilar: true,
            limit: 24,
          },
    )
    performers.value = result.data || []
    if (result.message && !performers.value.length) {
      error.value = result.message
    }
  } catch (err) {
    performers.value = []
    error.value = err instanceof Error ? err.message : t('camgirlfinder.search_failed')
  } finally {
    searchInProgress.value = false
  }
}

function applyErrorText(code?: string) {
  if (code === 'no_performer_meta') return t('camgirlfinder.error_no_performer_meta')
  if (code === 'missing_name') return t('camgirlfinder.error_missing_name')
  if (code === 'tag_create_failed') return t('camgirlfinder.error_tag_create_failed')
  return code || t('camgirlfinder.apply_failed')
}

async function applySelected() {
  if (!selected.value || applyInProgress.value) return

  // Prefer the open tag editor transfer path so the user controls field/image picks.
  if (dialogsStore.tagEditing.show && dialogsStore.tagEditing.tag?.id) {
    dialogsStore.scraper.images = assignmentsFromPosterUrls(
      (selected.value.posters || []).map((poster) => String(poster?.url || '')),
      4,
    )
    dialogDataTransfer.value = false
    close()
    eventBus.emit('transferScrapedInfo')
    return
  }

  const existingTag = dialogsStore.camgirlFinder.tag
  const meta = dialogsStore.camgirlFinder.meta || peopleMetaFallback.value

  if (!existingTag?.id && !willCreateTag.value) {
    notificationsStore.setNotification({
      type: 'warning',
      title: t('camgirlfinder.apply_needs_tag'),
    })
    return
  }

  applyInProgress.value = true
  try {
    const result = await applyCamGirlFinderPerformer({
      performer: selected.value,
      meta,
      tag: existingTag,
      faceIds: faceIds.value,
      imageUrls: (dialogsStore.scraper.images || []).map((item) => item.url),
      dbPath: appStore.dbPath,
    })

    if (!result.success) {
      notificationsStore.setNotification({
        type: 'error',
        title: t('camgirlfinder.apply_failed'),
        text: applyErrorText(result.error),
      })
      return
    }

    notificationsStore.setNotification({
      type: 'success',
      title: result.createdTag
        ? t('camgirlfinder.create_tag_done')
        : t('camgirlfinder.apply_done'),
      text: result.performerName || selected.value.name || '',
    })

    eventBus.emit('camgirlFinderApplied', {
      faceIds: faceIds.value,
      tagId: result.tag?.id,
      mediaId: dialogsStore.camgirlFinder.mediaId,
    })
    eventBus.emit('scraperGotImages')

    dialogDataTransfer.value = false
    close()
  } finally {
    applyInProgress.value = false
  }
}

watch(
  () => dialogsStore.camgirlFinder.show,
  (show) => {
    if (!show) return
    query.value = String(dialogsStore.camgirlFinder.query || '').trim()
    mode.value = cropPath.value ? 'face' : 'name'
    performers.value = []
    selected.value = null
    dialogDataTransfer.value = false
    error.value = ''
    searched.value = false
    if (cropPath.value || query.value.length >= 3) {
      void runSearch()
    }
  },
)

onMounted(() => {
  if (dialogsStore.camgirlFinder.show) {
    query.value = String(dialogsStore.camgirlFinder.query || '').trim()
    mode.value = cropPath.value ? 'face' : 'name'
    if (cropPath.value || query.value.length >= 3) {
      void runSearch()
    }
  }
})
</script>

<style scoped>
.cgf-hint {
  font-size: 0.75rem;
  line-height: 1.35;
}

.cgf-hint :deep(.v-alert__content) {
  font-size: inherit;
  line-height: inherit;
}

.cgf-mode-toggle {
  flex: 0 0 auto;
}

.cgf-search-form {
  min-width: 14rem;
}

.cgf-legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem 1rem;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-size: 0.75rem;
  line-height: 1.2;
}

.cgf-legend__label {
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.85);
}

.cgf-legend__item {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.cgf-preview-toggle {
  flex: 0 0 auto;
}

.cgf-card {
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.cgf-card:hover {
  border-color: rgb(var(--v-theme-primary));
}

.cgf-card__preview {
  position: relative;
}

.cgf-card__score {
  position: absolute;
  right: 8px;
  bottom: 8px;
  background: rgba(var(--v-theme-surface), 0.92);
  border-radius: 999px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
}

.cgf-card__score-text {
  font-size: 0.55rem;
  font-weight: 700;
  line-height: 1;
  color: rgba(var(--v-theme-on-surface), 0.85);
}
</style>
