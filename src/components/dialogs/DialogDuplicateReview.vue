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

      <v-card-text class="dup-review-body">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3 text-caption"
        >
          {{ error }}
        </v-alert>

        <label
          class="dup-review-option"
          :class="{ 'dup-review-option--on': dialogsStore.mergeTrustUnavailable }"
        >
          <span class="dup-review-option__icon" aria-hidden="true">
            <v-icon size="18" icon="mdi-lan-disconnect"/>
          </span>
          <span class="dup-review-option__text">
            <span class="dup-review-option__title">{{ t('media.dialogs.merge_trust_unavailable') }}</span>
            <span class="dup-review-option__hint">{{ t('media.dialogs.merge_trust_unavailable_hint') }}</span>
          </span>
          <v-switch
            v-model="dialogsStore.mergeTrustUnavailable"
            color="warning"
            density="compact"
            hide-details
            inset
            class="dup-review-option__switch"
            :aria-label="t('media.dialogs.merge_trust_unavailable')"
          />
        </label>

        <div v-if="isSimilarity" class="dup-review-hint">
          <v-icon size="16" icon="mdi-cursor-default-click-outline"/>
          <span>{{ t('duplicateSimilarity.reviewLevelsHint') }}</span>
        </div>

        <div
          v-if="loading"
          class="dup-review-loading py-8"
        >
          <v-progress-linear
            indeterminate
            color="primary"
            rounded
            class="mb-3"
          />
          <div class="text-medium-emphasis text-body-2 text-center">
            {{ t('media.dialogs.duplicate_review_loading') }}
          </div>
        </div>

        <div
          v-else-if="!error && !visibleGroups.length"
          class="dup-review-empty"
        >
          <v-icon size="40" icon="mdi-check-circle-outline"/>
          <div class="text-body-2">
            {{ dialogsStore.duplicateReview.targetMediaId != null
              ? t('media.dialogs.duplicate_review_target_empty')
              : t('media.dialogs.duplicate_review_empty') }}
          </div>
        </div>

        <v-virtual-scroll
          v-else-if="visibleGroups.length"
          :items="visibleGroups"
          :item-height="GROUP_HEIGHT"
          renderless
        >
          <template #default="{ item: group, itemRef }">
            <div :ref="itemRef" class="dup-review-group-wrap">
              <section class="dup-review-group">
                <header class="dup-review-group__header">
                  <span class="dup-review-group__count">
                    {{ t('media.dialogs.duplicate_review_group_items', {count: group.items.length}) }}
                  </span>
                  <v-chip
                    v-if="group.survivorId != null"
                    size="small"
                    color="primary"
                    variant="tonal"
                  >
                    {{ t('media.dialogs.duplicate_review_suggested') }}
                    <template v-if="group.suggestedId != null && group.survivorId !== group.suggestedId">
                      → #{{ group.survivorId }}
                    </template>
                  </v-chip>
                  <v-chip
                    v-if="group.confidence"
                    size="small"
                    variant="tonal"
                    :color="group.confidence === 'possible' ? 'warning' : 'success'"
                  >
                    {{ t(`media.dialogs.visual_match_${group.confidence}`) }}
                  </v-chip>
                </header>

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
                    :aria-pressed="Number(media.id) === group.survivorId"
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
                        <v-icon size="12" icon="mdi-check-bold"/>
                        <span>{{ t('media.dialogs.duplicate_review_keep') }}</span>
                      </div>
                    </div>
                    <div class="dup-review-meta">
                      <div
                        class="dup-review-name"
                        :title="media.name || media.basename || `#${media.id}`"
                      >
                        {{ media.name || media.basename || `#${media.id}` }}
                      </div>
                      <div class="dup-review-path" :title="media.path || ''">
                        <v-icon size="14" :icon="sourceIcon(media.path)"/>
                        <span>{{ media.path || '' }}</span>
                      </div>
                      <div class="dup-review-stats">
                        <span
                          v-for="part in metaParts(media)"
                          :key="part.key"
                          class="dup-review-stat"
                        >
                          <v-icon v-if="part.icon" size="13" :icon="part.icon"/>
                          {{ part.text }}
                        </span>
                      </div>
                      <div
                        v-if="isSimilarity || matchReasons(group, Number(media.id)).length"
                        class="dup-review-match dup-review-reasons"
                        :title="matchReasons(group, Number(media.id)).join('; ')"
                      >
                        <template v-if="isSimilarity">
                          <span
                            v-if="Number(media.id) === group.survivorId"
                            class="dup-review-level dup-review-level--original"
                          >
                            {{ t('duplicateSimilarity.original') }}
                          </span>
                          <template v-else>
                            <span
                              v-if="matchInfo(group, Number(media.id)).level"
                              class="dup-review-level"
                              :class="`dup-review-level--${matchInfo(group, Number(media.id)).level}`"
                            >
                              {{ t(`duplicateSimilarity.level_${matchInfo(group, Number(media.id)).level}`) }}
                            </span>
                            <span
                              v-for="signal in matchInfo(group, Number(media.id)).signals"
                              :key="signal.key"
                              class="dup-review-signal"
                              :class="`dup-review-signal--${signal.state}`"
                            >
                              <v-icon size="13" :icon="signal.icon"/>
                              {{ signal.label }}<template v-if="signal.value"> {{ signal.value }}</template>
                            </span>
                          </template>
                        </template>
                        <template v-else>
                          <span
                            v-for="(reason, reasonIndex) in matchReasons(group, Number(media.id))"
                            :key="reasonIndex"
                            class="dup-review-reason"
                          >
                            {{ reason }}
                          </span>
                        </template>
                      </div>
                    </div>
                  </button>
                </div>

                <footer class="dup-review-group__footer">
                  <div v-if="isSimilarity" class="dup-review-group__files">
                    <span class="dup-review-group__files-label">{{ t('duplicateSimilarity.otherFiles') }}</span>
                    <v-select
                      v-model="group.fileAction"
                      :items="groupFileActions"
                      :aria-label="t('duplicateSimilarity.otherFiles')"
                      density="compact"
                      variant="outlined"
                      hide-details
                      :disabled="merging"
                      :list-props="{density: 'compact'}"
                      :menu-props="{contentClass: 'dup-review-menu'}"
                      class="dup-review-group__select"
                    />
                    <v-select
                      v-if="group.fileAction === 'selected'"
                      v-model="group.keepIds"
                      multiple
                      :items="keepOptions(group)"
                      :label="t('duplicateSimilarity.keepSelected')"
                      single-line
                      density="compact"
                      variant="outlined"
                      hide-details
                      :disabled="merging"
                      :list-props="{density: 'compact'}"
                      :menu-props="{contentClass: 'dup-review-menu'}"
                      class="dup-review-group__select dup-review-group__select--keep"
                    >
                      <template #selection="{ item }">
                        <span
                          v-if="item.value === keptOtherIds(group)[0]"
                          class="dup-review-group__kept"
                        >
                          <span class="dup-review-group__kept-name">{{ item.title }}</span>
                          <span
                            v-if="keptOtherIds(group).length > 1"
                            class="dup-review-group__kept-more"
                          >+{{ keptOtherIds(group).length - 1 }}</span>
                        </span>
                      </template>
                    </v-select>
                  </div>
                  <div class="dup-review-group__actions">
                    <v-btn
                      size="small"
                      variant="text"
                      :disabled="merging"
                      @click="skipGroup(group.key)"
                    >
                      {{ t('media.dialogs.duplicate_review_skip') }}
                    </v-btn>
                    <v-btn
                      v-if="!isSimilarity"
                      size="small"
                      color="primary"
                      variant="tonal"
                      :disabled="!canMergeGroup(group) || merging"
                      @click="mergeSuggested(group)"
                    >
                      {{ t('media.dialogs.duplicate_review_merge_suggested') }}
                    </v-btn>
                    <v-btn
                      size="small"
                      color="primary"
                      variant="flat"
                      prepend-icon="mdi-set-merge"
                      :disabled="group.items.length < 2 || merging || (isSimilarity && !canMergeGroup(group))"
                      @click="isSimilarity ? mergeSuggested(group) : openMergeDialog(group)"
                    >
                      {{ t('media.dialogs.duplicate_review_merge') }}
                    </v-btn>
                  </div>
                  <div
                    v-if="isSimilarity && !canMergeGroup(group)"
                    class="dup-review-group__warning"
                  >
                    <v-icon size="14" icon="mdi-alert-outline"/>
                    <span>{{ t('duplicateSimilarity.originalMismatch') }}</span>
                  </div>
                </footer>
              </section>
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

