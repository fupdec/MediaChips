<template>
  <v-dialog
    v-if="dialogsStore.similarWall.show"
    :model-value="dialogsStore.similarWall.show"
    @update:model-value="onDialogToggle"
    :width="xl ? 1180 : 980"
    :fullscreen="xs"
    scrollable
  >
    <v-card class="similar-wall-root">
      <DialogHeader
        :header="t('media.dialogs.similar_wall_title')"
        :subheader="headerSub"
        icon="brain"
        :buttons="headerButtons"
        closable
        @close="close"
      />

      <v-card-text class="similar-wall-body">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <v-alert
          v-else-if="!loading && emptyHint"
          type="info"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ emptyHint }}
        </v-alert>

        <div
          v-if="showHealthPanel"
          class="similar-wall-health mb-3"
        >
          <div class="similar-wall-health__title">
            <v-icon
              size="16"
              :color="healthNeedsAction ? 'warning' : 'success'"
              class="mr-1"
            >
              {{ healthNeedsAction ? 'mdi-heart-pulse' : 'mdi-check-decagram' }}
            </v-icon>
            {{ t('media.dialogs.similar_wall_health_title') }}
          </div>

          <div
            v-for="item in healthChecklist"
            :key="item.id"
            class="similar-wall-health__row"
          >
            <v-icon
              size="15"
              :color="item.ok ? 'success' : 'warning'"
            >
              {{ item.ok ? 'mdi-check-circle' : 'mdi-alert-circle-outline' }}
            </v-icon>
            <span>{{ item.text }}</span>
          </div>

          <div
            v-for="tip in healthTips"
            :key="tip.id"
            class="similar-wall-health__tip"
          >
            <v-icon
              size="14"
              color="primary"
            >
              mdi-lightbulb-outline
            </v-icon>
            <span>{{ tip.text }}</span>
          </div>

          <v-btn
            v-if="healthNeedsAction"
            class="mt-2"
            size="small"
            color="primary"
            variant="tonal"
            prepend-icon="mdi-cog-outline"
            @click="openSemanticSettings"
          >
            {{ t('globalSearch.open_semantic_settings') }}
          </v-btn>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-3"
        />

        <template v-if="seed">
          <div class="similar-wall-seed">
            <div
              class="similar-wall-seed__thumb"
              :class="{'no-file': !fileExists(seed.id)}"
              @dblclick="editSeed"
            >
              <img
                v-if="thumbUrl(seed.id)"
                :src="thumbUrl(seed.id)"
                alt=""
                draggable="false"
              >
              <div
                v-else
                class="similar-wall-thumb-fallback"
              />
              <span class="similar-wall-seed__badge">
                {{ t('media.dialogs.similar_wall_seed_badge') }}
              </span>
            </div>

            <div class="similar-wall-seed__meta">
              <div
                class="similar-wall-seed__title"
                :title="seedLabel"
              >
                {{ seedLabel }}
              </div>
              <div class="similar-wall-seed__hint">
                {{ t('media.dialogs.similar_wall_seed_hint') }}
              </div>
              <div class="similar-wall-seed__actions">
                <v-btn
                  size="small"
                  variant="tonal"
                  color="primary"
                  prepend-icon="mdi-pencil-outline"
                  @click="editSeed"
                >
                  {{ t('media.dialogs.similar_wall_edit_seed') }}
                </v-btn>
              </div>
            </div>
          </div>

          <div
            v-if="!loading && !neighbors.length && !error && !emptyHint"
            class="similar-wall-empty"
          >
            {{ t('media.dialogs.similar_wall_empty') }}
          </div>

          <div
            v-else-if="neighbors.length"
            class="similar-wall-grid"
          >
            <button
              v-for="(item, index) in neighbors"
              :key="item.id"
              type="button"
              class="similar-wall-tile"
              :title="itemLabel(item)"
              :disabled="loading"
              @click="exploreFrom(item.id)"
            >
              <div
                class="similar-wall-tile__thumb"
                :class="{'no-file': !fileExists(item.id)}"
              >
                <img
                  v-if="thumbUrl(item.id)"
                  :src="thumbUrl(item.id)"
                  alt=""
                  draggable="false"
                >
                <div
                  v-else
                  class="similar-wall-thumb-fallback"
                />
                <div class="similar-wall-tile__shade">
                  <span class="similar-wall-tile__rank">{{ index + 1 }}</span>
                  <span class="similar-wall-tile__name">{{ itemLabel(item) }}</span>
                </div>
              </div>
            </button>
          </div>
        </template>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useRouter} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {seedNeedsGridForSimilarSearch} from '@/services/similarRadio'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getCurrentMediaType, getMediaDeleteAssetFolder, isVideoMediaType} from '@/utils/mediaType'
