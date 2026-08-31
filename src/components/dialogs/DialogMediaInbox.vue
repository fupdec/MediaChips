<template>
  <v-dialog
    :model-value="inboxStore.dialog"
    :fullscreen="xs"
    width="640"
    scrollable
    @update:model-value="onDialogToggle"
  >
    <v-card rounded="xl">
      <DialogHeader
        :header="t('media_inbox.title')"
        :subheader="t('media_inbox.subtitle')"
        icon="inbox"
        closable
        compact
        :buttons="inboxHeaderButtons"
        @close="close"
      />

      <v-card-text class="pa-2 pa-sm-3 pt-1">
        <v-tabs
          v-model="tab"
          color="primary"
          density="compact"
          class="mb-2"
        >
          <v-tab value="new">
            {{ t('media_inbox.tab_new') }}
            <v-chip
              v-if="newCount"
              class="ml-2"
              size="x-small"
              color="success"
              variant="flat"
            >
              {{ newCount }}
            </v-chip>
          </v-tab>
          <v-tab value="lost">
            {{ t('media_inbox.tab_lost') }}
            <v-chip
              v-if="lostCount"
              class="ml-2"
              size="x-small"
              color="error"
              variant="flat"
            >
              {{ lostCount }}
            </v-chip>
          </v-tab>
          <v-tab value="pending">
            {{ t('media_inbox.tab_pending') }}
            <v-chip
              v-if="inboxStore.pendingCount"
              class="ml-2"
              size="x-small"
              color="primary"
              variant="flat"
            >
              {{ inboxStore.pendingCount }}
            </v-chip>
          </v-tab>
        </v-tabs>

        <div v-if="tab === 'new'">
          <div
            v-if="newGroups.length"
            class="d-flex flex-wrap ga-2 mb-2 px-1"
          >
            <v-btn
              color="success"
              variant="flat"
              rounded="xl"
              size="small"
              prepend-icon="mdi-plus"
              @click="addAllNew"
            >
              {{ t('media_inbox.add_next_group') }}
            </v-btn>
            <v-btn
              v-if="inboxStore.ignoredPaths.length"
              variant="tonal"
              rounded="xl"
              size="small"
              prepend-icon="mdi-eye-outline"
              @click="inboxStore.clearIgnored()"
            >
              {{ t('media_inbox.show_ignored', {count: inboxStore.ignoredPaths.length}) }}
            </v-btn>
          </div>

          <div
            v-if="!newGroups.length"
            class="media-inbox__empty text-center"
          >
            <v-icon size="36" color="success">mdi-inbox-outline</v-icon>
            <div class="text-subtitle-2 mt-1">{{ t('media_inbox.empty_new') }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ t('media_inbox.empty_new_hint') }}</div>
            <v-btn
              class="mt-3"
              color="primary"
              variant="tonal"
              rounded="xl"
              size="small"
              prepend-icon="mdi-folder-eye-outline"
              @click="openWatchedFolders"
            >
              {{ t('onboarding.open_watched_folders') }}
            </v-btn>
          </div>

          <v-expansion-panels v-else v-model="newPanel" multiple density="compact">
            <v-expansion-panel
              v-for="group in newGroups"
              :key="group.key"
              rounded="lg"
            >
              <v-expansion-panel-title class="py-2">
                <v-icon start size="18">mdi-{{ group.mediaTypeIcon || 'file' }}</v-icon>
                <span class="font-weight-medium">{{ group.folderName }}</span>
                <span class="text-medium-emphasis ml-2 text-caption">
                  · {{ groupMediaTypeLabel(group) }}
                </span>
                <v-chip
                  class="ml-2"
                  size="x-small"
                  color="success"
                  variant="flat"
                >
                  {{ group.items.length }}
                </v-chip>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <div class="d-flex flex-wrap ga-2 mb-2">
                  <v-btn
                    color="success"
                    variant="flat"
                    rounded="xl"
                    size="small"
                    prepend-icon="mdi-plus"
                    @click="addInboxGroup(group)"
                  >
                    {{ t('media_inbox.add_group') }}
                  </v-btn>
                  <v-btn
                    variant="tonal"
                    rounded="xl"
                    size="small"
                    prepend-icon="mdi-eye-off-outline"
                    @click="ignoreGroup(group)"
                  >
                    {{ t('media_inbox.ignore_group') }}
                  </v-btn>
                </div>
                <div class="media-inbox__list">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="media-inbox__row"
                  >
                    <div class="media-inbox__name" :title="item.path">
                      {{ basenameFromInboxPath(item.path) }}
                    </div>
                    <div class="media-inbox__path text-caption text-medium-emphasis" :title="item.path">
                      {{ item.path }}
                    </div>
                    <div class="media-inbox__row-actions">
                      <v-btn
                        icon
                        size="x-small"
                        variant="text"
                        :title="t('media_inbox.ignore_one')"
                        @click="ignoreItems([item])"
                      >
                        <v-icon size="16">mdi-eye-off-outline</v-icon>
                      </v-btn>
                    </div>
                  </div>
                </div>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>

        <div v-else-if="tab === 'lost'">
          <div
            v-if="!lostItems.length"
            class="media-inbox__empty text-center"
          >
            <v-icon size="36" color="success">mdi-folder-check-outline</v-icon>
            <div class="text-subtitle-2 mt-1">{{ t('media_inbox.empty_lost') }}</div>
          </div>
          <template v-else>
            <div class="text-caption text-medium-emphasis mb-2 px-1">
              {{ t('media_inbox.lost_hint') }}
            </div>
            <div class="media-inbox__list">
              <div
                v-for="item in lostItems"
                :key="item.key"
                class="media-inbox__row"
              >
                <div class="media-inbox__name" :title="item.path">
                  {{ basenameFromInboxPath(item.path) }}
                </div>
                <div class="media-inbox__meta text-caption">
                  {{ item.folderName }}
                </div>
                <div class="media-inbox__path text-caption text-medium-emphasis" :title="item.path">
                  {{ item.path }}
                </div>
                <div class="media-inbox__row-actions">
                  <v-btn
                    size="x-small"
                    color="error"
                    variant="tonal"
                    rounded="xl"
                    @click="removeLost(item)"
                  >
                    {{ t('media_inbox.remove_lost') }}
                  </v-btn>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-else>
          <div
            v-if="!inboxStore.pendingCount"
            class="media-inbox__empty text-center"
          >
            <v-icon size="36" color="primary">mdi-checkbox-marked-circle-outline</v-icon>
            <div class="text-subtitle-2 mt-1">{{ t('media_inbox.empty_pending') }}</div>
            <div class="text-caption text-medium-emphasis mt-1">{{ t('media_inbox.empty_pending_hint') }}</div>
          </div>
          <template v-else>
            <div class="d-flex flex-wrap ga-2 mb-2 px-1">
              <v-btn
                color="primary"
                variant="flat"
                rounded="xl"
                size="small"
                prepend-icon="mdi-card-search-outline"
                :loading="pendingLoading"
                @click="startPendingReview()"
              >
                {{ t('media_inbox.start_review') }}
              </v-btn>
              <v-btn
                color="primary"
                variant="tonal"
                rounded="xl"
                size="small"
                prepend-icon="mdi-library"
                :loading="pendingLoading"
                @click="openPendingInLibrary"
              >
                {{ t('media_inbox.open_in_library') }}
              </v-btn>
              <v-btn
                variant="tonal"
                rounded="xl"
                size="small"
                prepend-icon="mdi-check-all"
                @click="inboxStore.clearPendingReview()"
              >
                {{ t('media_inbox.clear_pending') }}
              </v-btn>
            </div>
            <div class="text-caption text-medium-emphasis mb-2 px-1">
              {{ t('media_inbox.start_review_hint') }}
            </div>
            <div v-if="pendingLoading" class="text-center pa-4">
              <v-progress-circular indeterminate size="28"/>
            </div>
            <div v-else class="media-inbox__list">
              <div
                v-for="item in pendingMedia"
                :key="item.id"
                class="media-inbox__row"
              >
                <div class="media-inbox__name">
                  {{ item.name || item.basename || `#${item.id}` }}
                </div>
                <div
                  v-if="item.path"
                  class="media-inbox__path text-caption text-medium-emphasis"
                  :title="item.path"
                >
                  {{ item.path }}
                </div>
                <div class="media-inbox__row-actions">
                  <v-btn
                    size="x-small"
                    color="primary"
                    variant="tonal"
                    rounded="xl"
                    @click="startPendingReview(item.id)"
                  >
                    {{ t('media_inbox.review_one') }}
                  </v-btn>
                  <v-btn
                    size="x-small"
                    variant="tonal"
                    rounded="xl"
                    @click="markPendingDone(item.id)"
                  >
                    {{ t('media_inbox.mark_done') }}
                  </v-btn>
                </div>
              </div>
            </div>
          </template>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useRouter} from 'vue-router'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import {useMediaInbox} from '@/composable/useMediaInbox'
