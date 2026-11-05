<template>
  <v-dialog
    :model-value="dialogsStore.duplicateReview.show"
    @update:model-value="onDialogToggle"
    width="960"
    scrollable
    persistent
  >
    <v-card
      v-if="dialogsStore.duplicateReview.show"
      class="dup-review-root"
    >
      <DialogHeader
        :header="t('media.dialogs.duplicate_review_title')"
        :subheader="headerSub"
        icon="content-duplicate"
        :buttons="headerButtons"
        closable
        @close="close"
      />

      <v-card-text class="pa-4 pt-2">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <v-alert v-if="isSimilarity" type="info" variant="tonal" density="compact" class="mb-3 text-caption">
          {{ t('duplicateSimilarity.reviewHint', {threshold: policy.threshold}) }}
        </v-alert>

        <div
          v-if="loading"
          class="dup-review-loading py-8"
        >
          <v-progress-linear
            indeterminate
            color="primary"
            class="mb-3"
          />
          <div class="text-medium-emphasis text-body-2 text-center">
            {{ t('media.dialogs.duplicate_review_loading') }}
          </div>
        </div>

        <div
          v-else-if="!error && !visibleGroups.length"
          class="text-medium-emphasis text-body-2 py-6 text-center"
        >
          {{ t('media.dialogs.duplicate_review_empty') }}
        </div>

        <v-virtual-scroll
          v-else-if="visibleGroups.length"
          :items="visibleGroups"
          :item-height="GROUP_HEIGHT"
          :height="listHeight"
          class="dup-review-list"
        >
          <template #default="{ item: group }">
            <div class="dup-review-group">
              <div class="d-flex align-center flex-wrap ga-2 dup-review-group__header">
                <div class="text-body-2 font-weight-medium">
                  {{ t('media.dialogs.duplicate_review_group_items', {count: group.items.length}) }}
                </div>
                <v-chip
                  v-if="group.survivorId != null"
                  size="x-small"
                  color="primary"
                  variant="tonal"
                >
                  {{ t('media.dialogs.duplicate_review_suggested') }}
                  <template v-if="group.suggestedId != null && group.survivorId !== group.suggestedId">
                    → #{{ group.survivorId }}
                  </template>
                </v-chip>
                <v-chip v-if="group.confidence" size="x-small" :color="group.confidence === 'possible' ? 'warning' : 'success'">
                  {{ t(`media.dialogs.visual_match_${group.confidence}`) }}
                </v-chip>
                <v-spacer/>
                <v-btn
                  size="small"
                  variant="text"
                  :disabled="merging"
                  @click="skipGroup(group.key)"
                >
                  {{ t('media.dialogs.duplicate_review_skip') }}
                </v-btn>
                <v-btn
                  size="small"
                  color="primary"
                  variant="tonal"
                  :disabled="!canMergeGroup(group) || merging"
                  v-if="!isSimilarity"
                  @click="mergeSuggested(group)"
                >
                  {{ t('media.dialogs.duplicate_review_merge_suggested') }}
                </v-btn>
                <v-btn
                  size="small"
                  color="primary"
                  variant="flat"
                  :disabled="group.items.length < 2 || merging || (isSimilarity && !canMergeGroup(group))"
                  @click="isSimilarity ? mergeSuggested(group) : openMergeDialog(group)"
                >
                  {{ t('media.dialogs.duplicate_review_merge') }}
                </v-btn>
              </div>

              <div v-if="isSimilarity" class="d-flex align-center flex-wrap ga-3 my-2">
                <v-select v-model="group.fileAction" :items="groupFileActions" :label="t('duplicateSimilarity.otherFiles')"
                  density="compact" variant="outlined" hide-details :disabled="merging" style="max-width: 280px" />
                <v-select v-if="group.fileAction === 'selected'" v-model="group.keepIds" multiple chips
                  :items="group.items.filter(item => Number(item.id) !== group.survivorId).map(item => ({value: Number(item.id), title: item.basename || item.name || item.path}))"
                  :label="t('duplicateSimilarity.keepSelected')" density="compact" variant="outlined" hide-details :disabled="merging" style="max-width: 400px" />
                <span v-if="isSimilarity && !canMergeGroup(group)" class="text-caption text-warning">{{ t('duplicateSimilarity.originalMismatch') }}</span>
              </div>

              <div class="dup-review-cards">
                <button
                  v-for="media in group.items"
                  :key="media.id"
                  type="button"
                  class="dup-review-card"
                  :class="{
                    'dup-review-card--survivor': Number(media.id) === group.survivorId,
                    'dup-review-card--favorite': Boolean(media.favorite),
                  }"
                  :disabled="merging"
                  @click="pickSurvivor(group.key, Number(media.id))"
                >
                  <div
                    class="dup-review-thumb"
                    :class="{ 'no-file': !fileExists(media.id) }"
                  >
                    <ItemPreviewVideo
                      v-if="isVideo"
                      :media="media"
                      :is-file-exists="fileExists(media.id)"
                      preview-host="compact"
                      :thumb-url="thumbUrl(media.id) || undefined"
                    />
                    <template v-else>
                      <img
                        v-if="thumbUrl(media.id)"
                        :src="thumbUrl(media.id)"
                        alt=""
                      >
                      <div
                        v-else
                        class="dup-review-thumb-fallback"
                      />
                    </template>
                    <div
                      v-if="Number(media.id) === group.survivorId"
                      class="dup-review-keep-badge"
                    >
                      {{ t('media.dialogs.duplicate_review_keep') }}
                    </div>
                  </div>
                  <div class="dup-review-meta">
                    <div class="text-caption font-weight-medium text-truncate">
                      {{ media.name || media.basename || `#${media.id}` }}
                    </div>
                    <div class="text-caption text-medium-emphasis text-truncate">
                      {{ media.path || '' }}
                    </div>
                    <div class="text-caption text-medium-emphasis">
                      {{ formatMeta(media) }}
                    </div>
                    <div class="text-caption dup-review-reasons" :title="matchReasons(group, Number(media.id)).join('; ')">
                      {{ matchReasons(group, Number(media.id)).join('; ') }}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          </template>
        </v-virtual-scroll>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {useSettingsStore} from '@/stores/settings'
