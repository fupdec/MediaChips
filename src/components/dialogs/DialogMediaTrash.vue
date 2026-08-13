<template>
  <v-dialog
    v-if="dialogsStore.mediaTrash.show"
    :model-value="dialogsStore.mediaTrash.show"
    @update:model-value="onDialogToggle"
    width="860"
    :fullscreen="xs"
    scrollable
  >
    <v-card rounded="xl">
      <DialogHeader
        :header="t('media_trash.title')"
        :subheader="t('media_trash.subtitle', {days: retentionDays})"
        icon="delete-outline"
        closable
        @close="close"
      />

      <v-card-text class="pa-3 pa-sm-4">
        <v-alert
          v-if="error"
          type="error"
          variant="tonal"
          density="compact"
          class="mb-3"
        >
          {{ error }}
        </v-alert>

        <v-chip-group
          v-model="activeKind"
          mandatory
          selected-class="text-primary"
          class="mb-3"
        >
          <v-chip
            v-for="tab in kindTabs"
            :key="tab.value"
            :value="tab.value"
            filter
            variant="tonal"
            :prepend-icon="kindIcon(tab.value)"
          >
            {{ tab.label }}
            <span v-if="counts[tab.value]" class="ml-1 text-medium-emphasis">
              ({{ counts[tab.value] }})
            </span>
          </v-chip>
        </v-chip-group>

        <div class="d-flex flex-wrap ga-2 mb-3">
          <v-btn
            color="primary"
            variant="tonal"
            rounded="xl"
            prepend-icon="mdi-restore"
            :disabled="!selectedIds.length || busy"
            @click="restoreSelected"
          >
            {{ t('media_trash.restore') }}
          </v-btn>
          <v-btn
            color="error"
            variant="tonal"
            rounded="xl"
            prepend-icon="mdi-delete-forever"
            :disabled="!selectedIds.length || busy"
            @click="confirmPurgeSelected"
          >
            {{ t('media_trash.purge_selected') }}
          </v-btn>
          <v-spacer />
          <v-btn
            color="error"
            variant="text"
            rounded="xl"
            prepend-icon="mdi-delete-sweep"
            :disabled="!visibleItems.length || busy"
            @click="confirmEmptyTrash"
          >
            {{ t('media_trash.empty_trash') }}
          </v-btn>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          class="mb-3"
        />

        <div
          v-if="!loading && !visibleItems.length"
          class="text-center pa-8"
        >
          <v-img
            src="/images/no-data.svg"
            max-height="160"
            class="mx-auto mb-2"
            contain
          />
          <div class="text-h6 mt-2">{{ t('media_trash.empty') }}</div>
        </div>

        <div
          v-else
          class="media-trash__list"
        >
          <div
            v-for="item in visibleItems"
            :key="`${item.kind}:${item.id}`"
            class="media-trash__row"
            :class="{'media-trash__row--selected': selected.has(itemKey(item))}"
            @click="toggleSelect(item)"
          >
            <v-checkbox
              :model-value="selected.has(itemKey(item))"
              hide-details
              density="compact"
              color="primary"
              class="flex-grow-0"
              @click.stop
              @update:model-value="toggleSelect(item)"
            />
            <div class="media-trash__thumb" aria-hidden="true">
              <v-img
                v-if="thumbUrl(item)"
                :src="thumbUrl(item)!"
                cover
                class="media-trash__thumb-img"
                @error="onThumbError(item)"
              >
                <template #placeholder>
                  <div class="media-trash__thumb-fallback">
                    <v-icon size="22" :icon="kindIcon(item.kind, item.mediaTypeId)" />
                  </div>
                </template>
                <template #error>
                  <div class="media-trash__thumb-fallback">
                    <v-icon size="22" :icon="kindIcon(item.kind, item.mediaTypeId)" />
                  </div>
                </template>
              </v-img>
              <div v-else class="media-trash__thumb-fallback">
                <v-icon size="22" :icon="kindIcon(item.kind, item.mediaTypeId)" />
              </div>
            </div>
            <div class="media-trash__meta min-width-0">
              <div class="media-trash__name text-truncate" :title="itemLabel(item)">
                <span class="media-trash__kind">{{ kindLabel(item.kind) }}</span>
                {{ itemLabel(item) }}
              </div>
              <div
                v-if="item.originalPath || item.path"
                class="media-trash__path text-caption text-medium-emphasis text-truncate"
                :title="item.originalPath || item.path || ''"
              >
                {{ item.originalPath || item.path }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ daysLeftLabel(item.deletedAt) }}
                <span v-if="item.purgeFile"> · {{ t('media_trash.purge_file_hint') }}</span>
              </div>
            </div>
            <div class="media-trash__actions" @click.stop>
              <v-btn
                size="small"
                variant="text"
                color="primary"
                :disabled="busy"
                @click="restoreItems([item])"
              >
                {{ t('media_trash.restore') }}
              </v-btn>
              <v-btn
                size="small"
                variant="text"
                color="error"
                :disabled="busy"
                @click="confirmPurgeItems([item])"
              >
                {{ t('media_trash.purge') }}
              </v-btn>
            </div>
          </div>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {typedApi} from '@/services/typedApi'