import {loadMediaThumbUrls} from '@/utils/mediaThumbLoader'
import {useOpenMediaList} from '@/utils/openMediaList'
import type {MediaItem} from '@/types/stores'

const WALL_LIMIT = 49
const SPARSE_NEIGHBOR_THRESHOLD = 5

type ClipHealth = {
  modelStatus: string
  indexedCount: number
  previewCandidatesCount: number
  missingEmbeddingsCount: number
  seedHasEmbedding: boolean | null
}

const {t} = useI18n()
const router = useRouter()
const {xs, xl} = useDisplay()
const dialogsStore = useDialogsStore()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const {openMediaList} = useOpenMediaList()

const loading = ref(false)
const error = ref('')
const emptyHint = ref('')
const rankedIds = ref<number[]>([])
const itemsById = ref<Record<number, MediaItem>>({})
const thumbs = ref<Record<string, string>>({})
const fileExistsById = ref<Record<string, boolean>>({})
const clipHealth = ref<ClipHealth | null>(null)
const seedTileCount = ref(0)
let loadGeneration = 0

const mediaType = computed(() =>
  getCurrentMediaType(
    appStore.mediaTypes,
    dialogsStore.similarWall.mediaTypeId
      ?? itemsStore.environment?.media_type_id,
  ),
)

const isVideo = computed(() => isVideoMediaType(mediaType.value))

const seedNeedsGrids = computed(() =>
  isVideo.value && seedNeedsGridForSimilarSearch(seedTileCount.value),
)

const canPlayRadio = computed(() =>
  isVideo.value
  && Boolean(seed.value?.path)
  && rankedIds.value.length > 1
  && !emptyHint.value
)

const seed = computed(() => {
  const id = Number(dialogsStore.similarWall.seedId)
  if (!Number.isFinite(id) || id <= 0) return null
  return itemsById.value[id] || null
})

const seedLabel = computed(() => {
  const item = seed.value
  if (!item) return dialogsStore.similarWall.seedId
    ? `#${dialogsStore.similarWall.seedId}`
    : ''
  return itemLabel(item)
})

const neighbors = computed(() => {
  const seedId = Number(dialogsStore.similarWall.seedId)
  return rankedIds.value
    .filter((id) => id !== seedId)
    .map((id) => itemsById.value[id])
    .filter((item): item is MediaItem => Boolean(item))
})

const modelReady = computed(() =>
  ['downloaded', 'loaded', 'ready'].includes(String(clipHealth.value?.modelStatus || '')),
)

const hasPreviews = computed(() =>
  Number(clipHealth.value?.previewCandidatesCount || 0) > 0,
)

const hasIndex = computed(() =>
  Number(clipHealth.value?.indexedCount || 0) > 0,
)

const pendingCount = computed(() =>
  Math.max(0, Number(clipHealth.value?.missingEmbeddingsCount || 0)),
)

const seedHasEmbedding = computed(() => clipHealth.value?.seedHasEmbedding === true)

const healthChecklist = computed(() => {
  const health = clipHealth.value
  if (!health) return []
  const modelStatus = String(health.modelStatus || '')
  const modelOk = modelReady.value
  const modelText = modelOk
    ? t('globalSearch.health_model_ok')
    : modelStatus === 'error'
      ? t('globalSearch.health_model_error')
      : modelStatus === 'loading'
        ? t('globalSearch.health_model_loading')
        : t('globalSearch.health_model_missing')

  return [
    {
      id: 'model',
      ok: modelOk,
      text: modelText,
    },
    {
      id: 'previews',
      ok: hasPreviews.value,
      text: hasPreviews.value
        ? t('globalSearch.health_previews_ok', {count: health.previewCandidatesCount})
        : t('globalSearch.health_previews_missing'),
    },
    {
      id: 'index',
      ok: hasIndex.value && pendingCount.value === 0,
      text: hasIndex.value
        ? pendingCount.value > 0
          ? t('media.dialogs.similar_wall_health_index_partial', {
            count: health.indexedCount,
            pending: pendingCount.value,
          })
          : t('globalSearch.health_index_ok', {count: health.indexedCount})
        : t('globalSearch.health_index_missing', {pending: pendingCount.value}),
    },
    {
      id: 'seed',
      ok: seedHasEmbedding.value,
      text: seedHasEmbedding.value
        ? t('media.dialogs.similar_wall_health_seed_ok')
        : t('media.dialogs.similar_wall_health_seed_missing'),
    },
  ]
})