import {parseDuplicatePolicy, compareSimilarity, pickSimilarityOriginal, SIMILARITY_SIGNALS, type SimilarityItem, type SimilarityEvidence} from '@shared/duplicateSimilarity'
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import ItemPreviewVideo from '@/components/items/ItemPreviewVideo.vue'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useAppStore} from '@/stores/app'
import {useNotificationsStore} from '@/stores/notifications'
import {typedApi} from '@/services/typedApi'
import {checkFileExists as checkPathExists} from '@/services/fileService'
import {getReadableFileSize} from '@/services/formatUtils'
import {getCurrentMediaType, getMediaDeleteAssetFolder, isVideoMediaType} from '@/utils/mediaType'
import {
  getDuplicatesGroupKey,
  getDuplicatesModeLabelKey,
} from '@/utils/mediaSortFilter'
import {loadMediaThumbUrls} from '@/utils/mediaThumbLoader'
import {pickDefaultSurvivorId} from '@shared/mediaMerge'
import {getErrorResponseData} from '@/types/vue'
import {useItemsListSync} from '@/composable/itemsListSync'
import type {MediaDuplicateGroupsResult} from '@shared/api/responses'
import type {MediaItem} from '@/types/stores'

const GROUP_HEIGHT = 360
const BASICS_CHUNK = 200

type ReviewGroup = {
  key: string
  fileAction: 'keep' | 'delete' | 'selected'
  keepIds: number[]
  similarityItems?: SimilarityItem[]
  similarity?: SimilarityEvidence[]
  confidence?: 'confident' | 'possible'
  matches?: MediaDuplicateGroupsResult['groups'][number]['matches']
  items: MediaItem[]
  suggestedId: number | null
  survivorId: number | null
}

