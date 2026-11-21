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
      <v-tooltip
        v-for="link in railLibraryLinks"
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
            variant="text"
            size="small"
            class="sidebar-browser__rail-btn"
            :class="{'sidebar-browser__rail-btn--active': isNavLinkActive(link)}"
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
        v-if="railMetaCategoryLinks.length"
        class="sidebar-browser__rail-divider"
      />

      <v-tooltip
        v-for="link in railMetaCategoryLinks"
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
            variant="text"
            size="small"
            class="sidebar-browser__rail-btn"
            :class="{'sidebar-browser__rail-btn--active': isNavLinkActive(link)}"
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
            variant="text"
            size="small"
            class="sidebar-browser__rail-btn"
            :class="{'sidebar-browser__rail-btn--active': isAllTagsActive}"
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
            variant="text"
            size="small"
            class="sidebar-browser__rail-btn"
            :class="{'sidebar-browser__rail-btn--active': isSettingsActive}"
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

      <v-tooltip
        v-if="showInbox"
        location="end"
      >
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

      <div class="sidebar-browser__rail-divider" />

      <v-btn
        class="sidebar-browser__rail-btn sidebar-browser__rail-btn--muted"
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
        <v-icon size="18">mdi-dock-left</v-icon>
      </v-btn>
    </div>

    <div
      v-else
      class="sidebar-browser__expanded"
    >
      <section class="sidebar-browser__group sidebar-browser__group--library">
        <div class="sidebar-section">
          <button
            type="button"
            class="sidebar-section__toggle"
            :aria-expanded="libraryOpen || libraryEditMode"
            @click="libraryOpen = !libraryOpen"
          >
            <v-icon
              size="14"
              class="sidebar-section__chevron"
              :class="{'sidebar-section__chevron--closed': !libraryOpen && !libraryEditMode}"
            >
              mdi-chevron-down
            </v-icon>
            <span class="sidebar-section__label">{{ t('navigation.section_library') }}</span>
          </button>
          <div
            v-if="advancedUi"
            class="sidebar-section__actions"
            :class="{'sidebar-section__actions--pinned': libraryEditMode}"
          >
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
          </div>
        </div>

        <v-expand-transition>
          <div v-show="libraryOpen || libraryEditMode">
            <v-list
              nav
              density="compact"
              class="sidebar-browser__nav"
            >
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
                    v-show="libraryEditMode || (!link.hidden && !isSimpleHiddenLink(link.key))"
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
                        size="20"
                      />
                    </template>
                    <template
                      v-if="!libraryEditMode && navCount(link.key) != null"
                      #append
                    >
                      <span
                        class="sidebar-browser__nav-count"
                        :title="String(navCount(link.key))"
                      >{{ formatCount(navCount(link.key)!) }}</span>
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
          </div>
        </v-expand-transition>
      </section>

      <section
        v-if="!advancedUi"
        class="sidebar-browser__group sidebar-browser__more"
      >
        <div class="sidebar-section">
          <button
            type="button"
            class="sidebar-section__toggle"
            :aria-expanded="moreOpen"
            @click="moreOpen = !moreOpen"
          >
            <v-icon
              size="14"
              class="sidebar-section__chevron"
              :class="{'sidebar-section__chevron--closed': !moreOpen}"
            >
              mdi-chevron-down
            </v-icon>
            <span class="sidebar-section__label">{{ t('navigation.more') }}</span>
          </button>
        </div>

        <v-expand-transition>
          <div v-show="moreOpen">
            <v-list
              nav
              density="compact"
              class="sidebar-browser__nav"
            >
              <v-list-item
                :to="allTagsLink.to"
                :title="allTagsLink.title"
                :exact="allTagsLink.exact"
                :active="isAllTagsActive"
                color="primary"
                link
              >
                <template #prepend>
                  <v-icon
                    :icon="allTagsLink.icon"
                    size="20"
                  />
                </template>
              </v-list-item>
              <v-list-item
                v-if="simpleMarkersLink"
                :to="simpleMarkersLink.to"
                :title="simpleMarkersLink.title"
                :exact="simpleMarkersLink.exact"
                :active="isNavLinkActive(simpleMarkersLink)"
                color="primary"
                link
              >
                <template #prepend>
                  <v-icon
                    :icon="simpleMarkersLink.icon"
                    size="20"
                  />
                </template>
              </v-list-item>
            </v-list>
          </div>
        </v-expand-transition>
      </section>

      <section
        v-if="advancedUi"
        class="sidebar-browser__group sidebar-browser__tags"
        :class="{'sidebar-browser__tags--closed': !tagsOpen}"
      >
        <div class="sidebar-section">
          <button
            type="button"
            class="sidebar-section__toggle"
            :aria-expanded="tagsOpen"
            @click="tagsOpen = !tagsOpen"
          >
            <v-icon
              size="14"
              class="sidebar-section__chevron"
              :class="{'sidebar-section__chevron--closed': !tagsOpen}"
            >
              mdi-chevron-down
            </v-icon>
            <span class="sidebar-section__label">{{ t('navigation.section_tags') }}</span>
          </button>
          <div
            class="sidebar-section__actions"
            :class="{'sidebar-section__actions--pinned': tagsEditMode}"
          >
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

        <div
          v-show="tagsOpen"
          class="sidebar-browser__scroll scrollable vertical"
        >
          <div class="scrollable-child">
            <div class="sidebar-browser__tags-panel">
              <SidebarTagsBrowser
                ref="tagsBrowserRef"
                :edit-mode="tagsEditMode"
                @all-expanded-change="tagsAllExpanded = $event"
              />
            </div>
          </div>
        </div>
      </section>

      <div class="sidebar-browser__footer">
        <router-link
          :to="settingsLink.to"
          class="sidebar-browser__footer-main"
          :class="{'sidebar-browser__footer-main--active': isSettingsActive}"
          draggable="false"
        >
          <v-icon
            size="20"
            :icon="settingsLink.icon"
          />
          <span class="sidebar-browser__footer-label">{{ settingsLink.title }}</span>
        </router-link>

        <v-btn
          v-if="showInbox"
          icon
          variant="text"
          size="small"
          class="sidebar-browser__footer-btn"
          :disabled="watcherBusy"
          :aria-label="t('media_inbox.nav')"
          @click="openInbox()"
        >
          <v-tooltip activator="parent" location="top">
            {{ t('media_inbox.nav') }}
          </v-tooltip>
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

        <v-btn
          v-if="showTrash"
          icon
          variant="text"
          size="small"
          class="sidebar-browser__footer-btn"
          :aria-label="trashLink.title"
          @click="openTrash()"
        >
          <v-tooltip activator="parent" location="top">
            {{ trashLink.title }}
          </v-tooltip>
          <v-icon size="20" :icon="trashLink.icon"/>
        </v-btn>

        <v-btn
          icon
          variant="text"
          size="small"
          class="sidebar-browser__footer-btn"
          :aria-label="t('browser_layout.collapse_sidebar')"
          @click="toggleCollapsed"
        >
          <v-tooltip activator="parent" location="top">
            <span class="d-inline-flex align-center ga-2">
              <span>{{ t('browser_layout.collapse_sidebar') }}</span>
              <v-hotkey keys="b" variant="flat"/>
            </span>
          </v-tooltip>
          <v-icon size="18">mdi-dock-left</v-icon>
        </v-btn>
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
const tagsBrowserRef = ref<{
  toggleAllCategories: () => void
  openCreateCategory: () => void
} | null>(null)
const baseNavCounts = ref<Record<string, number>>({})
/** Filtered media-type counts kept after leaving /media until filters are cleared. */
const filteredMediaCounts = ref<Record<string, number>>({})
/** Filtered markers count kept after leaving /markers until filters/search are cleared. */
const filteredMarkersCount = ref<number | null>(null)
let navCountsRequestToken = 0
let navCountsTimer: ReturnType<typeof setTimeout> | null = null
const {t, locale} = useI18n()
const route = useRoute()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const marksStore = useMarksStore()
const settingsStore = useSettingsStore()
const eventBus = useEventBus()