const healthTips = computed(() => {
  const tips: Array<{id: string; text: string}> = []
  if (!clipHealth.value || loading.value) return tips

  if (!modelReady.value) {
    tips.push({id: 'model', text: t('globalSearch.health_hint_model')})
  } else if (!hasPreviews.value) {
    tips.push({id: 'previews', text: t('globalSearch.health_hint_previews')})
  } else if (!hasIndex.value) {
    tips.push({id: 'index', text: t('globalSearch.health_hint_index')})
  } else if (!seedHasEmbedding.value) {
    tips.push({id: 'seed', text: t('media.dialogs.similar_wall_health_tip_seed')})
  }

  if (pendingCount.value > 0 && hasIndex.value) {
    tips.push({
      id: 'pending',
      text: t('media.dialogs.similar_wall_health_tip_pending', {pending: pendingCount.value}),
    })
  }

  if (
    seedHasEmbedding.value
    && neighbors.value.length > 0
    && neighbors.value.length < SPARSE_NEIGHBOR_THRESHOLD
  ) {
    tips.push({
      id: 'sparse',
      text: t('media.dialogs.similar_wall_health_tip_sparse', {count: neighbors.value.length}),
    })
  }

  if (seedHasEmbedding.value && seedNeedsGrids.value) {
    tips.push({
      id: 'grids',
      text: t('media.dialogs.similar_wall_health_tip_grids'),
    })
  }

  return tips
})

const healthNeedsAction = computed(() =>
  Boolean(clipHealth.value)
  && (
    !modelReady.value
    || !hasPreviews.value
    || !hasIndex.value
    || !seedHasEmbedding.value
    || pendingCount.value > 0
    || seedNeedsGrids.value
  ),
)

const showHealthPanel = computed(() =>
  Boolean(clipHealth.value)
  && !loading.value
  && (
    healthNeedsAction.value
    || Boolean(emptyHint.value)
    || seedNeedsGrids.value
    || (neighbors.value.length > 0 && neighbors.value.length < SPARSE_NEIGHBOR_THRESHOLD)
  ),
)

const headerSub = computed(() => {
  if (loading.value) return t('media.dialogs.similar_wall_loading')
  if (!neighbors.value.length) return seedLabel.value || ''
  return t('media.dialogs.similar_wall_count', {count: neighbors.value.length})
})

const headerButtons = computed(() => [
  {
    icon: 'radio-tower',
    text: t('media.dialogs.similar_wall_play_radio'),
    color: 'primary',
    outlined: true,
    disabled: loading.value || !canPlayRadio.value,
    order: 0,
    action: () => { void playAsRadio() },
  },
  {
    icon: 'view-grid-outline',
    text: t('media.dialogs.similar_wall_open_list'),
    color: 'primary',
    outlined: false,
    disabled: loading.value || rankedIds.value.length <= 1,
    order: 1,
    action: () => { void openAsList() },
  },
])

function itemLabel(item: MediaItem) {
  return item.name || item.basename || `#${item.id}`
}

function thumbUrl(id: number | string) {
  return thumbs.value[String(id)] || ''
}

function fileExists(id: number | string) {
  return fileExistsById.value[String(id)] !== false
}