const {t} = useI18n()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const appStore = useAppStore()
const notificationsStore = useNotificationsStore()
const listSync = useItemsListSync()

const loading = ref(false)
const merging = ref(false)
const policy = computed(() => parseDuplicatePolicy(useSettingsStore().duplicateSimilarityPolicy))
const isSimilarity = computed(() => duplicatesBy.value === 'similarity')
const groupFileActions = computed(() => ['keep', 'selected', 'delete'].map(value => ({value, title: t(`duplicateSimilarity.${value}`)})))
const error = ref('')
const groups = ref<ReviewGroup[]>([])
const skippedKeys = ref<Set<string>>(new Set())
const thumbs = ref<Record<string, string>>({})
const fileExistsById = ref<Record<string, boolean>>({})

const mediaType = computed(() =>
  getCurrentMediaType(
    appStore.mediaTypes,
    dialogsStore.duplicateReview.mediaTypeId
      ?? itemsStore.environment?.media_type_id,
  ),
)

const isVideo = computed(() => isVideoMediaType(mediaType.value))

const duplicatesBy = computed(() =>
  getDuplicatesGroupKey(
    mediaType.value,
    dialogsStore.duplicateReview.duplicatesBy ?? itemsStore.duplicates_by,
  ),
)

const modeLabel = computed(() =>
  t(getDuplicatesModeLabelKey(mediaType.value, duplicatesBy.value)),
)

const visibleGroups = computed(() =>
  groups.value.filter((group) => !skippedKeys.value.has(group.key)),
)

const headerSub = computed(() => {
  if (loading.value) {
    return t('media.dialogs.duplicate_review_loading')
  }
  return `${modeLabel.value} · ${t('media.dialogs.duplicate_review_groups_count', {
    count: visibleGroups.value.length,
  })}`
})

const headerButtons = computed(() => [
  {
    icon: 'set-merge',
    text: t('media.dialogs.duplicate_review_merge_all'),
    color: 'primary',
    outlined: false,
    disabled: loading.value || merging.value || !visibleGroups.value.some(group => group.confidence !== 'possible'),
    order: 1,
    action: () => { void mergeAllSuggested(false) },
  },
  {
    icon: 'refresh',
    text: t('media.dialogs.duplicate_review_refresh'),
    color: 'secondary',
    outlined: true,
    disabled: loading.value || merging.value,
    order: 2,
    action: () => { void reload() },
  },
])

const listHeight = computed(() =>
  Math.min(560, Math.max(240, visibleGroups.value.length * GROUP_HEIGHT)),
)

function formatMeta(item: MediaItem) {
  const parts: string[] = []
  parts.push(getReadableFileSize(Number(item.filesize || 0)))
  const width = Number(item.width || 0)
  const height = Number(item.height || 0)
  if (width > 0 && height > 0) parts.push(`${width}×${height}`)
  if (item.rating != null) parts.push(`★ ${item.rating}`)
  if (item.views != null) parts.push(`${item.views}`)
  return parts.join(' · ')
}