import {buildLocalFileUrl} from '@/services/fileService'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {getMediaDeleteAssetFolder} from '@/utils/mediaType'
import {resolveMediaThumbDisplayUrl, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {getMarkImagePath} from '@/utils/markThumb'

type TrashKind = 'media' | 'tag' | 'mark' | 'playlist' | 'savedFilter'

type TrashItem = {
  kind: TrashKind
  id: number
  name: string | null
  basename?: string | null
  path?: string | null
  originalPath?: string | null
  mediaTypeId?: number | null
  deletedAt: string
  purgeFile?: boolean
  filesize?: number | null
  metaId?: number | null
  mediaId?: number | null
}

const {t} = useI18n()
const {xs} = useDisplay()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()

const items = ref<TrashItem[]>([])
const retentionDays = ref(30)
const loading = ref(false)
const busy = ref(false)
const error = ref('')
const selected = ref(new Set<string>())
const activeKind = ref<TrashKind>('media')
const failedThumbs = ref(new Set<string>())

const kindTabs = computed(() => [
  {value: 'media' as const, label: t('media_trash.kind_media')},
  {value: 'tag' as const, label: t('media_trash.kind_tag')},
  {value: 'mark' as const, label: t('media_trash.kind_mark')},
  {value: 'playlist' as const, label: t('media_trash.kind_playlist')},
  {value: 'savedFilter' as const, label: t('media_trash.kind_saved_filter')},
])

function kindIcon(kind: TrashKind, mediaTypeId?: number | null) {
  if (kind === 'media') {
    const mediaType = appStore.mediaTypes?.find((entry) => entry.id === mediaTypeId)
    const folder = getMediaDeleteAssetFolder(mediaType)
    if (folder === 'images') return 'mdi-image-outline'
    if (folder === 'audios') return 'mdi-music-note-outline'
    return 'mdi-movie-outline'
  }
  switch (kind) {
    case 'tag': return 'mdi-tag-outline'
    case 'mark': return 'mdi-tooltip-outline'
    case 'playlist': return 'mdi-format-list-bulleted'
    case 'savedFilter': return 'mdi-filter-outline'
    default: return 'mdi-movie-outline'
  }
}

function thumbUrl(item: TrashItem): string | null {
  const key = itemKey(item)
  if (failedThumbs.value.has(key)) return null

  if (item.kind === 'media') {
    if (!appStore.mediaPath) return null
    const mediaType = appStore.mediaTypes?.find((entry) => entry.id === item.mediaTypeId)
    const folder = getMediaDeleteAssetFolder(mediaType) || 'videos'
    return resolveMediaThumbDisplayUrl(appStore.mediaPath, folder, item.id, 'thumbs', {maxEdge: 160})
  }

  if (item.kind === 'tag') {
    if (!appStore.dbPath || item.metaId == null) return null
    return resolveTagThumbDisplayUrl({
      dbPath: appStore.dbPath,
      metaId: item.metaId,
      tagId: item.id,
      type: 'main',
    })
  }

  if (item.kind === 'mark') {
    if (!appStore.mediaPath) return null
    return buildLocalFileUrl(getMarkImagePath(appStore.mediaPath, item.id))
  }

  return null
}

function onThumbError(item: TrashItem) {
  const key = itemKey(item)
  if (failedThumbs.value.has(key)) return
  const next = new Set(failedThumbs.value)
  next.add(key)
  failedThumbs.value = next
}

const counts = computed(() => {
  const next: Record<TrashKind, number> = {
    media: 0,
    tag: 0,
    mark: 0,
    playlist: 0,
    savedFilter: 0,
  }
  for (const item of items.value) next[item.kind] += 1
  return next
})

const visibleItems = computed(() => items.value.filter((item) => item.kind === activeKind.value))

const selectedIds = computed(() =>
  visibleItems.value
    .filter((item) => selected.value.has(itemKey(item)))
    .map((item) => item.id),
)

function itemKey(item: Pick<TrashItem, 'kind' | 'id'>) {
  return `${item.kind}:${item.id}`
}

function kindLabel(kind: TrashKind) {
  switch (kind) {
    case 'tag': return t('media_trash.kind_tag')
    case 'mark': return t('media_trash.kind_mark')
    case 'playlist': return t('media_trash.kind_playlist')
    case 'savedFilter': return t('media_trash.kind_saved_filter')
    default: return t('media_trash.kind_media')
  }
}

function itemLabel(item: TrashItem) {
  return item.name || item.basename || item.originalPath || item.path || `#${item.id}`
}

function daysLeftLabel(deletedAt: string) {
  const deletedMs = Date.parse(deletedAt)
  if (!Number.isFinite(deletedMs)) return ''
  const expiresAt = deletedMs + retentionDays.value * 86400000
  const days = Math.max(0, Math.ceil((expiresAt - Date.now()) / 86400000))
  return t('media_trash.days_left', {days})
}

function toggleSelect(item: TrashItem) {
  const key = itemKey(item)
  const next = new Set(selected.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  selected.value = next
}

function close() {
  dialogsStore.closeMediaTrash()
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function refresh() {
  loading.value = true
  error.value = ''
  try {
    await Promise.all([
      typedApi.purgeExpiredMediaTrash().catch(() => null),
      typedApi.purgeExpiredTagTrash().catch(() => null),
      typedApi.purgeExpiredMarkTrash().catch(() => null),
      typedApi.purgeExpiredPlaylistTrash().catch(() => null),
      typedApi.purgeExpiredSavedFilterTrash().catch(() => null),
    ])

    const [media, tags, marks, playlists, savedFilters] = await Promise.all([
      typedApi.listMediaTrash({limit: 500}),
      typedApi.listTagTrash({limit: 500}),
      typedApi.listMarkTrash({limit: 500}),
      typedApi.listPlaylistTrash({limit: 500}),
      typedApi.listSavedFilterTrash({limit: 500}),
    ])

    const mediaItems: TrashItem[] = (media.data.items || []).map((item) => ({
      kind: 'media',
      id: item.id,
      name: item.name,
      basename: item.basename,
      path: item.path,
      originalPath: item.originalPath,
      mediaTypeId: item.mediaTypeId,
      deletedAt: item.deletedAt,
      purgeFile: item.purgeFile,
      filesize: item.filesize,
    }))
    const tagItems: TrashItem[] = (tags.data.items || []).map((item) => ({
      kind: 'tag',
      ...item,
    }))
    const markItems: TrashItem[] = (marks.data.items || []).map((item) => ({
      kind: 'mark',
      ...item,
    }))
    const playlistItems: TrashItem[] = (playlists.data.items || []).map((item) => ({
      kind: 'playlist',
      ...item,
    }))
    const filterItems: TrashItem[] = (savedFilters.data.items || []).map((item) => ({
      kind: 'savedFilter',
      ...item,
    }))

    items.value = [...mediaItems, ...tagItems, ...markItems, ...playlistItems, ...filterItems]
      .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)))

    retentionDays.value = Number(
      media.data.retentionDays
      || tags.data.retentionDays
      || marks.data.retentionDays
      || 30,
    )
    selected.value = new Set()
    failedThumbs.value = new Set()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    loading.value = false
  }
}