function close() {
  dialogsStore.closeSimilarWall()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

function exploreFrom(id: number | string) {
  const nextId = Number(id)
  if (!Number.isFinite(nextId) || nextId <= 0) return
  if (nextId === Number(dialogsStore.similarWall.seedId)) return
  dialogsStore.setSimilarWallSeed(nextId)
}

function editSeed() {
  if (!seed.value) return
  dialogsStore.editMedia(seed.value, mediaType.value)
}

function openSemanticSettings() {
  close()
  void router.push({
    path: '/settings',
    query: {tab: 'database', section: 'clip_embedding_backfill'},
  })
}

async function refreshClipHealth(partial?: Partial<ClipHealth>) {
  const previous = clipHealth.value
  try {
    const backfillRes = await typedApi.getBackfillStatus('clipEmbedding')
    clipHealth.value = {
      modelStatus: String(
        backfillRes.data?.modelStatus
        || previous?.modelStatus
        || 'unknown',
      ),
      indexedCount: Number(backfillRes.data?.hashed ?? previous?.indexedCount ?? 0),
      previewCandidatesCount: Number(backfillRes.data?.total ?? previous?.previewCandidatesCount ?? 0),
      missingEmbeddingsCount: Number(backfillRes.data?.pending ?? previous?.missingEmbeddingsCount ?? 0),
      seedHasEmbedding: partial?.seedHasEmbedding ?? previous?.seedHasEmbedding ?? null,
      ...partial,
    }
  } catch (err) {
    console.error(err)
    clipHealth.value = {
      modelStatus: previous?.modelStatus || 'error',
      indexedCount: previous?.indexedCount ?? 0,
      previewCandidatesCount: previous?.previewCandidatesCount ?? 0,
      missingEmbeddingsCount: previous?.missingEmbeddingsCount ?? 0,
      seedHasEmbedding: partial?.seedHasEmbedding ?? previous?.seedHasEmbedding ?? null,
      ...partial,
    }
  }
}

async function openAsList() {
  const ids = rankedIds.value.length
    ? rankedIds.value
    : (dialogsStore.similarWall.seedId ? [Number(dialogsStore.similarWall.seedId)] : [])
  if (ids.length <= 1) return
  const mediaTypeId = mediaType.value?.id
    ?? dialogsStore.similarWall.mediaTypeId
    ?? undefined
  close()
  await openMediaList({
    mediaTypeId: mediaTypeId != null ? Number(mediaTypeId) : undefined,
    ids,
    scope: {kind: 'clipSimilar'},
  })
}

async function playAsRadio() {
  if (!canPlayRadio.value || !seed.value) return
  const {startSimilarRadio} = await import('@/services/similarRadio')
  close()
  await startSimilarRadio(seed.value, {
    initialNeighborIds: rankedIds.value,
  })
}

async function loadBasicsByIds(ids: number[]): Promise<MediaItem[]> {
  if (!ids.length) return []
  const res = await typedApi.getMediaBasics({ids})
  return Array.isArray(res.data?.items) ? (res.data.items as MediaItem[]) : []
}

async function loadThumbsForItems(items: MediaItem[]) {
  const folder = getMediaDeleteAssetFolder(mediaType.value)
  if (!folder || !appStore.mediaPath) {
    thumbs.value = {}
    return
  }
  const map = await loadMediaThumbUrls(
    appStore.mediaPath,
    folder,
    items.map((item) => item.id),
  )
  const next: Record<string, string> = {}
  for (const [id, url] of Object.entries(map)) {
    next[String(id)] = url
  }
  thumbs.value = next
}

async function checkFilesForItems(items: MediaItem[]) {
  const results = await Promise.all(
    items.map(async (item) => {
      const path = String(item.path || '')
      if (!path) return [String(item.id), false] as const
      try {
        const exists = await checkPathExists(path)
        return [String(item.id), Boolean(exists)] as const
      } catch {
        return [String(item.id), true] as const
      }
    }),
  )
  const next: Record<string, boolean> = {}
  for (const [id, exists] of results) next[id] = exists
  fileExistsById.value = next
}

async function reload() {
  const seedId = Number(dialogsStore.similarWall.seedId)
  if (!Number.isFinite(seedId) || seedId <= 0) return

  const generation = ++loadGeneration
  loading.value = true
  error.value = ''
  emptyHint.value = ''
  seedTileCount.value = 0

  try {
    const [response] = await Promise.all([
      typedApi.similarByClip({seedId, limit: WALL_LIMIT}),
      refreshClipHealth(),
    ])
    if (generation !== loadGeneration) return
    const data = response.data
    const hasEmbedding = Boolean(data?.hasEmbedding)
    seedTileCount.value = Math.max(0, Number(data?.seedTileCount) || 0)

    await refreshClipHealth({seedHasEmbedding: hasEmbedding})
    if (generation !== loadGeneration) return

    if (!hasEmbedding) {
      rankedIds.value = [seedId]
      emptyHint.value = t('context_menu.semantically_similar_no_embedding')
      const basics = await loadBasicsByIds([seedId])
      if (generation !== loadGeneration) return
      itemsById.value = Object.fromEntries(
        basics.map((item) => [Number(item.id), item]),
      )
      await Promise.all([
        loadThumbsForItems(basics),
        checkFilesForItems(basics),
      ])
      return
    }

    const ids = Array.isArray(data.ids)
      ? data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
      : []
    const uniqueIds = [...new Set(ids.length ? ids : [seedId])]
    rankedIds.value = uniqueIds

    if (uniqueIds.length <= 1) {
      emptyHint.value = seedNeedsGridForSimilarSearch(seedTileCount.value)
        ? t('player.similar_radio_needs_grids')
        : t('context_menu.semantically_similar_none')
    }

    const basics = await loadBasicsByIds(uniqueIds)
    if (generation !== loadGeneration) return
    const byId: Record<number, MediaItem> = {}
    for (const item of basics) {
      byId[Number(item.id)] = item
    }
    itemsById.value = byId

    await Promise.all([
      loadThumbsForItems(basics),
      checkFilesForItems(basics),
    ])
  } catch (err) {
    if (generation !== loadGeneration) return
    console.error('Similar wall failed:', err)
    error.value = t('context_menu.semantically_similar_failed')
    rankedIds.value = []
    itemsById.value = {}
    await refreshClipHealth({seedHasEmbedding: null})
  } finally {
    if (generation === loadGeneration) loading.value = false
  }
}

watch(
  () => [dialogsStore.similarWall.show, dialogsStore.similarWall.seedId] as const,
  ([show, seedId]) => {
    if (!show || seedId == null) return
    void reload()
  },
  {immediate: true},
)
</script>

<style scoped lang="scss">
.similar-wall-root {
  overflow: hidden;
}

.similar-wall-body {
  padding: 8px 16px 16px !important;
  max-height: min(78vh, 820px);
  overflow: auto;
}

.similar-wall-health {
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(var(--v-theme-warning), 0.28);
  background: rgba(var(--v-theme-warning), 0.07);
}

.similar-wall-health__title {
  display: flex;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.01em;
}

.similar-wall-health__row,
.similar-wall-health__tip {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 5px;
  font-size: 0.74rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.78);
}