const GROUP_HEIGHT = 388
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

const {t, te} = useI18n()

/** Human-readable merge failure: known source/copy codes are translated, anything else is shown as-is. */
function mergeErrorText(err: unknown): string {
  const data = getErrorResponseData<{code?: string, message?: string}>(err)
  const raw = data?.code || data?.message || (err instanceof Error ? err.message : String(err))
  return te(`copies.errors.${raw}`) ? t(`copies.errors.${raw}`) : raw
}
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
  const targetName = dialogsStore.duplicateReview.targetName
  if (dialogsStore.duplicateReview.targetMediaId != null) {
    return `${targetName || `#${dialogsStore.duplicateReview.targetMediaId}`} · ${modeLabel.value} · ${t('media.dialogs.duplicate_review_target_count', {
      count: Math.max(0, (visibleGroups.value[0]?.items.length ?? 1) - 1),
    })}`
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

/** Files offered in "choose what to keep": everything except the main file, with the path to tell same-named copies apart. */
function keepOptions(group: ReviewGroup) {
  return group.items
    .filter(item => Number(item.id) !== group.survivorId)
    .map(item => ({
      value: Number(item.id),
      title: String(item.basename || item.name || item.path || `#${item.id}`),
      props: {subtitle: String(item.path || '')},
    }))
}

