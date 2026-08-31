<template>
  <v-navigation-drawer
    app
    clipped
    permanent
    :width="collapsed ? railWidth : fullWidth"
    class="sidebar-browser"
    :class="{'sidebar-browser--rail': collapsed}"
  >
    <div
      v-if="collapsed"
      class="sidebar-browser__rail"
    >
      <v-btn
        class="sidebar-browser__rail-btn"
        icon
        variant="text"
        size="small"
        :aria-label="t('browser_layout.expand_sidebar')"
        @click="toggleCollapsed"
      >
        <v-tooltip activator="parent" location="end">
          <span class="d-inline-flex align-center ga-2">
            <span>{{ t('browser_layout.expand_sidebar') }}</span>
            <v-hotkey keys="b" variant="flat"/>
          </span>
        </v-tooltip>
        <v-icon size="18">mdi-chevron-right</v-icon>
      </v-btn>

      <v-tooltip
        v-for="link in libraryLinks"
        :key="link.key"
        location="end"
      >
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            :to="link.to"
            :exact="Boolean(link.exact)"
            :active="isNavLinkActive(link)"
            icon
            :variant="isNavLinkActive(link) ? 'flat' : 'text'"
            :color="isNavLinkActive(link) ? 'primary' : undefined"
            size="small"
            class="sidebar-browser__rail-btn"
            :aria-label="link.title"
          >
            <v-icon
              size="20"
              :icon="link.icon"
            />
          </v-btn>
        </template>
        <span>{{ link.title }}</span>
      </v-tooltip>

      <div
        v-if="metaCategoryLinks.length"
        class="sidebar-browser__rail-divider"
      />

      <v-tooltip
        v-for="link in metaCategoryLinks"
        :key="link.key"
        location="end"
      >
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            :to="link.to"
            :exact="link.exact"
            :active="isNavLinkActive(link)"
            icon
            :variant="isNavLinkActive(link) ? 'flat' : 'text'"
            :color="isNavLinkActive(link) ? 'primary' : undefined"
            size="small"
            class="sidebar-browser__rail-btn"
            :aria-label="link.title"
          >
            <v-icon
              size="20"
              :icon="link.icon"
            />
          </v-btn>
        </template>
        <span>{{ link.title }}</span>
      </v-tooltip>

      <div class="sidebar-browser__rail-spacer" />

      <v-tooltip
        v-if="metaArray.length"
        location="end"
      >
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            :to="allTagsLink.to"
            :exact="allTagsLink.exact"
            :active="isAllTagsActive"
            icon
            :variant="isAllTagsActive ? 'flat' : 'text'"
            :color="isAllTagsActive ? 'primary' : undefined"
            size="small"
            class="sidebar-browser__rail-btn"
            :aria-label="allTagsLink.title"
          >
            <v-icon
              size="20"
              :icon="allTagsLink.icon"
            />
          </v-btn>
        </template>
        <span>{{ allTagsLink.title }}</span>
      </v-tooltip>

      <v-tooltip location="end">
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            :to="settingsLink.to"
            :active="isSettingsActive"
            icon
            :variant="isSettingsActive ? 'flat' : 'text'"
            :color="isSettingsActive ? 'primary' : undefined"
            size="small"
            class="sidebar-browser__rail-btn"
            :aria-label="settingsLink.title"
          >
            <v-icon
              size="20"
              :icon="settingsLink.icon"
            />
          </v-btn>
        </template>
        <span>{{ settingsLink.title }}</span>
      </v-tooltip>

      <v-tooltip
        v-if="showTrash"
        location="end"
      >
        <template #activator="{ props: tipProps }">
          <v-btn
            v-bind="tipProps"
            icon
            variant="text"
            size="small"
            class="sidebar-browser__rail-btn"
            :aria-label="trashLink.title"
            @click="openTrash()"
          >
            <v-icon
              size="20"
              :icon="trashLink.icon"
            />
          </v-btn>
        </template>
        <span>{{ trashLink.title }}</span>
      </v-tooltip>

      <template v-if="showInbox">
        <div class="sidebar-browser__rail-divider" />

        <v-tooltip location="end">
          <template #activator="{ props: tipProps }">
            <v-btn
              v-bind="tipProps"
              icon
              variant="text"
              size="small"
              class="sidebar-browser__rail-btn"
              :disabled="watcherBusy"
              :aria-label="t('media_inbox.nav')"
              @click="openInbox()"
            >
              <v-badge
                v-if="!watcherBusy"
                :content="inboxBadgeCount"
                :model-value="inboxBadgeCount > 0"
                color="success"
                location="top right"
              >
                <v-badge
                  :content="inboxLostCount"
                  :model-value="inboxLostCount > 0"
                  color="error"
                  location="bottom right"
                >
                  <v-icon size="20" icon="mdi-inbox-outline"/>
                </v-badge>
              </v-badge>
              <v-icon v-else size="20" icon="mdi-inbox-outline"/>
            </v-btn>
          </template>
          <span>{{ t('media_inbox.nav') }}</span>
        </v-tooltip>
      </template>
    </div>

    <div
      v-else
      class="sidebar-browser__scroll scrollable vertical"
    >
      <div class="scrollable-child">
        <v-list
          nav
          density="compact"
          class="sidebar-browser__nav"
        >
          <div class="sidebar-section sidebar-section--actions sidebar-section--library">
            <span class="sidebar-section__label">{{ t('navigation.section_library') }}</span>
            <div class="sidebar-section__actions">
              <v-btn
                icon
                size="x-small"
                data-feature-hint="edit-library-nav"
                :variant="libraryEditMode ? 'flat' : 'text'"
                :color="libraryEditMode ? 'primary' : undefined"
                :aria-label="libraryEditMode
                  ? t('navigation.done_editing_menu')
                  : t('navigation.edit_menu_items')"
                @click="libraryEditMode = !libraryEditMode"
              >
                <v-tooltip activator="parent" location="bottom">
                  {{ libraryEditMode
                    ? t('navigation.done_editing_menu')
                    : t('navigation.edit_menu_items') }}
                </v-tooltip>
                <v-icon size="16">
                  {{ libraryEditMode ? 'mdi-check' : 'mdi-pencil-outline' }}
                </v-icon>
              </v-btn>
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="t('browser_layout.collapse_sidebar')"
                @click="toggleCollapsed"
              >
                <v-tooltip activator="parent" location="bottom">
                  <span class="d-inline-flex align-center ga-2">
                    <span>{{ t('browser_layout.collapse_sidebar') }}</span>
                    <v-hotkey keys="b" variant="flat"/>
                  </span>
                </v-tooltip>
                <v-icon size="16">mdi-chevron-left</v-icon>
              </v-btn>
            </div>
          </div>

          <Draggable
            v-model="libraryEditRows"
            item-key="key"
            handle=".sidebar-browser__library-drag"
            :animation="200"
            ghost-class="sidebar-browser__library-ghost"
            :disabled="!libraryEditMode"
            @start="libraryDragging = true"
            @end="onLibraryReorderEnd"
          >
            <template #item="{element: link}">
              <v-list-item
                v-show="libraryEditMode || !link.hidden"
                :to="libraryEditMode ? undefined : link.to"
                :title="link.title"
                :exact="link.exact"
                :active="!libraryEditMode && isNavLinkActive(link)"
                :ripple="!libraryEditMode"
                color="primary"
                :link="!libraryEditMode"
                class="sidebar-browser__library-item"
                :class="{
                  'sidebar-browser__library-item--editing': libraryEditMode,
                  'sidebar-browser__library-item--hidden': link.hidden,
                }"
              >
                <template #prepend>
                  <v-icon
                    v-if="libraryEditMode"
                    size="16"
                    class="sidebar-browser__library-drag text-medium-emphasis"
                    :aria-label="t('navigation.reorder_library_item')"
                  >
                    mdi-drag-vertical
                  </v-icon>
                  <v-icon
                    :icon="link.icon"
                    size="24"
                  />
                </template>
                <template
                  v-if="!libraryEditMode && navCount(link.key) != null"
                  #append
                >
                  <span class="sidebar-browser__nav-count">{{ navCount(link.key) }}</span>
                </template>
                <template
                  v-else-if="libraryEditMode"
                  #append
                >
                  <v-btn
                    icon
                    size="x-small"
                    variant="text"
                    :aria-label="link.hidden
                      ? t('meta.settings.show_in_navigation')
                      : t('meta.settings.hide_in_navigation')"
                    :disabled="togglingLibraryKey === link.key"
                    @click.stop="onToggleLibraryHidden(link.key)"
                  >
                    <v-icon size="16">
                      {{ link.hidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}
                    </v-icon>
                  </v-btn>
                </template>
              </v-list-item>
            </template>
          </Draggable>
        </v-list>

        <div class="sidebar-browser__tags">
          <div class="sidebar-section sidebar-section--actions sidebar-section--tags">
            <span class="sidebar-section__label">{{ t('navigation.section_tags') }}</span>
            <div class="sidebar-section__actions">
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="tagsAllExpanded
                  ? t('browser_layout.collapse_all_categories')
                  : t('browser_layout.expand_all_categories')"
                @click="toggleAllTagCategories"
              >
                <v-tooltip activator="parent" location="bottom">
                  {{ tagsAllExpanded
                    ? t('browser_layout.collapse_all_categories')
                    : t('browser_layout.expand_all_categories') }}
                </v-tooltip>
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
                  ? t('navigation.done_editing_menu')
                  : t('navigation.edit_menu_items')"
                @click="tagsEditMode = !tagsEditMode"
              >
                <v-tooltip activator="parent" location="bottom">
                  {{ tagsEditMode
                    ? t('navigation.done_editing_menu')
                    : t('navigation.edit_menu_items') }}
                </v-tooltip>
                <v-icon size="16">
                  {{ tagsEditMode ? 'mdi-check' : 'mdi-pencil-outline' }}
                </v-icon>
              </v-btn>
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="t('all_tags.add_category')"
                @click="openCreateCategoryFromSidebar"
              >
                <v-tooltip activator="parent" location="bottom">
                  {{ t('all_tags.add_category') }}
                </v-tooltip>
                <v-icon size="16">mdi-plus</v-icon>
              </v-btn>
              <v-btn
                icon
                size="x-small"
                :to="allTagsLink.to"
                :exact="allTagsLink.exact"
                :variant="isAllTagsActive ? 'flat' : 'text'"
                :color="isAllTagsActive ? 'primary' : undefined"
                :aria-label="allTagsLink.title"
              >
                <v-tooltip activator="parent" location="bottom">
                  {{ allTagsLink.title }}
                </v-tooltip>
                <v-icon size="16">{{ allTagsLink.icon }}</v-icon>
              </v-btn>
            </div>
          </div>

          <div class="sidebar-browser__tags-panel">
            <SidebarTagsBrowser
              ref="tagsBrowserRef"
              :edit-mode="tagsEditMode"
              @all-expanded-change="tagsAllExpanded = $event"
            />
          </div>
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
            :active="isSettingsActive"
            color="primary"
            link
          />

          <v-list-item
            v-if="showTrash"
            :prepend-icon="trashLink.icon"
            :title="trashLink.title"
            @click="openTrash()"
          />

          <v-list-item
            v-if="showInbox"
            :disabled="watcherBusy"
            :title="t('media_inbox.nav')"
            @click="openInbox()"
            @mouseover="inboxHovered = true"
            @mouseleave="inboxHovered = false"
          >
            <template #prepend>
              <v-badge
                v-if="!watcherBusy"
                :content="inboxBadgeCount"
                :model-value="inboxBadgeCount > 0"
                :dot="!inboxHovered"
                color="success"
                location="top right"
              >
                <v-badge
                  :content="inboxLostCount"
                  :model-value="inboxLostCount > 0"
                  :dot="!inboxHovered"
                  color="error"
                  location="bottom right"
                >
                  <v-icon icon="mdi-inbox-outline"/>
                </v-badge>
              </v-badge>
              <v-icon v-else icon="mdi-inbox-outline"/>
            </template>
          </v-list-item>
        </v-list>
      </div>
    </div>
  </v-navigation-drawer>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useMarksStore} from '@/stores/marks'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import {
  useLibraryNavItems,
  type LibraryNavEditItem,
  type LibraryNavLink,
} from '@/composable/useLibraryNavItems'
import {isLibraryNavLinkActive} from '@/utils/libraryNavActive'
import {typedApi} from '@/services/typedApi'
import {useEventBus} from '@/utils/eventBus'
import SidebarTagsBrowser from '@/components/app/SidebarTagsBrowser.vue'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const tagsEditMode = ref(false)
const libraryEditMode = ref(false)
const libraryDragging = ref(false)
const libraryEditRows = ref<LibraryNavEditItem[]>([])
const togglingLibraryKey = ref<string | null>(null)
const tagsAllExpanded = ref(true)
const inboxHovered = ref(false)
const tagsBrowserRef = ref<{
  toggleAllCategories: () => void
  openCreateCategory: () => void
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
const settingsStore = useSettingsStore()
const eventBus = useEventBus()

const fullWidth = 260
const railWidth = 52

const collapsed = computed(() => settingsStore.sidebarCollapsed === '1')

function toggleCollapsed(): void {
  void setOption(collapsed.value ? '0' : '1', 'sidebarCollapsed')
}

function isNavLinkActive(link: LibraryNavLink): boolean {
  return isLibraryNavLinkActive(link, route)
}

const isSettingsActive = computed(() => route.path.startsWith('/settings'))

const {
  metaArray,
  metaVisibleLeaves,
  mediaTypes,
  libraryLinks,
  libraryEditItems,
  settingsLink,
  allTagsLink,
  trashLink,
  metaLink,
  showTrash,
  showInbox,
  inboxBadgeCount,
  inboxLostCount,
  watcherBusy,
  openInbox,
  openTrash,
  setLibraryNavOrder,
  toggleLibraryNavHidden,
} = useLibraryNavItems()

const metaCategoryLinks = computed(() =>
  metaVisibleLeaves.value.map((meta) => metaLink(meta)),
)

function libraryEditItemsEqual(a: LibraryNavEditItem[], b: LibraryNavEditItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].key !== b[i].key) return false
    if (a[i].hidden !== b[i].hidden) return false
    if (a[i].title !== b[i].title) return false
    if (a[i].icon !== b[i].icon) return false
  }
  return true
}