.similar-wall-health__tip {
  color: rgba(var(--v-theme-on-surface), 0.68);
}

.similar-wall-seed {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 14px;
  align-items: center;
  margin-bottom: 14px;
  padding: 10px;
  border-radius: 14px;
  background:
    linear-gradient(
      135deg,
      rgba(var(--v-theme-primary), 0.08),
      rgba(var(--v-theme-on-surface), 0.03) 55%
    );
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
}

.similar-wall-seed__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  cursor: pointer;

  &.no-file {
    opacity: 0.55;
  }

  :deep(.v-img),
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
}

.similar-wall-seed__badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 2;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.similar-wall-seed__meta {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.similar-wall-seed__title {
  font-size: 0.98rem;
  font-weight: 600;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.similar-wall-seed__hint {
  font-size: 0.78rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), 0.58);
}

.similar-wall-seed__actions {
  margin-top: 2px;
}

.similar-wall-empty {
  padding: 40px 12px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-size: 0.9rem;
}

.similar-wall-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 10px;
}

.similar-wall-tile {
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 12px;
  cursor: pointer;
  color: inherit;
  text-align: left;

  &:disabled {
    opacity: 0.55;
    cursor: wait;
  }

  &:hover:not(:disabled) .similar-wall-tile__thumb {
    transform: translateY(-2px);
    box-shadow:
      0 0 0 2px rgba(var(--v-theme-primary), 0.55),
      0 12px 28px rgba(0, 0, 0, 0.16);
  }

  &:hover:not(:disabled) .similar-wall-tile__shade {
    opacity: 1;
  }

  &:focus-visible .similar-wall-tile__thumb {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }
}

.similar-wall-tile__thumb {
  position: relative;
  aspect-ratio: 16 / 9;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
  transition: transform 0.16s ease, box-shadow 0.16s ease;

  &.no-file {
    opacity: 0.55;
  }

  :deep(.v-img),
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    pointer-events: none;
  }
}

.similar-wall-tile__shade {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.45) 0%,
    transparent 38%,
    transparent 55%,
    rgba(0, 0, 0, 0.72) 100%
  );
  opacity: 0.92;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.similar-wall-tile__rank {
  align-self: flex-start;
  min-width: 1.35rem;
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.65rem;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(4px);
}

.similar-wall-tile__name {
  font-size: 0.7rem;
  font-weight: 600;
  line-height: 1.25;
  color: #fff;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
}

.similar-wall-thumb-fallback {
  width: 100%;
  height: 100%;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

@media (max-width: 700px) {
  .similar-wall-seed {
    grid-template-columns: 1fr;
  }

  .similar-wall-seed__thumb {
    max-width: 280px;
  }

  .similar-wall-grid {
    grid-template-columns: repeat(auto-fill, minmax(132px, 1fr));
  }
}
</style>
