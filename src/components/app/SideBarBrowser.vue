<template>
  <v-navigation-drawer
    app
    clipped
    permanent
    width="260"
    class="sidebar-browser"
  >
    <div class="sidebar-browser__scroll scrollable vertical">
      <div class="scrollable-child">
        <v-list
          nav
          density="compact"
          class="sidebar-browser__nav"
        >
          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_library') }}
          </v-list-subheader>

          <v-list-item
            v-for="link in libraryLinks"
            :key="link.key"
            :to="link.to"
            :prepend-icon="link.icon"
            :title="link.title"
            :exact="link.exact"
            color="primary"
            link
          >
            <template
              v-if="navCount(link.key) != null"
              #append
            >
              <span class="sidebar-browser__nav-count">{{ navCount(link.key) }}</span>
            </template>
          </v-list-item>

          <template v-if="metaArray.length">
            <div class="sidebar-section sidebar-section--actions">
              <span class="sidebar-section__label">{{ t('navigation.section_tags') }}</span>
              <div class="sidebar-section__actions">
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  :aria-label="tagsAllExpanded
                    ? t('browser_layout.collapse_all_categories')
                    : t('browser_layout.expand_all_categories')"
                  :title="tagsAllExpanded
                    ? t('browser_layout.collapse_all_categories')
                    : t('browser_layout.expand_all_categories')"
                  @click="toggleAllTagCategories"
                >
                  <v-icon size="16">
                    {{ tagsAllExpanded ? 'mdi-unfold-less-horizontal' : 'mdi-unfold-more-horizontal' }}
                  </v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="x-small"
                  :variant="tagsEditMode ? 'flat' : 'text'"
                  :color="tagsEditMode ? 'primary' : undefined"
                  :aria-label="tagsEditMode
                    ? t('all_tags.done_editing_categories')
                    : t('all_tags.edit_categories')"
                  :title="tagsEditMode
                    ? t('all_tags.done_editing_categories')
                    : t('all_tags.edit_categories')"
                  @click="tagsEditMode = !tagsEditMode"
                >
                  <v-icon size="16">
                    {{ tagsEditMode ? 'mdi-check' : 'mdi-pencil-outline' }}
                  </v-icon>
                </v-btn>
                <v-btn
                  icon
                  size="x-small"
                  :to="allTagsLink.to"
                  :exact="allTagsLink.exact"
                  :variant="isAllTagsActive ? 'flat' : 'text'"
                  :color="isAllTagsActive ? 'primary' : undefined"
                  :aria-label="allTagsLink.title"
                  :title="allTagsLink.title"
                >
                  <v-icon size="16">{{ allTagsLink.icon }}</v-icon>
                </v-btn>
              </div>
            </div>
          </template>
        </v-list>

        <div
          v-if="metaArray.length"
          class="sidebar-browser__tags-panel"
        >
          <SidebarTagsBrowser
            ref="tagsBrowserRef"
            :edit-mode="tagsEditMode"
            @all-expanded-change="tagsAllExpanded = $event"
          />
        </div>

        <v-list
          nav
          density="compact"
          class="sidebar-browser__system"
        >
          <v-list-subheader class="sidebar-section">
            {{ t('navigation.section_system') }}
          </v-list-subheader>

          <v-list-item
            :to="settingsLink.to"
            :prepend-icon="settingsLink.icon"
            :title="settingsLink.title"
            color="primary"
            link
          />

          <div
            v-if="showWatcherFolders"
            @mouseover="folderHovered = true"
            @mouseleave="folderHovered = false"
          >
            <v-list-item
              v-for="f in watcherFiles"
              :key="f.folder.id"
              :disabled="watcherBusy"
              @click="openDialogFolder(f)"
            >
              <template #prepend>
                <v-badge
                  v-if="!watcherBusy"
                  :content="watcherBadgeCountsByFolderId[f.folder.id]?.new ?? 0"
                  :model-value="Boolean(watcherBadgeCountsByFolderId[f.folder.id]?.new)"
                  :dot="!folderHovered"
                  color="success"
                  location="top right"
                >
                  <v-badge
                    v-if="!watcherBusy"
                    :content="watcherBadgeCountsByFolderId[f.folder.id]?.lost ?? 0"
                    :model-value="Boolean(watcherBadgeCountsByFolderId[f.folder.id]?.lost)"
                    :dot="!folderHovered"
                    color="error"
                    location="bottom right"
                  >
                    <v-icon>mdi-folder-outline</v-icon>
                  </v-badge>
                </v-badge>
                <v-icon v-else>mdi-folder-sync-outline</v-icon>
              </template>
              <template #title>
                {{ f.folder.name }}
              </template>
            </v-list-item>
          </div>
        </v-list>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useMarksStore} from '@/stores/marks'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {typedApi} from '@/services/typedApi'