function similarityEvidence(group: ReviewGroup): SimilarityEvidence[] {
  const original = group.similarityItems?.find(item => item.id === group.survivorId)
  return original ? group.similarityItems!.filter(item => item.id !== original.id).map(item => compareSimilarity(original, item, policy.value)) : []
}
function canMergeGroup(group: ReviewGroup) {
  return group.confidence !== 'possible' && group.items.length >= 2 && group.survivorId != null
    && (!isSimilarity.value || similarityEvidence(group).length === group.items.length - 1 && similarityEvidence(group).every(match => match.eligible))
}
function filesToDelete(group: ReviewGroup): number[] {
  return group.items.map(item => Number(item.id)).filter(id => id !== group.survivorId &&
    (group.fileAction === 'delete' || group.fileAction === 'selected' && !group.keepIds.includes(id)))
}
function matchReasons(group: ReviewGroup, mediaId: number): string[] {
  if (isSimilarity.value) {
    if (mediaId === group.survivorId) return [t('duplicateSimilarity.original')]
    const match = similarityEvidence(group).find(match => match.ids[1] === mediaId)
    if (!match) return []
    return [t('duplicateSimilarity.score', {score: match.score}), ...SIMILARITY_SIGNALS.filter(key => policy.value.weights[key] > 0).map(key =>
      `${t(`duplicateSimilarity.${key}`)}: ${match.signals[key] == null ? t('duplicateSimilarity.unchecked') : key === 'visual' ? `${Math.round(match.signals[key]!)}%` : t(match.signals[key] === 100 ? 'duplicateSimilarity.match' : 'duplicateSimilarity.noMatch')}`)]
  }
  return (group.matches || []).filter(match => match.ids.includes(mediaId)).map(match => {
    const otherId = match.ids.find(id => id !== mediaId)
    return t(`media.dialogs.visual_match_reason_${match.reason}`, {
      id: otherId, count: match.matchingTiles, thumbnailId: match.thumbnailId, frame: match.frameIndex,
    })
  })
}

function thumbUrl(id: number | string) {
  return thumbs.value[String(id)] || ''
}

function fileExists(id: number | string) {
  const key = String(id)
  return fileExistsById.value[key] !== false
}

function close() {
  if (loading.value || merging.value) return
  dialogsStore.closeDuplicateReview()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

function skipGroup(key: string) {
  const next = new Set(skippedKeys.value)
  next.add(key)
  skippedKeys.value = next
}

function pickSurvivor(groupKey: string, mediaId: number) {
  groups.value = groups.value.map((group) =>
    group.key === groupKey ? {...group, survivorId: mediaId} : group,
  )
}

function openMergeDialog(group: ReviewGroup) {
  if (group.items.length < 2) return
  merging.value = true
  const ordered = [...group.items].sort((a, b) => {
    if (Number(a.id) === group.survivorId) return -1
    if (Number(b.id) === group.survivorId) return 1
    return 0
  })
  dialogsStore.openMediaMerge(ordered, group.survivorId)
}

async function mergeGroupItems(group: ReviewGroup) {
  const survivorId = Number(group.survivorId)
  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new Error('survivorId is required')
  }
  const sourceIds = group.items
    .map((item) => Number(item.id))
    .filter((id) => id !== survivorId)
  if (sourceIds.length < 1) return null

  const res = await typedApi.mergeMedia({
    survivorId,
    sourceIds,
    similarity: isSimilarity.value,
    deleteSourceIds: filesToDelete(group),
    confirmFileDeletion: filesToDelete(group).length > 0,
  })

  if (res.data.fileWarnings?.length) notificationsStore.setNotification({type: 'warning', title: t('duplicateSimilarity.filesRetained'), text: res.data.fileWarnings.join('\n')})
  listSync.removeEntitiesFromState({
    ids: res.data.deletedIds || sourceIds,
    type: 'media',
  })
  listSync.getItemsFromDb({
    ids: [Number(res.data.survivor.id)],
    type: 'media',
  })
  return res.data
}