watch(
  libraryEditItems,
  (items) => {
    if (libraryDragging.value) return
    if (libraryEditItemsEqual(libraryEditRows.value, items)) return
    libraryEditRows.value = items.map((item) => ({...item}))
  },
  {immediate: true},
)

async function onLibraryReorderEnd(): Promise<void> {
  libraryDragging.value = false
  await setLibraryNavOrder(libraryEditRows.value.map((item) => item.key))
}

async function onToggleLibraryHidden(key: string): Promise<void> {
  if (togglingLibraryKey.value === key) return
  togglingLibraryKey.value = key
  try {
    await toggleLibraryNavHidden(key)
  } finally {
    togglingLibraryKey.value = null
  }
}

const isAllTagsActive = computed(() => route.path === '/tags')

function toggleAllTagCategories() {
  tagsBrowserRef.value?.toggleAllCategories()
}

function openCreateCategoryFromSidebar() {
  tagsBrowserRef.value?.openCreateCategory()
}

const activeMediaTypeKey = computed(() => {
  if (itemsStore.type !== 'media') return null
  const id = Number(itemsStore.environment?.media_type_id)
  if (!Number.isFinite(id) || id <= 0) return null
  return `media-${id}`
})

const hasActiveMediaFilters = computed(() => {
  if ((itemsStore.filters || []).some((filter) => filter?.active)) return true
  if (itemsStore.find_duplicates) return true
  return Boolean(itemsStore.listScopeIds?.length)
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
  eventBus.on('library:nav-counts-changed', loadNavCounts)
})