import SidebarTagsBrowser from '@/components/app/SidebarTagsBrowser.vue'

const folderHovered = ref(false)
const tagsEditMode = ref(false)
const tagsAllExpanded = ref(true)
const tagsBrowserRef = ref<{
  toggleAllCategories: () => void
} | null>(null)
const baseNavCounts = ref<Record<string, number>>({})
/** Filtered media-type counts kept after leaving /media until filters are cleared. */
const filteredMediaCounts = ref<Record<string, number>>({})
/** Filtered markers count kept after leaving /markers until filters/search are cleared. */
const filteredMarkersCount = ref<number | null>(null)
const {t} = useI18n()
const route = useRoute()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const marksStore = useMarksStore()

const {
  metaArray,
  mediaTypes,
  libraryLinks,
  settingsLink,
  allTagsLink,
  watcherFiles,
  showWatcherFolders,
  watcherBadgeCountsByFolderId,
  watcherBusy,
  openDialogFolder,
} = useLibraryNavItems()

const isAllTagsActive = computed(() => route.path === '/tags')

function toggleAllTagCategories() {
  tagsBrowserRef.value?.toggleAllCategories()
}

const activeMediaTypeKey = computed(() => {
  if (itemsStore.type !== 'media') return null
  const id = Number(itemsStore.environment?.media_type_id)
  if (!Number.isFinite(id) || id <= 0) return null
  return `media-${id}`
})

const hasActiveMediaFilters = computed(() => {
  if ((itemsStore.filters || []).some((filter) => filter?.active)) return true
  return Boolean(itemsStore.find_duplicates)
})

const hasActiveMarkerFilters = computed(() => {
  if (String(marksStore.search || '').trim()) return true

  const defaults = marksStore.getDefaultTypes(marksStore.filterMetas)
  const selected = marksStore.selectedTypes.map(String)
  if (!selected.length) return true
  if (selected.length !== defaults.length) return true

  const selectedSet = new Set(selected)
  return defaults.some((type) => !selectedSet.has(String(type)))
})

const navCounts = computed(() => {
  const next = {
    ...baseNavCounts.value,
    ...filteredMediaCounts.value,
  }

  if (filteredMarkersCount.value != null) {
    next.markers = filteredMarkersCount.value
  }

  return next
})

function navCount(key: string): number | null {
  if (!(key in navCounts.value)) return null
  return navCounts.value[key]
}

function syncFilteredMediaCount() {
  if (!route.path.startsWith('/media')) return
  const key = activeMediaTypeKey.value
  if (!key || !itemsStore.isFiltersLoaded) return

  if (hasActiveMediaFilters.value) {
    filteredMediaCounts.value = {
      ...filteredMediaCounts.value,
      [key]: Number(itemsStore.totalFiltered) || 0,
    }
    return
  }

  if (!(key in filteredMediaCounts.value)) return
  const {[key]: _removed, ...rest} = filteredMediaCounts.value
  filteredMediaCounts.value = rest
}

function syncFilteredMarkersCount() {
  if (!route.path.startsWith('/markers')) return
  if (!marksStore.isLoaded) return

  if (hasActiveMarkerFilters.value) {
    filteredMarkersCount.value = Number(marksStore.totalFiltered) || 0
    return
  }

  filteredMarkersCount.value = null
}