async function mergeSuggested(group: ReviewGroup) {
  if (!canMergeGroup(group) || merging.value) return

  const runMerge = async () => {
    merging.value = true
    error.value = ''
    try {
      await mergeGroupItems(group)
      await reload()
      notificationsStore.setNotification({
        type: 'success',
        title: t('media.dialogs.merge_media_done'),
        text: t('media.dialogs.merge_media_done_text', {
          name: group.items.find((item) => Number(item.id) === group.survivorId)?.name
            || `#${group.survivorId}`,
          count: group.items.length - 1,
        }),
      })
    } catch (err) {
      console.error(err)
      error.value = getErrorResponseData<{message?: string}>(err)?.message
        || (err instanceof Error ? err.message : String(err))
      notificationsStore.setNotification({
        type: 'error',
        title: t('media.dialogs.merge_media_failed'),
        text: error.value,
      })
    } finally {
      merging.value = false
    }
  }

  dialogsStore.confirm.text = t('duplicateSimilarity.mergeConfirm', {count: group.items.length - 1})
    + (filesToDelete(group).length ? ' ' + t('duplicateSimilarity.deleteConfirm', {count: filesToDelete(group).length}) : ' ' + t('duplicateSimilarity.keepConfirm'))
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.action = () => {
    void runMerge()
  }
  dialogsStore.confirm.show = true
}

async function mergeAllSuggested(automatic = false) {
  const pending = visibleGroups.value.filter((group) =>
    canMergeGroup(group) && (!automatic || filesToDelete(group).length === 0),
  )
  if (!pending.length || merging.value) return

  dialogsStore.confirm.text = t('media.dialogs.duplicate_review_merge_all_confirm', {
    count: pending.length,
  })
  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2Text = ''
  const run = async () => {
    merging.value = true
    error.value = ''
    let merged = 0
    let failed = 0
    try {
      for (const group of pending) {
        try {
          await mergeGroupItems(group)
          skipGroup(group.key)
          merged += 1
        } catch (err) {
          console.error(err)
          failed += 1
        }
      }
      notificationsStore.setNotification({
        type: failed ? 'warning' : 'success',
        title: failed
          ? t('media.dialogs.duplicate_review_bulk_failed')
          : t('media.dialogs.duplicate_review_bulk_done', {count: merged}),
        text: failed
          ? t('media.dialogs.duplicate_review_bulk_done', {count: merged})
          : undefined,
      })
      await reload()
      if (failed) {
        error.value = t('media.dialogs.duplicate_review_bulk_failed')
      }
    } finally {
      merging.value = false
    }
  }
  if (automatic) await run()
  else {
    const deleteCount = pending.reduce((sum, group) => sum + filesToDelete(group).length, 0)
    if (deleteCount) dialogsStore.confirm.text += ' ' + t('duplicateSimilarity.deleteConfirm', {count: deleteCount})
    dialogsStore.confirm.action = run
    dialogsStore.confirm.show = true
  }
}

async function loadBasicsByIds(ids: number[]): Promise<MediaItem[]> {
  const items: MediaItem[] = []
  for (let i = 0; i < ids.length; i += BASICS_CHUNK) {
    const chunk = ids.slice(i, i + BASICS_CHUNK)
    const res = await typedApi.getMediaBasics({ids: chunk})
    const rows = Array.isArray(res.data?.items) ? res.data.items : []
    items.push(...(rows as MediaItem[]))
  }
  return items
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
      const id = String(item.id)
      const path = String(item.path || '')
      if (!path) return [id, false] as const
      try {
        return [id, await checkPathExists(path)] as const
      } catch {
        return [id, false] as const
      }
    }),
  )
  const next: Record<string, boolean> = {}
  for (const [id, exists] of results) {
    next[id] = exists
  }
  fileExistsById.value = next
}