const fullWidth = 260
const railWidth = 52

const collapsed = computed(() => settingsStore.sidebarCollapsed === '1')

// Simple mode keeps the sidebar to the essentials: tag categories, library editing and
// markers are for the advanced interface. All tags and markers stay one click away under "More".
const advancedUi = computed(() => settingsStore.advancedUi === '1')
const SIMPLE_HIDDEN_LIBRARY_KEYS = ['markers']
function isSimpleHiddenLink(key: string): boolean {
  return !advancedUi.value && SIMPLE_HIDDEN_LIBRARY_KEYS.includes(key)
}
const moreOpen = ref(false)

const LIBRARY_OPEN_STORAGE_KEY = 'mediachips.sidebarLibraryOpen'

function readLibraryOpen(): boolean {
  try {
    return localStorage.getItem(LIBRARY_OPEN_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

const libraryOpen = ref(readLibraryOpen())

watch(libraryOpen, (open) => {
  try {
    localStorage.setItem(LIBRARY_OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // storage unavailable — keep in-memory state only
  }
})

const TAGS_OPEN_STORAGE_KEY = 'mediachips.sidebarTagsOpen'

function readTagsOpen(): boolean {
  try {
    return localStorage.getItem(TAGS_OPEN_STORAGE_KEY) !== '0'
  } catch {
    return true
  }
}

const tagsOpen = ref(readTagsOpen())

watch(tagsOpen, (open) => {
  try {
    localStorage.setItem(TAGS_OPEN_STORAGE_KEY, open ? '1' : '0')
  } catch {
    // storage unavailable — keep in-memory state only
  }
})

function formatCount(value: number): string {
  try {
    return value.toLocaleString(locale.value)
  } catch {
    return String(value)
  }
}

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
const railMetaCategoryLinks = computed(() => (advancedUi.value ? metaCategoryLinks.value : []))
const railLibraryLinks = computed(() => libraryLinks.value.filter((link) => !isSimpleHiddenLink(link.key)))
const simpleMarkersLink = computed(() => libraryLinks.value.find((link) => link.key === 'markers'))

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

watch(tagsEditMode, (editing) => {
  if (editing) tagsOpen.value = true
})

function openCreateCategoryFromSidebar() {
  tagsOpen.value = true
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
  const token = ++navCountsRequestToken
  try {
    const {data} = await typedApi.getHomeNavCounts()
    if (token !== navCountsRequestToken) return

    const next: Record<string, number> = {}

    for (const mediaType of mediaTypes.value) {
      next[`media-${mediaType.id}`] = 0
    }

    for (const row of data.byType || []) {
      const id = Number(row.mediaTypeId)
      if (!Number.isFinite(id)) continue
      next[`media-${id}`] = Number(row.count) || 0
    }

    next.playlists = Number(data.playlists) || 0
    next.markers = Number(data.markers) || 0

    baseNavCounts.value = next
    syncFilteredMediaCount()
    syncFilteredMarkersCount()
  } catch (error) {
    if (token !== navCountsRequestToken) return
    console.error(error)
  }
}

function scheduleLoadNavCounts() {
  if (navCountsTimer != null) clearTimeout(navCountsTimer)
  navCountsTimer = setTimeout(() => {
    navCountsTimer = null
    void loadNavCounts()
  }, 150)
}

onMounted(() => {
  void loadNavCounts()
  eventBus.on('library:nav-counts-changed', scheduleLoadNavCounts)
})

onUnmounted(() => {
  if (navCountsTimer != null) clearTimeout(navCountsTimer)
  eventBus.off('library:nav-counts-changed', scheduleLoadNavCounts)
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
    scheduleLoadNavCounts()
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
    if (touchesLibrary) scheduleLoadNavCounts()
  },
)
</script>

<style scoped lang="scss">
.sidebar-browser {
  --sb-hover: rgba(var(--v-theme-on-surface), 0.06);
  --sb-active-bg: rgba(var(--v-theme-primary), 0.12);
  --sb-active-fg: rgb(var(--v-theme-primary));
  --sb-border: rgba(var(--v-theme-on-surface), 0.08);
  --sb-radius: 10px;

  border-right: 1px solid var(--sb-border) !important;
  transition-property: width, transform !important;
  transition-duration: 0.18s !important;

  :deep(a.v-list-item),
  :deep(.v-list-item--link) {
    text-decoration: none;
  }

  :deep(.v-navigation-drawer__content) {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
}

/* ---------- Rail (collapsed) ---------- */

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
  padding: 10px 0;
  box-sizing: border-box;
  overflow-y: auto;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.sidebar-browser__rail-spacer {
  flex: 1 1 auto;
  min-height: 8px;
}

.sidebar-browser__rail-btn {
  position: relative;
  flex-shrink: 0;
  width: 40px !important;
  height: 40px !important;
  min-width: 40px !important;
  border-radius: var(--sb-radius) !important;
  opacity: 0.78;
  transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease;

  &:hover {
    opacity: 1;
  }

  /* Neutralise Vuetify's own router-active overlay; we draw our own state. */
  &.v-btn--active :deep(.v-btn__overlay) {
    opacity: 0;
  }

  &--active {
    opacity: 1;
    color: var(--sb-active-fg) !important;
    background: var(--sb-active-bg);
  }

  &--muted {
    opacity: 0.55;
  }
}

.sidebar-browser__rail-divider {
  width: 24px;
  height: 1px;
  margin: 6px 0;
  background: rgba(var(--v-theme-on-surface), 0.1);
  flex-shrink: 0;
}

/* ---------- Expanded ---------- */

.sidebar-browser__expanded {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.sidebar-browser__group--library {
  flex-shrink: 0;
  max-height: 50%;
  overflow-y: auto;
  padding: 8px 8px 6px;
  border-bottom: 1px solid var(--sb-border);
  scrollbar-width: thin;
}

.sidebar-browser__more {
  flex-shrink: 0;
  padding: 4px 8px 8px;

  > .sidebar-section {
    margin-bottom: 4px;
  }
}

/* Tags take the remaining height; only the tag tree scrolls, Library stays put */
.sidebar-browser__tags {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
  padding-top: 4px;

  > .sidebar-section {
    flex-shrink: 0;
    padding-inline: 10px 8px;
    margin-bottom: 4px;
  }
}

.sidebar-browser__tags--closed {
  flex: 0 0 auto;
}

.sidebar-browser__scroll {
  flex: 1 1 auto;
  min-height: 0;
}

/* Section header: chevron + small caps label, actions fade in on hover */

.sidebar-section {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  min-height: 32px;
  padding-inline: 2px 0;

  &:hover .sidebar-section__actions,
  &:focus-within .sidebar-section__actions {
    opacity: 1;
  }
}

.sidebar-section__toggle {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  height: 26px;
  padding: 0 8px 0 4px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;

  &:hover:not(.sidebar-section__toggle--static) {
    background: var(--sb-hover);

    .sidebar-section__label,
    .sidebar-section__chevron {
      opacity: 0.9;
    }
  }

  &--static {
    cursor: default;
  }
}

.sidebar-section__label {
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0.55;
  transition: opacity 0.12s ease;
}

.sidebar-section__chevron {
  opacity: 0.45;
  transition: transform 0.18s ease, opacity 0.12s ease;

  &--closed {
    transform: rotate(-90deg);
  }

  &--placeholder {
    visibility: hidden;
  }
}

.sidebar-section__actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 4px;
  opacity: 0.6;
  transition: opacity 0.15s ease;

  &--pinned {
    opacity: 1;
  }

  :deep(.v-btn) {
    border-radius: 7px;
  }
}

/* Library list */

.sidebar-browser__nav {
  padding: 2px 0 0 !important;
  background: transparent !important;

  :deep(.v-list-item) {
    min-height: 36px !important;
    margin-bottom: 1px !important;
    padding-inline: 10px 10px !important;
    border-radius: var(--sb-radius) !important;
  }

  :deep(.v-list-item__prepend) {
    width: 32px;

    > .v-icon {
      opacity: 0.72;
    }
  }

  :deep(.v-list-item__spacer) {
    width: 0;
  }

  :deep(.v-list-item-title) {
    font-size: 0.875rem;
    font-weight: 500;
    letter-spacing: 0;
  }

  :deep(.v-list-item--active) {
    .v-list-item__overlay {
      opacity: 0.12;
    }

    .v-list-item__prepend > .v-icon {
      opacity: 1;
    }

    .v-list-item-title {
      font-weight: 600;
    }
  }
}

.sidebar-browser__nav-count {
  display: inline-block;
  min-width: 22px;
  padding: 2px 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: center;
  font-variant-numeric: tabular-nums;
  color: rgba(var(--v-theme-on-surface), 0.6);

  .v-list-item--active & {
    background: rgba(var(--v-theme-primary), 0.16);
    color: inherit;
  }
}

.sidebar-browser__library-item--hidden {
  opacity: 0.5;
}

.sidebar-browser__library-item--editing {
  :deep(.v-list-item__prepend) {
    width: auto;
    column-gap: 2px;
    margin-inline-end: 10px;
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

/* Tags */

.sidebar-browser__tags-panel {
  padding: 0 8px 8px;
}

/* ---------- Footer ---------- */

.sidebar-browser__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
  padding: 8px;
  border-top: 1px solid var(--sb-border);
}

.sidebar-browser__footer-main {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1 1 auto;
  min-width: 0;
  height: 36px;
  padding: 0 10px;
  border-radius: var(--sb-radius);
  color: inherit;
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: background-color 0.12s ease, color 0.12s ease;

  .v-icon {
    opacity: 0.72;
  }

  &:hover {
    background: var(--sb-hover);
  }

  &--active {
    background: var(--sb-active-bg);
    color: var(--sb-active-fg);
    font-weight: 600;

    .v-icon {
      opacity: 1;
    }
  }
}

.sidebar-browser__footer-label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.sidebar-browser__footer-btn {
  flex-shrink: 0;
  width: 36px !important;
  height: 36px !important;
  border-radius: var(--sb-radius) !important;
  opacity: 0.72;

  &:hover {
    opacity: 1;
  }
}
</style>