import {useReviewModeLauncher} from '@/composable/useReviewModeLauncher'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {typedApi} from '@/services/typedApi'
import {basenameFromInboxPath, type MediaInboxLostItem, type MediaInboxNewGroup} from '@/utils/mediaInbox'
import {findMediaTypeById, getMediaDeleteAssetFolder, isManagedMediaType} from '@/utils/mediaType'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {useAppStore} from '@/stores/app'
import {useWatcherStore} from '@/stores/watcher'
import {useSettingsStore} from '@/stores/settings'
import type {MediaItem} from '@/types/stores'
import {isFolderWatchEnabled} from '@/services/watcherUtils'

const {xs} = useDisplay()
const {t} = useI18n()
const router = useRouter()
const appStore = useAppStore()
const watcherStore = useWatcherStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const eventBus = useEventBus()
const listSync = useItemsListSync()
const {openReviewMode} = useReviewModeLauncher()

const {
  inboxStore,
  newGroups,
  lostItems,
  newCount,
  lostCount,
  addInboxGroup,
  addAllNew,
  ignoreItems,
  ignoreGroup,
} = useMediaInbox()

const newPanel = ref<number[]>([0])
const pendingLoading = ref(false)
const pendingMedia = ref<MediaItem[]>([])

const canRescanFolders = computed(() =>
  settingsStore.watchFolders === '1'
  && watcherStore.folders.some((folder) => isFolderWatchEnabled(folder)),
)

