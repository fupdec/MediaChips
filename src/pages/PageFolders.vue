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

          <div class="d-flex align-center flex-nowrap ga-1 folders-page__type-chips">
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
            <v-btn
              color="primary"
              :variant="itemsStore.isSelect ? 'flat' : 'tonal'"
              size="small"
              rounded="xl"
              class="folders-page__select"
              :disabled="!media.length"
              v-tooltip:top="itemsStore.isSelect
                ? t('appbar.buttons.unselect')
                : t('appbar.buttons.select')"
              @click="itemsStore.toggleSelectMode()"
            >
              <v-icon
                size="18"
                :start="true"
                :icon="itemsStore.isSelect ? 'mdi-close' : 'mdi-checkbox-marked-outline'"
              />
              <span>
                {{ itemsStore.isSelect ? t('appbar.buttons.unselect') : t('appbar.buttons.select') }}
              </span>
            </v-btn>
          </div>
        </div>

        <div class="folders-page__nav d-flex align-center ga-2 flex-nowrap min-width-0">
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
      </div>
    </div>

    <div
      v-if="loading"
      class="folders-page__status text-medium-emphasis"
    >
      {{ t('folders_browser.loading') }}
    </div>

    <div
      v-else-if="!folders.length && !media.length"
      class="folders-page__status text-medium-emphasis"
    >
      {{ currentPath ? t('folders_browser.empty_folder') : t('folders_browser.empty_library') }}
    </div>

    <FoldersVirtualGrid
      v-else
      :folders="folders"
      :media="media"
      :size="itemsStore.size"
      :gap-size="settingsStore.gapSize"
      :reg="registrationStore.reg"
      class="items-page-grid"
      @open-folder="navigateTo"
    />
  </v-container>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute, useRouter} from 'vue-router'
import FoldersVirtualGrid from '@/components/folders/FoldersVirtualGrid.vue'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useRegistrationStore} from '@/stores/registration'
import {useStickyControlDeck} from '@/composable/useStickyControlDeck'
import {typedApi} from '@/services/typedApi'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type {MediaType} from '@/types/media'
import type {MediaItem} from '@/types/stores'

type FolderEntry = {
  path: string
  name: string
  mediaCount: number
}

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
const folders = ref<FolderEntry[]>([])
const media = ref<MediaItem[]>([])

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

const entryCount = computed(() => folders.value.length + media.value.length)

const pageTitle = computed(() => {
  if (!currentPath.value) return t('navigation.folders')
  const last = breadcrumbs.value[breadcrumbs.value.length - 1]
  return last?.name || t('navigation.folders')
})

function mediaTypeTitle(mediaType: MediaType) {
  return getMediaTypeName(mediaType, t)
}

function navigateTo(path: string | null) {
  itemsStore.clearSelection()
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
  if (currentPath.value) {
    navigateTo(null)
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
  itemsStore.total = items.length
  itemsStore.totalFiltered = items.length
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
    syncPlaylist(nextMedia)
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

watch(
  () => [pathFromQuery.value, mediaTypeId.value, appStore.is_app_ready] as const,
  () => {
    void loadFolder()
  },
  {immediate: true},
)
</script>

<style scoped>
.folders-page__nav {
  padding: 0 var(--deck-pad-x, 14px) 12px;
}

.folders-page__crumbs {
  flex: 1;
  padding-bottom: 2px;
}

.folders-page__type-chips {
  flex-shrink: 1;
  overflow-x: auto;
  max-width: 55%;
}

.folders-page__select {
  flex: 0 0 auto;
  font-size: 0.75rem !important;
}

.folders-page__status {
  padding: 32px 8px;
  text-align: center;
}
</style>
