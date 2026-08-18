<template>
  <v-container
    v-if="appStore.localhost && appStore.is_app_ready"
    class="folders-page items-layout-container"
  >
    <div
      ref="controlDeckSentinel"
      class="items-control-deck-sentinel"
      aria-hidden="true"
    />
    <div
      class="items-control-deck items-control-deck--browser"
      :class="controlDeckClass"
    >
      <div class="items-control-deck__surface items-control-deck__surface--card">
        <div class="items-page-header items-control-deck__header items-page-header--deck d-flex align-center justify-space-between flex-nowrap ga-2">
          <button
            type="button"
            class="items-control-deck__sticky-pin"
            :class="{'items-control-deck__sticky-pin--active': stickyControlDeck}"
            :aria-pressed="stickyControlDeck ? 'true' : 'false'"
            :aria-label="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            v-tooltip:top="stickyControlDeck
              ? t('settings_labels.appearance.sticky_control_deck_unpin')
              : t('settings_labels.appearance.sticky_control_deck_pin')"
            @click="toggleStickyControlDeck"
          >
            <span class="items-control-deck__sticky-pin-glyph" aria-hidden="true">
              <v-icon size="16" icon="mdi-pin"/>
            </span>
          </button>

          <div class="d-flex align-center items-page-header__title min-width-0 ga-2">
            <v-icon class="items-page-header__icon" start>
              mdi-folder-outline
            </v-icon>
            <span class="items-page-header__name text-truncate">
              {{ pageTitle }}
            </span>
            <span
              v-if="!loading && entryCount > 0"
              class="items-page-header__meta"
            >
              ({{ entryCount }})
            </span>
          </div>

          <div class="d-flex align-center flex-nowrap ga-2 items-control-deck__controls">
            <v-select
              v-model="sort"
              :items="sortOptions"
              item-title="title"
              item-value="value"
              variant="outlined"
              density="compact"
              hide-details
              single-line
              rounded="xl"
              class="folders-page__sort"
              :aria-label="t('filters.sort_by')"
            />

            <v-btn
              @click="showAppearancePanel = !showAppearancePanel"
              v-tooltip:top="t('appbar.buttons.customize_appearance')"
              color="primary"
              :variant="showAppearancePanel ? 'flat' : 'tonal'"
              size="small"
              icon
            >
              <v-icon size="18">mdi-eye-settings-outline</v-icon>
            </v-btn>
          </div>
        </div>

        <v-expand-transition>
          <div
            v-if="showAppearancePanel"
            class="items-control-deck__appearance items-control-deck__section folders-page__appearance-section"
          >
            <div class="folders-page__appearance-deck">
              <div class="toolbar-appearance__deck-group">
                <span class="toolbar-appearance__deck-label">{{ t('settings_labels.appearance.item_size') }}</span>
                <div class="toolbar-appearance__deck-track">
                  <button
                    v-for="(label, index) in sizeLabels"
                    :key="label"
                    type="button"
                    class="toolbar-appearance__deck-opt"
                    :class="{'toolbar-appearance__deck-opt--active': itemsStore.size === index + 1}"
                    @click="itemsStore.size = index + 1"
                  >
                    {{ label }}
                  </button>
                </div>
              </div>

              <div class="toolbar-appearance__deck-group">
                <span class="toolbar-appearance__deck-label">{{ t('items.view_type') }}</span>
                <div class="items-view-track">
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': !listMode}"
                    @click="listMode = false"
                  >
                    <v-icon size="15">mdi-view-module</v-icon>
                    <span>{{ t('folders_browser.view_icons') }}</span>
                  </button>
                  <button
                    type="button"
                    class="items-view-opt"
                    :class="{'items-view-opt--active': listMode}"
                    @click="listMode = true"
                  >
                    <v-icon size="15">mdi-view-list</v-icon>
                    <span>{{ t('folders_browser.view_list') }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </v-expand-transition>

        <div class="folders-page__nav d-flex align-center ga-2 flex-nowrap min-width-0">
          <v-btn
            icon="mdi-arrow-left"
            size="x-small"
            color="primary"
            variant="tonal"
            :aria-label="t('folders_browser.back')"
            @click="router.back()"
          />
          <v-btn
            icon="mdi-arrow-right"
            size="x-small"
            color="primary"
            variant="tonal"
            :aria-label="t('folders_browser.forward')"
            @click="router.forward()"
          />
          <v-btn
            icon="mdi-arrow-up"
            size="x-small"
            color="primary"
            variant="tonal"
            :disabled="loading || !canGoUp"
            :aria-label="t('folders_browser.up')"
            @click="goUp"
          />
          <div class="folders-page__crumbs d-flex align-center ga-1 flex-nowrap min-width-0 overflow-x-auto">
            <v-chip
              size="small"
              label
              :color="!currentPath ? 'primary' : undefined"
              :variant="!currentPath ? 'flat' : 'tonal'"
              prepend-icon="mdi-folder-outline"
              :disabled="loading"
              @click="navigateTo(null)"
            >
              {{ t('folders_browser.roots') }}
            </v-chip>
            <template
              v-for="crumb in breadcrumbs"
              :key="crumb.path"
            >
              <v-icon
                icon="mdi-chevron-right"
                size="14"
                class="text-medium-emphasis flex-shrink-0"
              />
              <v-chip
                size="small"
                label
                :color="crumb.path === currentPath ? 'primary' : undefined"
                :variant="crumb.path === currentPath ? 'flat' : 'tonal'"
                :disabled="loading"
                class="flex-shrink-0"
                @click="navigateTo(crumb.path)"
              >
                {{ crumb.name }}
              </v-chip>
            </template>
          </div>
        </div>

        <div class="folders-page__filters d-flex align-center flex-wrap ga-2">
          <v-text-field
            v-model="searchQuery"
            density="compact"
            variant="outlined"
            hide-details
            clearable
            rounded="xl"
            prepend-inner-icon="mdi-magnify"
            :placeholder="t('folders_browser.search_placeholder')"
            class="folders-page__search"
            @keydown.esc.stop="searchQuery = ''"
          />

          <v-chip
            size="small"
            label
            :color="mediaTypeId == null ? 'primary' : undefined"
            :variant="mediaTypeId == null ? 'flat' : 'tonal'"
            @click="setMediaTypeFilter(null)"
          >
            {{ t('folders_browser.all_types') }}
          </v-chip>
          <v-chip
            v-for="mediaType in visibleMediaTypes"
            :key="mediaType.id"
            size="small"
            label
            :color="mediaTypeId === mediaType.id ? 'primary' : undefined"
            :variant="mediaTypeId === mediaType.id ? 'flat' : 'tonal'"
            :prepend-icon="`mdi-${mediaType.icon || 'file'}`"
            @click="setMediaTypeFilter(mediaType.id)"
          >
            {{ mediaTypeTitle(mediaType) }}
          </v-chip>

          <div
            v-if="uniqueFolderTagChips.length"
            class="ml-2 d-flex align-center ga-1"
          >
            <v-chip
              size="x-small"
              label
              :color="tagFilterId == null ? 'primary' : undefined"
              :variant="tagFilterId == null ? 'flat' : 'tonal'"
              prepend-icon="mdi-tag-multiple-outline"
              @click="tagFilterId = null"
            >
              {{ t('folders_browser.all_tags') }}
            </v-chip>
            <v-chip
              v-for="chip in uniqueFolderTagChips"
              :key="chip.tagId"
              size="x-small"
              label
              :color="tagFilterId === chip.tagId ? 'primary' : undefined"
              :variant="tagFilterId === chip.tagId ? 'flat' : 'tonal'"
              @click="tagFilterId = tagFilterId === chip.tagId ? null : chip.tagId"
            >
              {{ chip.name }}
            </v-chip>
          </div>

          <template v-if="currentPath">
            <div class="folders-page__actions d-flex align-center flex-nowrap ga-1">
              <FolderTagsMenu
                :folder-path="currentPath"
                v-model:open="currentTagsMenuOpen"
                @saved="reloadFolderTags"
              >
                <template #activator="{props: menuProps}">
                  <v-btn
                    v-bind="menuProps"
                    size="small"
                    variant="tonal"
                    color="primary"
                    prepend-icon="mdi-tag-multiple-outline"
                  >
                    {{ t('media.adding.folder_tags_edit') }}
                  </v-btn>
                </template>
              </FolderTagsMenu>
              <v-btn
                size="small"
                variant="text"
                prepend-icon="mdi-folder-multiple-outline"
                @click="folderTagsManagerOpen = true"
              >
                {{ t('media.adding.folder_tags_manager_open') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-folder-open-outline"
                @click="revealPath(currentPath)"
              >
                {{ t('folders_browser.reveal') }}
              </v-btn>
              <v-btn
                size="small"
                variant="tonal"
                color="primary"
                prepend-icon="mdi-play"
                @click="playAllInPath(currentPath)"
              >
                {{ t('folders_browser.play_all') }}
              </v-btn>
            </div>
          </template>
        </div>

        <div
          v-if="currentPath && currentFolderTags.length"
          class="folders-page__current-tags d-flex flex-wrap ga-1"
        >
          <v-chip
            v-for="chip in currentFolderTags"
            :key="chip.tagId"
            size="x-small"
            label
            :color="chip.color || undefined"
            variant="tonal"
          >
            {{ chip.name }}
          </v-chip>
        </div>

        <v-progress-linear
          v-if="loading"
          indeterminate
          color="primary"
          height="2"
          class="mt-2"
        />
      </div>
    </div>

    <div
      v-if="!loading && !folders.length && !media.length && !searchQuery && tagFilterId == null"
      class="folders-page__status text-medium-emphasis"
    >
      <div class="mb-3">
        {{ currentPath ? t('folders_browser.empty_folder') : t('folders_browser.empty_library') }}
      </div>
      <v-btn
        v-if="!currentPath"
        color="success"
        variant="flat"
        rounded="xl"
        prepend-icon="mdi-plus"
        @click="openAddMedia"
      >
        {{ t('commandPalette.actions.add_media') }}
      </v-btn>
    </div>

    <div
      v-else-if="!loading && !visibleFolders.length && !visibleMedia.length && (searchQuery || tagFilterId != null)"
      class="folders-page__status text-medium-emphasis"
    >
      {{ t('folders_browser.search_empty') }}
    </div>

    <FoldersVirtualGrid
      v-else-if="visibleFolders.length || visibleMedia.length"
      :folders="visibleFolders"
      :media="visibleMedia"
      :size="itemsStore.size"
      :gap-size="settingsStore.gapSize"
      :list="listMode"
      :folder-tags="folderTagsByPath"
      :cover-url-by-media-id="coverUrlByMediaId"
      :reg="registrationStore.reg"
      class="items-page-grid"
      @open-folder="navigateTo"
      @folder-contextmenu="onFolderContextMenu"
      @media-contextmenu="onMediaContextMenu"
    />

    <FolderTagsMenu
      v-if="contextTagsPath"
      :folder-path="contextTagsPath"
      v-model:open="contextTagsMenuOpen"
      @saved="reloadFolderTags"
    >
      <template #activator="{props: menuProps}">
        <button
          v-bind="menuProps"
          ref="contextTagsActivator"
          class="folders-page__hidden-activator"
          type="button"
          tabindex="-1"
          aria-hidden="true"
        />
      </template>
    </FolderTagsMenu>

    <DialogFolderTagsManager v-model="folderTagsManagerOpen"/>
  </v-container>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import FoldersVirtualGrid from '@/components/folders/FoldersVirtualGrid.vue'
import FolderTagsMenu from '@/components/dialogs/FolderTagsMenu.vue'
import DialogFolderTagsManager from '@/components/dialogs/DialogFolderTagsManager.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useRegistrationStore} from '@/stores/registration'
import {useContextMenu} from '@/stores/contextMenu'
import {useDialogsStore} from '@/stores/dialogs'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import {useFoldersBrowserFocus} from '@/composable/useFoldersBrowserFocus'
import {useAppShell} from '@/composable/appShell'
import useItemContextMenu from '@/composable/ItemContextMenu'
import {useEventBus} from '@/utils/eventBus'
import {typedApi} from '@/services/typedApi'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {findMediaTypeById, getMediaDeleteAssetFolder, isVideoMediaType} from '@/utils/mediaType'
import {CARD_THUMB_MAX_EDGE, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {useItemsThumbPrefetch} from '@/composable/useItemsThumbPrefetch'
import {
  canonicalizeFolderTagPath,
  filterAndSortFolderBrowse,
  folderTagLookupPaths,
  type FolderBrowseSort,
} from '@shared/libraryFolderBrowseUi'
import type {MediaType} from '@/types/media'
import type {ContextMenuEntry, MediaItem} from '@/types/stores'
import type {FolderBrowseTagChip, FolderBrowseTileModel} from '@/components/folders/FolderBrowseTile.vue'

type Breadcrumb = {
  path: string
  name: string
}

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const registrationStore = useRegistrationStore()
const contextMenuStore = useContextMenu()
const dialogsStore = useDialogsStore()
const appShell = useAppShell()
const eventBus = useEventBus()
const {setFocus, clearFocus} = useFoldersBrowserFocus()

const {
  controlDeckSentinel,
  controlDeckClass,
  stickyControlDeck,
  toggleStickyControlDeck,
} = useStickyControlDeck()

const loading = ref(false)
const currentPath = ref<string | null>(null)
const parentPath = ref<string | null>(null)
const breadcrumbs = ref<Breadcrumb[]>([])
const folders = ref<FolderBrowseTileModel[]>([])
const media = ref<MediaItem[]>([])
const searchQuery = ref('')
const sort = ref<FolderBrowseSort>('name-asc')
const listMode = ref(false)
const showAppearancePanel = ref(false)
const folderTagsByPath = ref<Record<string, FolderBrowseTagChip[]>>({})
const tagFilterId = ref<number | null>(null)
const coverUrlByMediaId = ref<Record<number, string>>({})
const coverMediaTypeById = ref<Record<string, number>>({})
const currentTagsMenuOpen = ref(false)
const contextTagsMenuOpen = ref(false)
const contextTagsPath = ref('')
const folderTagsManagerOpen = ref(false)
const contextTagsActivator = ref<HTMLButtonElement | null>(null)

const sizeLabels = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

const sortOptions = computed(() => [
  {value: 'name-asc' as const, title: t('folders_browser.sort_name_asc')},
  {value: 'name-desc' as const, title: t('folders_browser.sort_name_desc')},
  {value: 'count' as const, title: t('folders_browser.sort_count')},
  {value: 'date' as const, title: t('folders_browser.sort_date')},
])

const visibleMediaTypes = computed(() =>
  (appStore.mediaTypes || []).filter((item) => !item.hidden),
)

const mediaTypeId = computed((): number | null => {
  const raw = route.query.mediaTypeId
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
})

const pathFromQuery = computed((): string | null => {
  const raw = route.query.path
  const value = Array.isArray(raw) ? raw[0] : raw
  if (value == null || value === '') return null
  return String(value)
})

const canGoUp = computed(() => Boolean(currentPath.value))

const filtered = computed(() => {
  let result = filterAndSortFolderBrowse(
    folders.value,
    media.value,
    {query: searchQuery.value, sort: sort.value},
  )

  if (tagFilterId.value != null) {
    result = {
      ...result,
      folders: result.folders.filter((folder) =>
        (folderTagsByPath.value[canonicalizeFolderTagPath(folder.path)] || [])
          .some((chip) => chip.tagId === tagFilterId.value),
      ),
    }
  }

  return result
})

const visibleFolders = computed(() => filtered.value.folders)
const visibleMedia = computed(() => filtered.value.media as MediaItem[])
const entryCount = computed(() => visibleFolders.value.length + visibleMedia.value.length)

const pageTitle = computed(() => {
  if (!currentPath.value) return t('navigation.folders')
  const last = breadcrumbs.value[breadcrumbs.value.length - 1]
  return last?.name || t('navigation.folders')
})

const currentFolderTags = computed(() => {
  if (!currentPath.value) return []
  return folderTagsByPath.value[canonicalizeFolderTagPath(currentPath.value)] || []
})

const uniqueFolderTagChips = computed(() => {
  const byId = new Map<number, FolderBrowseTagChip>()
  for (const folder of folders.value) {
    const chips = folderTagsByPath.value[canonicalizeFolderTagPath(folder.path)] || []
    for (const chip of chips) {
      if (!byId.has(chip.tagId)) byId.set(chip.tagId, chip)
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const prefetchMediaType = computed(() => {
  const id = mediaTypeId.value
  if (id == null) return null
  return findMediaTypeById(appStore.mediaTypes, id)
})

useItemsThumbPrefetch({
  items: computed(() => visibleMedia.value),
  itemsType: computed(() => 'media' as const),
  mediaType: prefetchMediaType,
})

function mediaTypeTitle(mediaType: MediaType) {
  return getMediaTypeName(mediaType, t)
}

function navigateTo(path: string | null) {
  itemsStore.clearSelection()
  clearFocus()
  const query: Record<string, string> = {}
  if (path) query.path = path
  if (mediaTypeId.value != null) query.mediaTypeId = String(mediaTypeId.value)
  void router.push({path: '/folders', query})
}

function setMediaTypeFilter(id: number | null) {
  const query: Record<string, string> = {}
  if (pathFromQuery.value) query.path = pathFromQuery.value
  if (id != null) query.mediaTypeId = String(id)
  void router.push({path: '/folders', query})
}

function goUp() {
  if (parentPath.value) {
    navigateTo(parentPath.value)
    return
  }
  if (currentPath.value) navigateTo(null)
}

function openAddMedia() {
  appShell.showAddMediaDialog()
}

function revealPath(folderPath: string) {
  void openPath(folderPath, true)
}

async function playAllInPath(folderPath: string) {
  const inCurrent = canonicalizeFolderTagPath(folderPath) === canonicalizeFolderTagPath(currentPath.value)
  if (inCurrent) {
    const localVideos = media.value.filter((item) =>
      isVideoMediaType(findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)),
    )
    if (localVideos.length) {
      await itemsStore.playVideo({video: localVideos[0], videos: localVideos, player: 'builtin'})
      return
    }
  }

  try {
    const {data} = await typedApi.getMediaIds({
      mediaTypeId: mediaTypeId.value,
      filters: [{
        id: null,
        active: true,
        lock: false,
        note: null,
        param: 'path',
        type: 'string',
        cond: 'under folder',
        val: folderPath,
      }],
    })
    const ids = (data.ids || []).map(Number).filter((id) => Number.isFinite(id))
    if (!ids.length) return
    const basics = await typedApi.getMediaBasics({ids})
    const videos = (basics.data.items || []).filter((item) =>
      isVideoMediaType(findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)),
    ) as MediaItem[]
    if (!videos.length) return
    itemsStore.entities = videos
    itemsStore.navigationItems = videos
    await itemsStore.playVideo({video: videos[0], videos, player: 'builtin'})
  } catch (error) {
    console.error('Failed to play folder videos', error)
  }
}

function syncPlaylist(items: MediaItem[]) {
  itemsStore.type = 'media'
  itemsStore.environment.media_type_id = mediaTypeId.value
  if (itemsStore.view !== 1 && itemsStore.view !== 4 && itemsStore.view !== 5) {
    itemsStore.view = 1
  }
  itemsStore.entities = items
  itemsStore.navigationItems = items
  itemsStore.itemsOnPage = items
  itemsStore.totalFiltered = items.length
}

async function reloadFolderTags() {
  const paths = [
    currentPath.value,
    ...folders.value.map((folder) => folder.path),
  ]
    .flatMap((path) => folderTagLookupPaths(path))
    .filter(Boolean)

  if (!paths.length) {
    folderTagsByPath.value = {}
    return
  }

  try {
    const res = await typedApi.getTagsInFoldersByPaths(paths)
    const next: Record<string, FolderBrowseTagChip[]> = {}
    for (const [path, rows] of Object.entries(res.data || {})) {
      const key = canonicalizeFolderTagPath(path)
      next[key] = (rows || []).map((row) => {
        const tag = (row as {tag?: {name?: string; color?: string | null}}).tag
        return {
          tagId: Number(row.tagId),
          name: String(tag?.name || row.tagId),
          color: tag?.color ?? null,
        }
      }).filter((row) => row.tagId && row.name)
    }
    folderTagsByPath.value = next
  } catch (error) {
    console.error(error)
  }
}

function buildCoverUrls(nextFolders: FolderBrowseTileModel[]) {
  const map: Record<number, string> = {}
  const typeById = coverMediaTypeById.value
  const mediaPath = appStore.mediaPath || ''
  for (const folder of nextFolders) {
    for (const id of folder.coverMediaIds || []) {
      const mediaTypeId = typeById[String(id)]
      const mediaType = mediaTypeId ? findMediaTypeById(appStore.mediaTypes, mediaTypeId) : null
      const assetFolder = getMediaDeleteAssetFolder(mediaType) || 'videos'
      const url = resolveMediaThumbDisplayUrl(
        mediaPath,
        assetFolder,
        id,
        'thumbs',
        {maxEdge: CARD_THUMB_MAX_EDGE},
      )
      if (url) map[id] = url
    }
  }
  coverUrlByMediaId.value = map
}

async function loadFolder() {
  if (!appStore.localhost || !appStore.is_app_ready) return

  loading.value = true
  try {
    const {data} = await typedApi.folderBrowse({
      path: pathFromQuery.value,
      mediaTypeId: mediaTypeId.value,
    })
    currentPath.value = data.currentPath ?? null
    parentPath.value = data.parentPath ?? null
    breadcrumbs.value = Array.isArray(data.breadcrumbs) ? data.breadcrumbs : []
    folders.value = Array.isArray(data.folders) ? data.folders : []
    const nextMedia = (Array.isArray(data.media) ? data.media : []) as MediaItem[]
    media.value = nextMedia
    coverMediaTypeById.value = data.coverMediaTypeById || {}
    buildCoverUrls(folders.value)
    syncPlaylist(nextMedia)
    await reloadFolderTags()
  } catch (error) {
    console.error('Failed to browse library folders', error)
    currentPath.value = pathFromQuery.value
    parentPath.value = null
    breadcrumbs.value = []
    folders.value = []
    media.value = []
    syncPlaylist([])
  } finally {
    loading.value = false
  }
}

function onFolderContextMenu(event: MouseEvent, folderPath: string) {
  setFocus({kind: 'folder', path: folderPath})
  const content: ContextMenuEntry[] = [
    {
      name: t('folders_browser.open_folder'),
      type: 'item',
      icon: 'folder-open',
      action: () => navigateTo(folderPath),
    },
    {
      name: t('folders_browser.reveal'),
      type: 'item',
      icon: 'folder-outline',
      action: () => revealPath(folderPath),
    },
    {
      name: t('context_menu.copy_path'),
      type: 'item',
      icon: 'content-copy',
      action: () => { void copyToClipboard(folderPath) },
    },
    {
      name: t('media.adding.folder_tags_edit'),
      type: 'item',
      icon: 'tag-multiple-outline',
      action: () => openTagsForPath(folderPath),
    },
    {
      name: t('folders_browser.play_all'),
      type: 'item',
      icon: 'play',
      action: () => { void playAllInPath(folderPath) },
    },
    {
      type: 'divider' as const,
    },
    {
      name: t('folders_browser.delete_folder'),
      type: 'item',
      icon: 'delete',
      color: 'error',
      action: () => { void deleteFolderWithConfirm(folderPath) },
    },
  ]
  contextMenuStore.showContextMenu({
    content,
    x: event.clientX,
    y: event.clientY,
  })
}

function onMediaContextMenu(event: MouseEvent, item: MediaItem) {
  setFocus({kind: 'media', id: Number(item.id)})
  const {getContextMenu} = useItemContextMenu(item, 'media', null, true, null)
  contextMenuStore.showContextMenu({
    content: getContextMenu() as ContextMenuEntry[],
    x: event.clientX,
    y: event.clientY,
    targetItemId: item.id,
  })
}

async function openTagsForPath(folderPath: string) {
  contextTagsPath.value = folderPath
  await nextTick()
  contextTagsMenuOpen.value = true
  contextTagsActivator.value?.click()
}

async function deleteFolderWithConfirm(folderPath: string) {
  try {
    const filter = {
      id: null,
      active: true,
      lock: false,
      note: null,
      param: 'path',
      type: 'string',
      cond: 'under folder',
      val: folderPath,
    }

    const allIds: number[] = []
    const mediaTypesToCollect = mediaTypeId.value != null
      ? [mediaTypeId.value]
      : visibleMediaTypes.value.map((mt) => mt.id)

    for (const mtId of mediaTypesToCollect) {
      try {
        const {data} = await typedApi.getMediaIds({
          mediaTypeId: mtId,
          filters: [filter],
        })
        for (const rawId of data.ids || []) {
          const id = Number(rawId)
          if (Number.isFinite(id) && id > 0 && !allIds.includes(id)) {
            allIds.push(id)
          }
        }
      } catch (error) {
        console.error(`Failed to query media for type ${mtId}`, error)
      }
    }
    if (!allIds.length) {
      setNotification({
        type: 'info',
        title: t('folders_browser.delete_folder_empty'),
      })
      return
    }

    const count = allIds.length
    dialogsStore.confirm.variant = 'delete'
    dialogsStore.confirm.checkBox = false
    dialogsStore.confirm.checkBox2 = false
    dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
    dialogsStore.confirm.checkBox2Text = t('actions.also_delete_files')
    dialogsStore.confirm.checkBox2RequiresPrimary = true
    dialogsStore.confirm.text = t('folders_browser.delete_folder_confirm', {count, path: folderPath})
    dialogsStore.confirm.action = async () => {
      const permanent = Boolean(dialogsStore.confirm.checkBox)
      const withFile = Boolean(dialogsStore.confirm.checkBox2)
      let deleted = 0
      for (const id of allIds) {
        try {
          await typedApi.deleteEntityOne('media', {
            id,
            with_file: withFile,
            permanent,
          })
          deleted += 1
        } catch (error) {
          console.error('Failed to delete media', id, error)
        }
      }
      setNotification({
        type: 'success',
        title: permanent
          ? t('folders_browser.delete_folder_done', {count: deleted})
          : t('notifications_text.items_moved_to_trash'),
      })
      await loadFolder()
    }
    dialogsStore.confirm.show = true
  } catch (error) {
    console.error('Failed to query folder media', error)
    setNotification({
      type: 'error',
      title: t('folders_browser.delete_folder_error'),
    })
  }
}

watch(
  () => [pathFromQuery.value, mediaTypeId.value, appStore.is_app_ready] as const,
  () => {
    void loadFolder()
  },
  {immediate: true},
)

watch(uniqueFolderTagChips, (chips) => {
  if (tagFilterId.value != null && !chips.some((chip) => chip.tagId === tagFilterId.value)) {
    tagFilterId.value = null
  }
})

watch(visibleMedia, (items) => {
  syncPlaylist(items)
})

onMounted(() => {
  eventBus.on('folders:go-up', goUp)
  eventBus.on('folders:open-path', navigateTo)
  eventBus.on('folders:open-tags', () => {
    if (currentPath.value) {
      currentTagsMenuOpen.value = true
      return
    }
    if (folders.value[0]) openTagsForPath(folders.value[0].path)
  })
})

onBeforeUnmount(() => {
  eventBus.clearAll()
  clearFocus()
})
</script>

<style scoped>
.folders-page__nav {
  padding: 0 var(--deck-pad-x, 14px) 8px;
}

.folders-page__crumbs {
  flex: 1;
  padding-bottom: 2px;
}

.folders-page__filters {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}

.folders-page__search {
  min-width: 120px;
  max-width: 200px;
  flex: 1 1 120px;
}

.folders-page__search :deep(.v-field) {
  --v-input-control-height: 36px;
}

.folders-page__search :deep(.v-field__input) {
  min-height: 36px !important;
  max-height: 36px;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 10px 6px !important;
  align-items: center;
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}

.folders-page__search :deep(.v-field__prepend-inner) {
  padding-top: 0;
  align-self: center;
}

.folders-page__search :deep(.v-field__prepend-inner .v-icon) {
  font-size: 16px !important;
}

.folders-page__sort {
  min-width: 150px;
  max-width: 200px;
}

.folders-page__sort :deep(.v-field) {
  --v-input-control-height: 36px;
}

.folders-page__sort :deep(.v-field__input) {
  min-height: 36px !important;
  max-height: 36px;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
  padding-inline: 10px 6px !important;
  align-items: center;
  font-size: 0.75rem !important;
  line-height: 1.2 !important;
}

.folders-page__sort :deep(.v-field__append-inner) {
  padding-top: 0;
  align-self: center;
}

.folders-page__sort :deep(.v-field__append-inner .v-icon) {
  font-size: 16px !important;
}

.folders-page__sort :deep(.v-select__selection) {
  font-size: 0.75rem;
  line-height: 1.2;
}

.folders-page__current-tags {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}

.folders-page__appearance-section {
  border-top: 1px solid rgba(var(--v-theme-primary), 0.12);
  border-bottom: 1px solid rgba(var(--v-theme-primary), 0.12);
  margin-bottom: 8px;
}

.folders-page__appearance-deck {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 12px 14px;
  padding: 10px 14px;
  background: rgba(var(--v-theme-primary), 0.03);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-group) {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  min-width: 0;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-group + .toolbar-appearance__deck-group) {
  padding-left: 14px;
  border-left: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-label) {
  font-size: 0.6875rem;
  font-weight: 400;
  letter-spacing: normal;
  text-transform: none;
  opacity: 0.55;
  padding-inline: 6px;
  line-height: 1.2;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-track),
.folders-page__appearance-deck :deep(.items-view-track) {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border-radius: 999px;
  background: rgba(var(--v-theme-surface), 0.9);
  border: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt),
.folders-page__appearance-deck :deep(.items-view-opt) {
  appearance: none;
  border: 0;
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 28px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: transparent;
  color: rgba(var(--v-theme-primary), 0.72);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1;
  white-space: nowrap;
  cursor: pointer;
  transition: background-color 120ms ease, color 120ms ease;
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt:hover),
.folders-page__appearance-deck :deep(.items-view-opt:hover) {
  background: rgba(var(--v-theme-primary), 0.08);
  color: rgb(var(--v-theme-primary));
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt--active),
.folders-page__appearance-deck :deep(.items-view-opt--active) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__appearance-deck :deep(.toolbar-appearance__deck-opt--active:hover),
.folders-page__appearance-deck :deep(.items-view-opt--active:hover) {
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-on-primary));
}

.folders-page__current-tags {
  padding: 0 var(--deck-pad-x, 14px) 10px;
}

.folders-page__actions {
  flex: 0 0 auto;
  margin-left: auto;
  max-width: 100%;
  overflow-x: auto;
}

.folders-page__status {
  padding: 32px 8px;
  text-align: center;
}

.folders-page__hidden-activator {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}
</style>