/** Kept files other than the main one, in card order (keepIds may also hold the main file's id). */
function keptOtherIds(group: ReviewGroup): number[] {
  return keepOptions(group).map(option => option.value).filter(id => group.keepIds.includes(id))
}

type MetaPart = {key: string, text: string, icon?: string}

function metaParts(item: MediaItem): MetaPart[] {
  const parts: MetaPart[] = [{key: 'size', text: getReadableFileSize(Number(item.filesize || 0))}]
  const width = Number(item.width || 0)
  const height = Number(item.height || 0)
  if (width > 0 && height > 0) parts.push({key: 'resolution', text: `${width}×${height}`})
  if (Number(item.rating) > 0) parts.push({key: 'rating', text: String(item.rating), icon: 'mdi-star'})
  if (Number(item.views) > 0) parts.push({key: 'views', text: String(item.views), icon: 'mdi-eye-outline'})
  return parts
}

const SOURCE_ICONS: Record<string, string> = {
  gdrive: 'mdi-google-drive',
  onedrive: 'mdi-microsoft-onedrive',
  dropbox: 'mdi-dropbox',
  nas: 'mdi-server-network-outline',
  smb: 'mdi-server-network-outline',
  webdav: 'mdi-server-network-outline',
  http: 'mdi-web',
  https: 'mdi-web',
}