async function restoreItems(targets: TrashItem[]) {
  if (!targets.length) return
  busy.value = true
  error.value = ''
  try {
    const byKind = groupByKind(targets)
    await Promise.all([
      byKind.media.length ? typedApi.restoreMediaTrash({ids: byKind.media}) : null,
      byKind.tag.length ? typedApi.restoreTagTrash({ids: byKind.tag}) : null,
      byKind.mark.length ? typedApi.restoreMarkTrash({ids: byKind.mark}) : null,
      byKind.playlist.length ? typedApi.restorePlaylistTrash({ids: byKind.playlist}) : null,
      byKind.savedFilter.length ? typedApi.restoreSavedFilterTrash({ids: byKind.savedFilter}) : null,
    ])
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

async function purgeItems(targets: TrashItem[]) {
  if (!targets.length) return
  busy.value = true
  error.value = ''
  try {
    const byKind = groupByKind(targets)
    await Promise.all([
      byKind.media.length ? typedApi.purgeMediaTrash({ids: byKind.media}) : null,
      byKind.tag.length ? typedApi.purgeTagTrash({ids: byKind.tag}) : null,
      byKind.mark.length ? typedApi.purgeMarkTrash({ids: byKind.mark}) : null,
      byKind.playlist.length ? typedApi.purgePlaylistTrash({ids: byKind.playlist}) : null,
      byKind.savedFilter.length ? typedApi.purgeSavedFilterTrash({ids: byKind.savedFilter}) : null,
    ])
    await refresh()
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    busy.value = false
  }
}

function groupByKind(targets: TrashItem[]) {
  const next: Record<TrashKind, number[]> = {
    media: [],
    tag: [],
    mark: [],
    playlist: [],
    savedFilter: [],
  }
  for (const item of targets) next[item.kind].push(item.id)
  return next
}

function restoreSelected() {
  void restoreItems(visibleItems.value.filter((item) => selected.value.has(itemKey(item))))
}

function confirmPurgeItems(targets: TrashItem[]) {
  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.text = t('media_trash.purge_confirm')
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.action = () => { void purgeItems(targets) }
  dialogsStore.confirm.show = true
}

function confirmPurgeSelected() {
  confirmPurgeItems(visibleItems.value.filter((item) => selected.value.has(itemKey(item))))
}

function confirmEmptyTrash() {
  dialogsStore.confirm.variant = 'delete'
  dialogsStore.confirm.text = t('media_trash.empty_confirm')
  dialogsStore.confirm.checkBoxText = ''
  dialogsStore.confirm.checkBox2Text = ''
  dialogsStore.confirm.action = () => {
    void purgeItems(visibleItems.value)
  }
  dialogsStore.confirm.show = true
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.media-trash__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(60vh, 560px);
  overflow: auto;
}

.media-trash__row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
}

.media-trash__thumb {
  flex: 0 0 56px;
  width: 56px;
  height: 40px;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.06);
}

.media-trash__thumb-img {
  width: 100%;
  height: 100%;
}

.media-trash__thumb-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: rgba(var(--v-theme-on-surface), 0.45);
}

.media-trash__row:hover,
.media-trash__row--selected {
  background: rgba(var(--v-theme-primary), 0.08);
}

.media-trash__meta {
  flex: 1;
  min-width: 0;
}

.media-trash__name {
  font-weight: 600;
}

.media-trash__kind {
  display: inline-block;
  margin-right: 6px;
  padding: 0 6px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  background: rgba(var(--v-theme-on-surface), 0.08);
  color: rgba(var(--v-theme-on-surface), 0.7);
  vertical-align: middle;
}

.media-trash__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex-shrink: 0;
}
</style>