const inboxHeaderButtons = computed(() => [
  {
    icon: 'folder-sync-outline',
    text: t('media_inbox.rescan_folders'),
    title: t('media_inbox.rescan_folders'),
    color: 'primary',
    outlined: true,
    disabled: !canRescanFolders.value || watcherStore.busy,
    function: rescanWatchedFolders,
  },
])

function rescanWatchedFolders() {
  if (!canRescanFolders.value || watcherStore.busy) return
  eventBus.emit('rescan:watcher')
}

const tab = computed({
  get: () => inboxStore.tab,
  set: (value: 'new' | 'lost' | 'pending') => {
    inboxStore.tab = value
  },
})

function groupMediaTypeLabel(group: MediaInboxNewGroup) {
  const mediaType = findMediaTypeById(appStore.mediaTypes, group.mediaTypeId)
  if (mediaType) return getMediaTypeName(mediaType, t)
  return group.mediaTypeName || String(group.mediaTypeId)
}

function close() {
  inboxStore.close()
}

async function openWatchedFolders() {
  close()
  await router.push({path: '/settings', query: {section: 'watched_folders'}})
}

function onDialogToggle(value: boolean) {
  if (!value) close()
}

async function loadPending() {
  const ids = [...inboxStore.pendingReviewIds]
  if (!ids.length) {
    pendingMedia.value = []
    return
  }
  pendingLoading.value = true
  try {
    const res = await typedApi.getMediaBasics({ids})
    const rows = (Array.isArray(res.data?.items) ? res.data.items : []) as MediaItem[]
    const byId = new Map(rows.map((row) => [Number(row.id), row]))
    pendingMedia.value = ids
      .map((id) => byId.get(id) || {id, name: `#${id}`} as MediaItem)
    // Drop ids that no longer exist in the library.
    const existing = new Set(rows.map((row) => Number(row.id)))
    const missing = ids.filter((id) => !existing.has(id))
    if (missing.length) inboxStore.removePendingReview(missing)
  } catch (error) {
    console.error(error)
    pendingMedia.value = ids.map((id) => ({id, name: `#${id}`} as MediaItem))
  } finally {
    pendingLoading.value = false
  }
}

function markPendingDone(id: number) {
  inboxStore.removePendingReview([id])
  pendingMedia.value = pendingMedia.value.filter((item) => Number(item.id) !== id)
}

async function startPendingReview(startId?: number) {
  await loadPending()
  const media = [...pendingMedia.value]
  if (!media.length) return
  close()
  await openReviewMode({
    media,
    startId: startId ?? media[0]?.id ?? null,
    source: 'inbox',
  })
}

async function openPendingInLibrary() {
  const ids = [...inboxStore.pendingReviewIds]
  if (!ids.length) return
  await loadPending()
  const first = pendingMedia.value[0]
  const mediaTypeId = Number(first?.mediaTypeId)
    || Number(itemsStore.environment?.media_type_id)
    || Number(appStore.mediaTypes.find((type) => !type.hidden)?.id)
  if (Number.isFinite(mediaTypeId) && mediaTypeId > 0) {
    await router.push(`/media?mediaTypeId=${mediaTypeId}`)
  } else {
    await router.push('/media')
  }
  itemsStore.isSelect = true
  itemsStore.selection = ids
  itemsStore.selected_last = ids[0] ?? null
  close()
}

function removeLost(item: MediaInboxLostItem) {
  const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
  if (!mediaType || !isManagedMediaType(mediaType)) return

  dialogsStore.confirm.text = t('watcher.folder.delete_confirm')
  dialogsStore.confirm.show = true
  dialogsStore.confirm.action = async () => {
    const folder = getMediaDeleteAssetFolder(mediaType)
    await typedApi.deleteMediaOne({
      id: item.id,
      path: item.path,
      metaId: null,
      with_file: false,
      type: folder,
    })
    listSync.removeEntitiesFromState({
      ids: [item.id],
      type: 'media',
    })
    eventBus.emit('update:watcher')
  }
}

watch(
  () => [inboxStore.dialog, inboxStore.tab, inboxStore.pendingReviewIds] as const,
  ([open, currentTab]) => {
    if (open && currentTab === 'pending') void loadPending()
  },
  {deep: true},
)
</script>

<style scoped>
.media-inbox__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: min(42vh, 360px);
  overflow: auto;
}

.media-inbox__row {
  position: relative;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(var(--v-theme-on-surface), 0.04);
}

.media-inbox__name {
  font-weight: 600;
  font-size: 0.875rem;
  padding-right: 148px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-inbox__path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.media-inbox__meta {
  opacity: 0.8;
}

.media-inbox__row-actions {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
}

.media-inbox__empty {
  opacity: 0.9;
  padding: 16px 8px;
}
</style>