onUnmounted(() => {
  eventBus.off('library:nav-counts-changed', loadNavCounts)
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

  :deep(.v-navigation-drawer__content) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  :deep(.sidebar-browser__nav) {
    padding-bottom: 12px;
  }
}

.sidebar-browser--rail {
  :deep(.v-navigation-drawer__content) {
    overflow: hidden;
  }
}

.sidebar-browser__rail {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  height: 100%;
  padding: 8px 0 12px;
  box-sizing: border-box;
}

.sidebar-browser__rail-spacer {
  flex: 1 1 auto;
  min-height: 8px;
}

.sidebar-browser__rail-btn {
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;

  &.v-btn--variant-text.v-btn--active {
    color: inherit;

    .v-btn__overlay {
      opacity: 0;
    }
  }
}

.sidebar-browser__rail-divider {
  width: 24px;
  height: 1px;
  margin: 4px 0;
  background: rgba(var(--v-theme-on-surface), 0.12);
  flex-shrink: 0;
}

.sidebar-browser__scroll {
  flex: 1;
  min-height: 0;
  height: auto;
}

.sidebar-section {
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: none;
  height: 28px;
  min-height: 28px;
  padding-inline: 16px;
  opacity: 0.65;
}

.sidebar-section--library {
  margin-top: 4px;
}

.sidebar-browser__library-item--hidden {
  opacity: 0.55;
}

.sidebar-browser__library-item--editing {
  :deep(.v-list-item__prepend) {
    width: auto;
    column-gap: 2px;
  }

  :deep(.v-list-item__spacer) {
    width: 8px;
  }

  :deep(.v-list-item__append) {
    margin-inline-start: 4px;
  }
}

.sidebar-browser__library-drag {
  flex-shrink: 0;
  cursor: grab;
  margin-inline-end: 2px;
}

.sidebar-browser__library-ghost {
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
  margin: 0 0 4px;
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