async function reload(automatic = false) {
  loading.value = true
  error.value = ''
  try {
    const mediaTypeId = Number(
      dialogsStore.duplicateReview.mediaTypeId
        ?? itemsStore.environment?.media_type_id,
    )
    const res = await typedApi.getMediaDuplicateGroups({
      duplicates_by: duplicatesBy.value,
      mediaTypeId: Number.isFinite(mediaTypeId) && mediaTypeId > 0 ? mediaTypeId : null,
      mediaIds: dialogsStore.duplicateReview.mediaIds,
      filters: dialogsStore.duplicateReview.filters ?? undefined,
      filtersJoin: dialogsStore.duplicateReview.filtersJoin ?? undefined,
    })
    const rawGroups = Array.isArray(res.data?.groups) ? res.data.groups : []
    const allIds = [...new Set(rawGroups.flatMap((group) => group.itemIds.map(Number)))]
    const basics = await loadBasicsByIds(allIds)
    const byId = new Map(basics.map((item) => [Number(item.id), item]))

    groups.value = rawGroups
      .map((group) => {
        const items = group.itemIds
          .map((id) => byId.get(Number(id)))
          .filter((item): item is MediaItem => Boolean(item))
        const suggestedId = isSimilarity.value ? group.originalId || pickSimilarityOriginal(group.similarityItems || [], policy.value.priority) : pickDefaultSurvivorId(items)
        return {
          key: String(group.key),
          fileAction: (isSimilarity.value ? policy.value.files : 'keep') as ReviewGroup['fileAction'],
          keepIds: items.map(item => Number(item.id)),
          similarityItems: group.similarityItems,
          similarity: group.similarity,
          confidence: group.confidence,
          matches: group.matches,
          items,
          suggestedId,
          survivorId: suggestedId,
        }
      })
      .filter((group) => group.items.length >= 2)

    const flatItems = groups.value.flatMap((group) => group.items)
    await Promise.all([
      loadThumbsForItems(flatItems),
      checkFilesForItems(flatItems),
    ])
  } catch (err) {
    console.error(err)
    groups.value = []
    thumbs.value = {}
    fileExistsById.value = {}
    const message = getErrorResponseData<{message?: string}>(err)?.message || (err instanceof Error ? err.message : String(err))
    error.value = message === 'similarity_scope_too_large' ? t('duplicateSimilarity.scopeTooLarge') : message === 'similarity_threshold_not_met' ? t('duplicateSimilarity.thresholdFailed') : message
  } finally {
    loading.value = false
  }
  if (automatic && isSimilarity.value && policy.value.autoMerge && policy.value.files === 'keep') await mergeAllSuggested(true)
}

watch(
  () => dialogsStore.duplicateReview.show,
  (show) => {
    if (show) {
      skippedKeys.value = new Set()
      merging.value = false
      error.value = ''
      groups.value = []
      thumbs.value = {}
      fileExistsById.value = {}
      loading.value = true
      void reload(true)
    }
  },
  {immediate: true},
)

watch(
  () => dialogsStore.mediaMerge.show,
  (show, wasShow) => {
    if (wasShow && !show && dialogsStore.duplicateReview.show) {
      merging.value = false
      void reload()
    }
  },
)
</script>

<style scoped>
.dup-review-root {
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.dup-review-with-file :deep(.v-label) {
  font-size: 0.8125rem;
  line-height: 1.25;
  opacity: 1;
}

.dup-review-group {
  box-sizing: border-box;
  padding: 0 0 12px;
}

.dup-review-group__header {
  margin-bottom: 8px;
}

.dup-review-cards {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.dup-review-card {
  flex: 0 0 160px;
  width: 160px;
  text-align: left;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 8px;
  background: transparent;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
}

.dup-review-card--survivor {
  border: 1px solid rgb(var(--v-theme-primary));
  box-shadow: none;
}

.dup-review-thumb {
  position: relative;
  height: 90px;
  background: rgba(0, 0, 0, 0.2);
  overflow: hidden;
}

.dup-review-thumb.no-file > :not(.dup-review-keep-badge) {
  opacity: 0.45;
}

.dup-review-thumb img,
.dup-review-thumb-fallback {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dup-review-thumb-fallback {
  background: rgba(var(--v-theme-surface-variant), 0.4);
}

.dup-review-keep-badge {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.6875rem;
  line-height: 1.2;
  font-weight: 600;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  pointer-events: none;
  max-width: calc(100% - 12px);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-review-reasons {
  max-height: 3.6em;
  overflow-y: auto;
}

.dup-review-meta {
  padding: 8px;
}
</style>