async function loadNavCounts() {
  try {
    const [statsResponse, dynamicPlaylistsResponse, marksResponse] = await Promise.all([
      typedApi.getHomeExtendedStats(),
      typedApi.getDynamicPlaylistsBasic().catch(async (error: unknown) => {
        const status = (error as {response?: {status?: number}})?.response?.status
        if (status === 404) {
          return typedApi.getDynamicPlaylists().catch(() => ({data: [] as unknown[]}))
        }
        return {data: [] as unknown[]}
      }),
      typedApi.postMarkItems({
        types: ['favorite', 'bookmark'],
        sortBy: 'time',
        sortDir: 'desc',
        search: '',
        page: 1,
        limit: 1,
      }).catch(() => null),
    ])

    const next: Record<string, number> = {}

    for (const mediaType of mediaTypes.value) {
      next[`media-${mediaType.id}`] = 0
    }

    for (const row of statsResponse.data.byType || []) {
      const id = Number(row.mediaTypeId)
      if (!Number.isFinite(id)) continue
      next[`media-${id}`] = Number(row.count) || 0
    }

    const dynamicCount = Array.isArray(dynamicPlaylistsResponse.data)
      ? dynamicPlaylistsResponse.data.length
      : 0
    next.playlists = (appStore.playlists?.length || 0) + dynamicCount

    if (marksResponse?.data?.total != null) {
      next.markers = Number(marksResponse.data.total) || 0
    } else {
      next.markers = 0
    }

    baseNavCounts.value = next
    syncFilteredMediaCount()
    syncFilteredMarkersCount()
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  void loadNavCounts()
})

watch(
  () => [
    activeMediaTypeKey.value,
    itemsStore.totalFiltered,
    itemsStore.isFiltersLoaded,
    hasActiveMediaFilters.value,
    route.path,
  ],
  () => {
    syncFilteredMediaCount()
  },
)

watch(
  () => [
    marksStore.totalFiltered,
    marksStore.isLoaded,
    marksStore.search,
    marksStore.selectedTypes.slice(),
    marksStore.filterMetas.length,
    hasActiveMarkerFilters.value,
    route.path,
  ],
  () => {
    syncFilteredMarkersCount()
  },
)

watch(
  () => mediaTypes.value.map((item) => item.id).join(','),
  () => {
    void loadNavCounts()
  },
)

watch(
  () => route.fullPath,
  (path, prev) => {
    if (path === prev) return
    const touchesLibrary = (
      path.startsWith('/media')
      || prev?.startsWith('/media')
      || path.startsWith('/playlists')
      || prev?.startsWith('/playlists')
      || path.startsWith('/markers')
      || prev?.startsWith('/markers')
      || path === '/'
      || prev === '/'
    )
    if (touchesLibrary) void loadNavCounts()
  },
)
</script>

<style scoped lang="scss">
.sidebar-browser {
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.08) !important;

  :deep(a.v-list-item),
  :deep(.v-list-item--link) {
    text-decoration: none;
  }

  :deep(.sidebar-browser__nav) {
    padding-bottom: 0;
  }
}

.sidebar-browser__scroll {
  height: 100%;
}

:deep(.v-navigation-drawer__content) {
  overflow: hidden;
}

.sidebar-section {
  font-size: 0.65rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  height: 28px;
  min-height: 28px;
  padding-inline: 16px;
  opacity: 0.55;
}

.sidebar-section--actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: auto;
  min-height: 32px;
  margin-bottom: 4px;
  opacity: 1;
  padding-inline: 8px 4px;
  overflow: visible;
}

.sidebar-section__label {
  opacity: 0.55;
  min-width: 0;
}

.sidebar-section__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
}

.sidebar-browser__tags-panel {
  margin: 2px 0 4px;
  padding-inline: 8px;
}

.sidebar-browser__system {
  padding-bottom: 12px;
}

.sidebar-browser__nav-count {
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
</style>