/** Icon for where the file lives, taken from the path scheme (gdrive://, nas://…); plain paths are local disks. */
function sourceIcon(path: unknown): string {
  const scheme = /^([a-z][a-z0-9+.-]*):\/\//i.exec(String(path || ''))?.[1]?.toLowerCase()
  return scheme ? SOURCE_ICONS[scheme] || 'mdi-cloud-outline' : 'mdi-harddisk'
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
type MatchSignalView = {key: string, label: string, value: string, state: 'match' | 'differs' | 'unchecked', icon: string}

/** Same data as matchReasons for a similarity group, shaped for the card: level badge plus per-signal marks. */
function matchInfo(group: ReviewGroup, mediaId: number): {level: SimilarityEvidence['level'] | null, signals: MatchSignalView[]} {
  const match = similarityEvidence(group).find(match => match.ids[1] === mediaId)
  if (!match) return {level: null, signals: []}
  const shown = SIMILARITY_SIGNALS.filter(key => key !== 'path' && (key !== 'visual' || match.signals.visual != null))
  return {
    level: match.level,
    signals: shown.map((key) => {
      const raw = match.signals[key]
      const state = raw == null ? 'unchecked' : key === 'visual' || raw === 100 ? 'match' : 'differs'
      return {
        key,
        label: t(`duplicateSimilarity.${key}`),
        value: key === 'visual' && raw != null ? `${Math.round(raw)}%` : '',
        state,
        icon: state === 'unchecked' ? 'mdi-help' : key === 'visual' ? 'mdi-image-outline' : state === 'match' ? 'mdi-check' : 'mdi-close',
      }
    }),
  }
}
function matchReasons(group: ReviewGroup, mediaId: number): string[] {
  if (isSimilarity.value) {
    if (mediaId === group.survivorId) return [t('duplicateSimilarity.original')]
    const match = similarityEvidence(group).find(match => match.ids[1] === mediaId)
    if (!match) return []
    // The level decides the merge; signals are context. Visual is listed only when frames were compared.
    const shown = SIMILARITY_SIGNALS.filter(key => key !== 'path' && (key !== 'visual' || match.signals.visual != null))
    return [t(`duplicateSimilarity.level_${match.level}`), ...shown.map(key =>
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

/** Re-checks the file to keep right before merging: a disk may have gone offline since the list was built. */
async function withReadableSurvivor(group: ReviewGroup): Promise<ReviewGroup> {
  // Similarity merges are tied to the policy's original, so only manual/by-field groups are swapped.
  if (isSimilarity.value || group.survivorId == null) return group
  const exists = async (item: MediaItem) => {
    try {
      return Boolean(item.path) && await checkPathExists(String(item.path))
    } catch {
      return false
    }
  }
  const survivor = group.items.find((item) => Number(item.id) === group.survivorId)
  if (!survivor || await exists(survivor)) return group
  const readable: MediaItem[] = []
  for (const item of group.items) {
    if (Number(item.id) !== group.survivorId && await exists(item)) readable.push(item)
  }
  const replacement = readable.length ? pickDefaultSurvivorId(readable) : null
  return replacement ? {...group, survivorId: replacement} : group
}

async function mergeGroupItems(originalGroup: ReviewGroup) {
  const group = await withReadableSurvivor(originalGroup)
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
    trustUnavailable: dialogsStore.mergeTrustUnavailable,
  })

  if (res.data.unavailableCopyPaths?.length) notificationsStore.setNotification({type: 'info', title: t('media.dialogs.duplicate_review_unavailable_copies'), text: res.data.unavailableCopyPaths.join('\n')})
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
      error.value = mergeErrorText(err)
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
  // Red "Delete" only when files are actually removed; a plain merge is a confirmation.
  dialogsStore.confirm.variant = filesToDelete(group).length ? 'delete' : 'warning'
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
    canMergeGroup(group) && (!automatic || filesToDelete(group).length === 0
      // Automatic merging covers exact copies only; other versions wait for review.
      && (!isSimilarity.value || similarityEvidence(group).every(match => match.level === 'exact'))),
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
    const reasons = new Set<string>()
    try {
      for (const group of pending) {
        try {
          await mergeGroupItems(group)
          skipGroup(group.key)
          merged += 1
        } catch (err) {
          console.error(err)
          failed += 1
          reasons.add(mergeErrorText(err))
        }
      }
      notificationsStore.setNotification({
        type: failed ? 'warning' : 'success',
        title: failed
          ? t('media.dialogs.duplicate_review_bulk_failed')
          : t('media.dialogs.duplicate_review_bulk_done', {count: merged}),
        text: failed
          ? [t('media.dialogs.duplicate_review_bulk_done', {count: merged}), ...reasons].join('\n')
          : undefined,
      })
      await reload()
      if (failed) {
        error.value = [t('media.dialogs.duplicate_review_bulk_failed'), ...reasons].join(': ')
      }
    } finally {
      merging.value = false
    }
  }
  if (automatic) await run()
  else {
    const deleteCount = pending.reduce((sum, group) => sum + filesToDelete(group).length, 0)
    dialogsStore.confirm.text += ' ' + (deleteCount
      ? t('duplicateSimilarity.deleteConfirm', {count: deleteCount})
      : t('duplicateSimilarity.keepConfirm'))
    // Red "Delete" only when files are actually removed; a plain merge is a confirmation.
    dialogsStore.confirm.variant = deleteCount ? 'delete' : 'warning'
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

/** Never suggest keeping a card whose file is gone when another card in the group still has its file. */
function preferExistingSurvivors() {
  groups.value = groups.value.map((group) => {
    if (group.survivorId == null || fileExistsById.value[String(group.survivorId)] !== false) return group
    const existing = group.items.filter((item) => fileExistsById.value[String(item.id)] === true)
    const suggestedId = existing.length ? pickDefaultSurvivorId(existing) : group.survivorId
    return {...group, suggestedId, survivorId: suggestedId}
  })
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
      targetMediaId: dialogsStore.duplicateReview.targetMediaId,
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
    if (!isSimilarity.value) preferExistingSurvivors()
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
  // Auto-merge belongs to library-wide maintenance runs, not to a single card opened from its context menu.
  const singleCard = dialogsStore.duplicateReview.targetMediaId != null
  if (automatic && !singleCard && isSimilarity.value && policy.value.autoMerge && policy.value.files === 'keep') await mergeAllSuggested(true)
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

.dup-review-body {
  padding: 12px 16px 16px !important;
}

/* Option row: unavailable files */
.dup-review-option {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  padding: 10px 12px 10px 14px;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
}

.dup-review-option:hover {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.dup-review-option--on {
  border-color: rgba(var(--v-theme-warning), 0.45);
  background: rgba(var(--v-theme-warning), 0.06);
}

.dup-review-option--on:hover {
  background: rgba(var(--v-theme-warning), 0.09);
}

.dup-review-option__icon {
  flex: none;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
  transition: background-color 0.15s ease, color 0.15s ease;
}

.dup-review-option--on .dup-review-option__icon {
  background: rgba(var(--v-theme-warning), 0.16);
  color: rgb(var(--v-theme-warning));
}

.dup-review-option__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dup-review-option__title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.3;
}

.dup-review-option__hint {
  font-size: 0.75rem;
  line-height: 1.45;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dup-review-option__switch {
  flex: none;
}

.dup-review-hint {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 2px 12px;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dup-review-hint .v-icon {
  flex: none;
}

.dup-review-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 16px;
  text-align: center;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

/* Group */
.dup-review-group-wrap {
  box-sizing: border-box;
  padding-bottom: 12px;
}

.dup-review-group {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 12px;
  background: rgba(var(--v-theme-on-surface), 0.025);
  overflow: hidden;
}

.dup-review-group__header {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 12px 14px 10px;
}

.dup-review-group__count {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.3;
}

.dup-review-cards {
  display: flex;
  align-items: stretch;
  gap: 10px;
  overflow-x: auto;
  padding: 2px 14px 14px;
}

.dup-review-group__footer {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px 12px;
  min-height: 56px;
  padding: 10px 14px;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  background: rgba(var(--v-theme-on-surface), 0.02);
}

.dup-review-group__files {
  flex: 1 1 0;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dup-review-group__files-label {
  font-size: 0.8125rem;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dup-review-group__select {
  flex: none;
  width: 230px;
}

.dup-review-group__select--keep {
  flex: 1 1 0;
  width: auto;
  min-width: 120px;
  max-width: 300px;
}

.dup-review-group__select :deep(.v-select__selection) {
  min-width: 0;
  max-width: 100%;
}

.dup-review-group__kept {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.dup-review-group__kept-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-review-group__kept-more {
  flex: none;
  padding: 0 6px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.6;
  background: rgba(var(--v-theme-on-surface), 0.1);
}

.dup-review-group__select :deep(.v-field) {
  --v-field-padding-start: 12px;
  font-size: 0.8125rem;
  border-radius: 8px;
}

.dup-review-group__select :deep(.v-field__input) {
  min-height: 34px;
  padding-top: 4px;
  padding-bottom: 4px;
}

.dup-review-group__actions {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.dup-review-group__warning {
  flex-basis: 100%;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 0.75rem;
  line-height: 1.4;
  color: rgb(var(--v-theme-warning));
}

.dup-review-group__warning .v-icon {
  flex: none;
  margin-top: 1px;
}

/* File card */
.dup-review-card {
  flex: 0 0 208px;
  width: 208px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
  font: inherit;
  color: inherit;
  text-align: left;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 10px;
  background-color: rgb(var(--v-theme-surface));
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, background-color 0.15s ease;
}

.dup-review-card:hover:not(:disabled):not(.dup-review-card--survivor) {
  border-color: rgba(var(--v-theme-on-surface), 0.38);
}

.dup-review-card:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 1px;
}

.dup-review-card:disabled {
  cursor: default;
  opacity: 0.7;
}

.dup-review-card--survivor {
  border-color: rgb(var(--v-theme-primary));
  box-shadow: 0 0 0 1px rgb(var(--v-theme-primary));
  background-image: linear-gradient(rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-primary), 0.1));
}

.dup-review-thumb {
  position: relative;
  flex: none;
  width: 100%;
  aspect-ratio: 16 / 9;
  background: rgba(0, 0, 0, 0.25);
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
  top: 8px;
  left: 8px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: calc(100% - 16px);
  padding: 3px 9px 3px 7px;
  border-radius: 999px;
  font-size: 0.6875rem;
  line-height: 1.3;
  font-weight: 600;
  color: rgb(var(--v-theme-on-primary));
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.35);
  pointer-events: none;
}

.dup-review-keep-badge span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-review-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 10px 10px 12px;
}

.dup-review-name {
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-review-path,
.dup-review-stats {
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: 0.75rem;
  line-height: 1.35;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dup-review-path {
  gap: 5px;
}

.dup-review-path .v-icon {
  flex: none;
}

.dup-review-path span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dup-review-stats {
  flex-wrap: wrap;
  gap: 2px 10px;
  font-variant-numeric: tabular-nums;
}

.dup-review-stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.dup-review-match {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed rgba(var(--v-border-color), var(--v-border-opacity));
  font-size: 0.75rem;
  line-height: 1.35;
}

.dup-review-level {
  --dup-tone: var(--v-theme-on-surface);
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.6;
  white-space: nowrap;
  color: rgb(var(--dup-tone));
  background: rgba(var(--dup-tone), 0.16);
}

.dup-review-level--original {
  --dup-tone: var(--v-theme-primary);
}

.dup-review-level--exact {
  --dup-tone: var(--v-theme-success);
}

.dup-review-level--version {
  --dup-tone: var(--v-theme-info);
}

.dup-review-level--pending {
  --dup-tone: var(--v-theme-warning);
}

.dup-review-level--none {
  --dup-tone: var(--v-theme-error);
}

.dup-review-signal {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  white-space: nowrap;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.dup-review-signal--match .v-icon {
  color: rgb(var(--v-theme-success));
}

.dup-review-signal--differs {
  color: rgb(var(--v-theme-error));
}

.dup-review-signal--unchecked {
  opacity: 0.7;
}

.dup-review-reason {
  flex-basis: 100%;
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}
</style>

<style>
/* Select menus are teleported out of the dialog, so they are sized here to match the compact fields. */
.dup-review-menu .v-list-item {
  min-height: 34px;
}

.dup-review-menu .v-list-item-title {
  font-size: 0.8125rem;
  line-height: 1.3;
}

.dup-review-menu .v-list-item-subtitle {
  font-size: 0.6875rem;
}
</style>
