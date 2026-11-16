<template>
  <div
    class="sidebar-tags-browser"
    :style="{'--sidebar-tags-toolbar-h': `${toolbarHeight}px`}"
    :class="{
      'sidebar-tags-browser--editing': editMode,
      'sidebar-tags-browser--nest-drag': canDragCategoryToNest,
    }"
  >
    <div
      ref="toolbarRef"
      class="sidebar-tags-browser__toolbar"
    >
      <v-text-field
        :model-value="search"
        density="compact"
        variant="outlined"
        hide-details
        single-line
        rounded="lg"
        :placeholder="t('browser_layout.tags_search')"
        prepend-inner-icon="mdi-magnify"
        class="sidebar-tags-browser__search"
        @update:model-value="onSearchInput"
        @keydown.enter.prevent="onSearchEnter"
      >
        <template
          v-if="search"
          #append-inner
        >
          <v-icon
            icon="mdi-close-circle"
            size="small"
            class="sidebar-tags-browser__clear"
            :aria-label="t('browser_layout.clear_search')"
            @mousedown.prevent.stop
            @click.stop="clearSearch"
          />
        </template>
      </v-text-field>

      <div
        v-if="canCreateTag"
        class="sidebar-tags-browser__create"
      >
        <v-menu
          v-if="createCategories.length > 1"
          location="bottom"
          :close-on-content-click="true"
        >
          <template #activator="{props: menuProps}">
            <button
              type="button"
              class="sidebar-tags-browser__create-btn"
              :disabled="creatingTag"
              v-bind="menuProps"
            >
              <v-icon
                size="14"
                class="mr-1"
              >
                mdi-tag-plus
              </v-icon>
              <span class="sidebar-tags-browser__create-label">
                {{ t('browser_layout.create_tag', {name: searchTrimmed}) }}
              </span>
              <v-icon
                size="14"
                class="ml-1 opacity-60"
              >
                mdi-chevron-down
              </v-icon>
            </button>
          </template>
          <v-list
            density="compact"
            min-width="180"
          >
            <v-list-subheader>
              {{ t('browser_layout.create_tag_choose') }}
            </v-list-subheader>
            <v-list-item
              v-for="category in createCategories"
              :key="category.id"
              :prepend-icon="category.icon ? `mdi-${category.icon}` : 'mdi-tag-outline'"
              :title="category.name"
              :disabled="creatingTag"
              @click="createTagInCategory(category.id)"
            />
          </v-list>
        </v-menu>

        <button
          v-else
          type="button"
          class="sidebar-tags-browser__create-btn"
          :disabled="creatingTag || !defaultCreateCategoryId"
          @click="createTagInCategory(defaultCreateCategoryId!)"
        >
          <v-icon
            size="14"
            class="mr-1"
          >
            mdi-tag-plus
          </v-icon>
          <span class="sidebar-tags-browser__create-label">
            {{ t('browser_layout.create_tag', {name: searchTrimmed}) }}
          </span>
        </button>
      </div>
    </div>

    <div
      v-if="!hasVisibleCategories && !canCreateTag"
      class="sidebar-tags-browser__empty text-medium-emphasis"
    >
      {{ search.trim() ? t('browser_layout.no_matching_tags') : t('browser_layout.tags_empty') }}
    </div>

    <button
      v-if="!categoryRows.length"
      type="button"
      class="sidebar-tags-browser__create-btn sidebar-tags-browser__add-category"
      @click="openCreateCategory"
    >
      <v-icon
        size="14"
        class="mr-1"
      >
        mdi-plus
      </v-icon>
      <span class="sidebar-tags-browser__create-label">
        {{ t('all_tags.add_category') }}
      </span>
    </button>

    <Draggable
      v-model="categoryRows"
      item-key="id"
      handle=".sidebar-tags-browser__category-drag"
      :animation="200"
      ghost-class="sidebar-tags-browser__category-ghost"
      :disabled="!editMode || Boolean(search.trim())"
      @start="categoryDragging = true"
      @end="onCategoryReorderEnd"
    >
      <template #item="{element: category}">
        <div
          v-show="shouldShowCategory(category)"
          class="sidebar-tags-browser__category"
          :class="{
            'sidebar-tags-browser__category--hidden': category.hidden,
            'sidebar-tags-browser__category--editing': editMode,
            'sidebar-tags-browser__category--drop': dropTargetMetaId === category.id,
          }"
          :style="{paddingInlineStart: `${categoryTreeDepth(category) * 12}px`}"
          @dragover.prevent="onCategoryDragOver(category, $event)"
          @dragleave="onCategoryDragLeave(category, $event)"
          @drop.prevent="onDropToCategory(category)"
        >
          <div
            class="sidebar-tags-browser__category-header"
            :draggable="canDragCategoryToNest"
            @dragstart.stop="onCategoryItemDragStart(category, $event)"
            @dragend="onHierarchyDragEnd"
          >
            <v-icon
              v-if="editMode"
              size="16"
              class="sidebar-tags-browser__category-drag text-medium-emphasis"
              :class="{'sidebar-tags-browser__category-drag--disabled': Boolean(search.trim())}"
              :aria-label="t('all_tags.reorder_category')"
            >
              mdi-drag-vertical
            </v-icon>

            <button
              type="button"
              class="sidebar-tags-browser__category-toggle"
              :aria-expanded="isExpanded(category.id)"
              :aria-label="category.name"
              @click="toggleCategory(category.id)"
            >
              <v-icon size="18">
                {{ isExpanded(category.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
              </v-icon>
            </button>

            <button
              type="button"
              class="sidebar-tags-browser__category-link"
              :class="{'sidebar-tags-browser__category-link--active': isCategoryPageActive(category.id)}"
              :title="t('all_tags.open_category')"
              :draggable="canDragCategoryToNest"
              @click="openCategoryPage(category.id)"
              @dragstart.stop="onCategoryItemDragStart(category, $event)"
              @dragend="onHierarchyDragEnd"
            >
              <v-icon
                v-if="category.icon"
                size="20"
                class="sidebar-tags-browser__category-icon"
              >
                mdi-{{ category.icon }}
              </v-icon>
              <span class="sidebar-tags-browser__category-name">{{ category.name }}</span>
              <span
                v-if="!editMode"
                class="sidebar-tags-browser__category-count"
              >
                {{ tagsForMeta(category.id).length }}
              </span>
            </button>

            <div
              v-if="editMode"
              class="sidebar-tags-browser__category-actions"
              @click.stop
            >
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="category.hidden
                  ? t('meta.settings.show_in_navigation')
                  : t('meta.settings.hide_in_navigation')"
                :disabled="togglingHiddenId === category.id"
                @click="toggleCategoryHidden(category)"
              >
                <v-icon size="16">
                  {{ category.hidden ? 'mdi-eye-off-outline' : 'mdi-eye-outline' }}
                </v-icon>
              </v-btn>
            </div>
          </div>

          <div
            v-if="isExpanded(category.id)"
            class="sidebar-tags-browser__tags"
          >
            <button
              v-for="tag in tagsForMeta(category.id)"
              :key="tag.id"
              type="button"
              class="sidebar-tags-browser__tag"
              :class="{
                'sidebar-tags-browser__tag--active': isTagFilterActive(tag.id),
                'sidebar-tags-browser__tag--favorite': tag.favorite,
              }"
              :title="tag.name"
              draggable="true"
              @click="onTagClick(tag, $event)"
              @mouseenter="onTagHover($event, tag, category)"
              @mouseleave="hideHoverImage"
              @dragstart.stop="onTagDragStart(tag, $event)"
              @dragend="onHierarchyDragEnd"
            >
              <span
                class="sidebar-tags-browser__tag-swatch"
                :class="{'sidebar-tags-browser__tag-swatch--empty': !tag.color}"
                :style="tag.color ? {backgroundColor: tag.color} : undefined"
              />
              <span class="sidebar-tags-browser__tag-name">{{ tag.name }}</span>
              <v-icon
                v-if="tag.favorite"
                size="12"
                color="pink"
                class="ml-auto"
              >
                mdi-heart
              </v-icon>
            </button>

            <div
              v-if="!tagsForMeta(category.id).length"
              class="sidebar-tags-browser__empty text-caption text-medium-emphasis px-3 py-1"
            >
              {{ t('browser_layout.no_matching_tags') }}
            </div>
          </div>
        </div>
      </template>
    </Draggable>

    <DialogMetaManager
      :edit-mode="metaEditMode"
      :meta="metaForDialog"
      :dialog="metaDialog"
      :allowed-types="['array']"
      @updated="onMetaUpdated"
      @created="onMetaCreated"
      @close="closeMetaDialog"
      @delete="onMetaUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, onMounted, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import DialogMetaManager from '@/components/dialogs/DialogMetaManager.vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useItemsStore} from '@/stores/items'
import {metaPath, useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {useBrowserTagFilter} from '@/composable/useBrowserTagFilter'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {createTagsInteractive} from '@/composable/createTagsInteractive'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {
  canReparentCategory,
  flattenTagCategories,
  hasEmptyCategoryNestTarget,
  isTagCategoryGroup,
  isTagCategoryLeaf,
} from '@/utils/tagCategoryTree'
import {useMoveTagsToCategory} from '@/composable/useMoveTagsToCategory'
import {useHierarchyReparent} from '@/composable/useHierarchyReparent'
import {setNotification} from '@/services/notificationService'
import {typedApi} from '@/services/typedApi'
import type {Meta, Tag} from '@/types/stores'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const STORAGE_KEY = 'mediachips.browserTagsExpanded'

const props = withDefaults(defineProps<{
  editMode?: boolean
}>(), {
  editMode: false,
})

const emit = defineEmits<{
  'all-expanded-change': [value: boolean]
}>()

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const {metaArray} = useLibraryNavItems()
const {isTagFilterActive, filterByTag} = useBrowserTagFilter()
const {moveTagsToCategory} = useMoveTagsToCategory()
const {reparentCategory} = useHierarchyReparent()

const search = ref('')
const toolbarRef = ref<HTMLElement | null>(null)
const toolbarHeight = ref(44)
let toolbarObserver: ResizeObserver | null = null

onMounted(() => {
  const el = toolbarRef.value
  if (!el || typeof ResizeObserver === 'undefined') return
  toolbarObserver = new ResizeObserver(() => {
    toolbarHeight.value = Math.round(el.getBoundingClientRect().height)
  })
  toolbarObserver.observe(el)
})

onBeforeUnmount(() => {
  toolbarObserver?.disconnect()
  toolbarObserver = null
})
const expanded = reactive<Record<number, boolean>>({})
const categoryRows = ref<Meta[]>([])
const categoryDragging = ref(false)
const draggingTagIds = ref<number[]>([])
const draggingMetaId = ref<number | null>(null)
const dropTargetMetaId = ref<number | null>(null)
const suppressNextClick = ref(false)
const togglingHiddenId = ref<number | null>(null)
const creatingTag = ref(false)
const metaDialog = ref(false)
const metaEditMode = ref(false)
const metaForDialog = ref<Meta | null>(null)

function onSearchInput(value: string | null): void {
  search.value = value ?? ''
}

function clearSearch(): void {
  search.value = ''
}

const searchTrimmed = computed(() => search.value.trim())

const createCategories = computed(() => {
  return categoryRows.value.filter((category) =>
    (props.editMode || !category.hidden)
    && isTagCategoryLeaf(category, categoryRows.value),
  )
})

const exactTagExists = computed(() => {
  const query = searchTrimmed.value.toLowerCase()
  if (!query) return false
  return (appStore.tags || []).some(
    (tag) => String(tag.name || '').trim().toLowerCase() === query,
  )
})

const canCreateTag = computed(() =>
  Boolean(searchTrimmed.value)
  && !exactTagExists.value
  && createCategories.value.length > 0,
)

const defaultCreateCategoryId = computed(() => {
  const preferred = getDefaultTagCategoryId(
    appStore.meta,
    settingsStore.defaultTagCategoryId,
  )
  if (preferred != null && createCategories.value.some((category) => category.id === preferred)) {
    return preferred
  }
  return createCategories.value[0]?.id ?? null
})

function loadExpanded(): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Record<string, boolean>
    for (const [key, value] of Object.entries(parsed)) {
      expanded[Number(key)] = Boolean(value)
    }
  } catch {
    // ignore
  }
}

function persistExpanded(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({...expanded}))
  } catch {
    // ignore
  }
}

function categoriesEqual(a: Meta[], b: Meta[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false
    if (a[i].order !== b[i].order) return false
    if (Boolean(a[i].hidden) !== Boolean(b[i].hidden)) return false
    if (a[i].name !== b[i].name) return false
    if (a[i].icon !== b[i].icon) return false
    if (Number(a[i].parentMetaId ?? 0) !== Number(b[i].parentMetaId ?? 0)) return false
  }
  return true
}

function syncCategoryRows(items: Meta[]): void {
  categoryRows.value = flattenTagCategories(items).map((row) => ({
    ...row.meta,
    treeDepth: row.depth,
  })) as Meta[]
}

loadExpanded()

watch(metaArray, (metas) => {
  for (const meta of metas) {
    if (expanded[meta.id] === undefined) {
      expanded[meta.id] = true
    }
  }
  persistExpanded()

  if (categoryDragging.value) return
  if (categoriesEqual(categoryRows.value, metas)) return
  syncCategoryRows(metas)
}, {immediate: true})

/* ---------- Category page sort mirroring ----------
 * Tags in the tree follow the sort chosen on each category's page. The order
 * comes from the server (sorts can use media counts, pinned meta, etc. that the
 * cached catalog lacks); only ids are fetched, tags still render from the cache.
 * `null` = no custom sort saved → alphabetical.
 */
const itemsStore = useItemsStore()
const categoryOrder = reactive<Record<number, number[] | null>>({})
const categoryOrderRequest: Record<number, number> = {}

type CategorySort = {sortBy: string; sortDir: 'asc' | 'desc'}

async function fetchCategorySort(metaId: number): Promise<CategorySort | null> {
  try {
    // Lookup only — never create default page settings rows.
    const res = await typedApi.findPageSettings({
      metaId,
      tagId: null,
      mediaTypeId: null,
      tabId: null,
    })
    const sortBy = String(res.data?.sortBy || '')
    if (!sortBy) return null
    return {sortBy, sortDir: res.data?.sortDir === 'desc' ? 'desc' : 'asc'}
  } catch {
    return null
  }
}

async function loadCategoryOrder(
  metaId: number,
  options: {force?: boolean; sort?: CategorySort | null} = {},
): Promise<void> {
  if (!options.force && metaId in categoryOrder) return
  const token = (categoryOrderRequest[metaId] || 0) + 1
  categoryOrderRequest[metaId] = token

  const sort = options.sort !== undefined ? options.sort : await fetchCategorySort(metaId)
  if (categoryOrderRequest[metaId] !== token) return

  // Shuffle on the page is random per load — keep the tree stable instead.
  if (!sort || sort.sortBy === 'shuffle') {
    categoryOrder[metaId] = null
    return
  }

  try {
    const res = await typedApi.postTagSortedIds({
      metaId,
      sortBy: sort.sortBy,
      direction: sort.sortDir,
    })
    if (categoryOrderRequest[metaId] !== token) return
    categoryOrder[metaId] = res.data.ids
  } catch {
    if (categoryOrderRequest[metaId] !== token) return
    categoryOrder[metaId] = null
  }
}

function sortTagsForCategory(metaId: number, tags: Tag[]): Tag[] {
  const byName = (a: Tag, b: Tag) => String(a.name || '').localeCompare(String(b.name || ''))
  const order = categoryOrder[metaId]
  if (!order?.length) return tags.sort(byName)

  const rank = new Map<number, number>()
  order.forEach((id, index) => rank.set(id, index))
  return tags.sort((a, b) => {
    const ra = rank.get(Number(a.id))
    const rb = rank.get(Number(b.id))
    // Tags created after the order was fetched go last, alphabetically.
    if (ra == null && rb == null) return byName(a, b)
    if (ra == null) return 1
    if (rb == null) return -1
    return ra - rb
  })
}

const tagsByMetaId = computed(() => {
  const query = search.value.trim().toLowerCase()
  const map = new Map<number, Tag[]>()

  for (const category of categoryRows.value) {
    let tags = sortTagsForCategory(
      category.id,
      [...(appStore.getTagsByMetaId(category.id) as Tag[])],
    )
    if (query) {
      tags = tags.filter((tag) => {
        const name = String(tag.name || '').toLowerCase()
        const synonyms = String(tag.synonyms || '').toLowerCase()
        return name.includes(query) || synonyms.includes(query)
      })
    }
    map.set(category.id, tags)
  }
  return map
})

function shouldShowCategory(category: Meta): boolean {
  if (!props.editMode && category.hidden) return false

  const query = search.value.trim().toLowerCase()
  if (!query) return true

  const tags = tagsByMetaId.value.get(category.id) || []
  return tags.length > 0 || String(category.name || '').toLowerCase().includes(query)
}

const hasVisibleCategories = computed(() =>
  categoryRows.value.some((category) => shouldShowCategory(category)),
)

const tagCountByMetaId = computed(() => {
  const counts: Record<number, number> = {}
  for (const tag of appStore.tags || []) {
    const metaId = Number(tag.metaId)
    if (!Number.isFinite(metaId)) continue
    counts[metaId] = (counts[metaId] || 0) + 1
  }
  return counts
})

const canDragCategoryToNest = computed(() =>
  !props.editMode
  && !searchTrimmed.value
  && hasEmptyCategoryNestTarget(categoryRows.value, tagCountByMetaId.value),
)

function onHierarchyDragEnd() {
  draggingTagIds.value = []
  draggingMetaId.value = null
  dropTargetMetaId.value = null
  window.setTimeout(() => {
    suppressNextClick.value = false
  }, 250)
}

function onTagDragStart(tag: Tag, event: DragEvent) {
  suppressNextClick.value = true
  draggingTagIds.value = [Number(tag.id)]
  draggingMetaId.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', String(tag.id))
  }
}

function onCategoryItemDragStart(category: Meta, event: DragEvent) {
  if (!canDragCategoryToNest.value) {
    event.preventDefault()
    return
  }
  draggingMetaId.value = Number(category.id)
  draggingTagIds.value = []
  suppressNextClick.value = true
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', `meta:${category.id}`)
  }
}

function onCategoryDragOver(category: Meta, event: DragEvent) {
  if (draggingMetaId.value != null) {
    if (
      canReparentCategory(
        draggingMetaId.value,
        Number(category.id),
        categoryRows.value,
        tagCountByMetaId.value[Number(category.id)] || 0,
      )
    ) {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      dropTargetMetaId.value = category.id
    } else {
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
      dropTargetMetaId.value = null
    }
    return
  }

  if (!draggingTagIds.value.length) return
  if (isTagCategoryGroup(category, categoryRows.value)) {
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
    dropTargetMetaId.value = null
    return
  }
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  dropTargetMetaId.value = category.id
}

function onCategoryDragLeave(category: Meta, event: DragEvent) {
  const related = event.relatedTarget as Node | null
  const current = event.currentTarget as HTMLElement | null
  if (current && related && current.contains(related)) return
  if (dropTargetMetaId.value === category.id) dropTargetMetaId.value = null
}

function onDropToCategory(category: Meta) {
  if (draggingMetaId.value != null) {
    const source = categoryRows.value.find((item) => Number(item.id) === draggingMetaId.value)
    onHierarchyDragEnd()
    if (!source) return
    void reparentCategory(
      source,
      Number(category.id),
      categoryRows.value,
      tagCountByMetaId.value[Number(category.id)] || 0,
    )
    return
  }

  const ids = [...draggingTagIds.value]
  onHierarchyDragEnd()
  if (!ids.length) return
  if (isTagCategoryGroup(category, categoryRows.value)) return

  const byId = new Map((appStore.tags || []).map((tag) => [Number(tag.id), tag]))
  const tagsToMove = ids
    .map((id) => byId.get(id))
    .filter((tag): tag is Tag => tag != null && Number(tag.metaId) !== Number(category.id))
  if (!tagsToMove.length) return
  moveTagsToCategory(tagsToMove, Number(category.id), String(category.name ?? ''), {
    clearSelection: false,
    syncItemsList: false,
    allowOpenCategoryAction: false,
  })
}

function tagsForMeta(metaId: number): Tag[] {
  return tagsByMetaId.value.get(metaId) || []
}

function categoryTreeDepth(category: Meta): number {
  return Number((category as Meta & {treeDepth?: number}).treeDepth || 0)
}

function isExpanded(metaId: number): boolean {
  return expanded[metaId] !== false
}

function toggleCategory(metaId: number): void {
  if (suppressNextClick.value) return
  expanded[metaId] = !isExpanded(metaId)
  persistExpanded()
}

const visibleCategories = computed(() =>
  categoryRows.value.filter((category) => shouldShowCategory(category)),
)

const allCategoriesExpanded = computed(() => {
  const visible = visibleCategories.value
  if (!visible.length) return false
  return visible.every((category) => isExpanded(category.id))
})

function setAllCategoriesExpanded(value: boolean): void {
  for (const category of visibleCategories.value) {
    expanded[category.id] = value
  }
  persistExpanded()
}

function toggleAllCategories(): void {
  setAllCategoriesExpanded(!allCategoriesExpanded.value)
}

watch(
  allCategoriesExpanded,
  (value) => {
    emit('all-expanded-change', value)
  },
  {immediate: true},
)

// Lazily mirror the page sort for every expanded category.
watch(
  () => categoryRows.value.filter((category) => isExpanded(category.id)).map((category) => category.id),
  (ids) => {
    for (const id of ids) void loadCategoryOrder(id)
  },
  {immediate: true},
)

// Sort changed on the open category page → follow it right away. Only react
// when the meta stays the same so page switches don't apply a stale sort.
watch(
  () => (itemsStore.type === 'tag'
    ? [Number(itemsStore.environment?.meta_id) || 0, String(itemsStore.sortBy || ''), String(itemsStore.sortDir || '')] as [number, string, string]
    : null),
  (next, prev) => {
    if (!next || !prev) return
    const [metaId, sortBy, sortDir] = next
    if (!metaId || metaId !== prev[0]) return
    if (sortBy === prev[1] && sortDir === prev[2]) return
    void loadCategoryOrder(metaId, {
      force: true,
      sort: sortBy ? {sortBy, sortDir: sortDir === 'desc' ? 'desc' : 'asc'} : null,
    })
  },
)

// Catalog reloads (new tags, counts, ratings…) can shift server-side order.
let catalogRefreshTimer: ReturnType<typeof setTimeout> | null = null
watch(
  () => appStore.tags,
  () => {
    if (catalogRefreshTimer != null) clearTimeout(catalogRefreshTimer)
    catalogRefreshTimer = setTimeout(() => {
      catalogRefreshTimer = null
      for (const key of Object.keys(categoryOrder)) {
        const metaId = Number(key)
        if (categoryOrder[metaId] && isExpanded(metaId)) {
          void loadCategoryOrder(metaId, {force: true})
        }
      }
    }, 800)
  },
)

onBeforeUnmount(() => {
  if (catalogRefreshTimer != null) clearTimeout(catalogRefreshTimer)
})

defineExpose({
  allCategoriesExpanded,
  toggleAllCategories,
  setAllCategoriesExpanded,
  openCreateCategory,
})

function isCategoryPageActive(metaId: number): boolean {
  return route.path === '/meta' && String(route.query.metaId) === String(metaId)
}

function openCategoryPage(metaId: number): void {
  if (suppressNextClick.value) return
  const category = categoryRows.value.find((item) => Number(item.id) === Number(metaId))
  if (category && isTagCategoryGroup(category, categoryRows.value)) {
    toggleCategory(metaId)
    return
  }
  hideHoverImage()
  void router.push(metaPath(metaId))
}

function onTagHover(event: MouseEvent, tag: Tag, category: Meta): void {
  const metaId = tag.metaId ?? category.id
  showHoverImage(event, metaId, tag.id, 'tag', {
    label: tag.name,
    imageAspectRatio: category.imageAspectRatio,
  })
}

async function onTagClick(tag: Tag, event?: MouseEvent): Promise<void> {
  if (suppressNextClick.value) return
  hideHoverImage()
  if (event && (event.metaKey || event.ctrlKey || event.shiftKey)) {
    await filterByTag(tag)
    return
  }
  openTagPage(tag)
}

function openTagPage(tag: Tag): void {
  if (tag.metaId == null) return
  hideHoverImage()
  void router.push(`/tag?metaId=${tag.metaId}&tagId=${tag.id}`)
}

function onSearchEnter(): void {
  if (!canCreateTag.value) return
  if (defaultCreateCategoryId.value == null) return
  void createTagInCategory(defaultCreateCategoryId.value)
}

async function createTagInCategory(metaId: number): Promise<void> {
  const name = searchTrimmed.value
  if (!name || creatingTag.value || !metaId) return

  creatingTag.value = true
  try {
    const createdTags = await createTagsInteractive([{name, metaId}])
    const created = createdTags?.[0]
    if (!created) return
    await reloadTagsCatalog()

    setNotification({
      type: 'success',
      text: t('browser_layout.create_tag_done', {name}),
    })

    search.value = ''
    expanded[metaId] = true
    persistExpanded()

    if (created?.id != null) {
      openTagPage({...created, metaId: created.metaId ?? metaId} as Tag)
    }
  } catch (error) {
    console.error('Failed creating tag from sidebar search', error)
    setNotification({
      type: 'error',
      text: t('browser_layout.create_tag_failed'),
    })
  } finally {
    creatingTag.value = false
  }
}

async function onCategoryReorderEnd(): Promise<void> {
  categoryDragging.value = false

  await Promise.all(
    categoryRows.value.map(async (category, index) => {
      try {
        await typedApi.updateMeta(category.id, {order: index})
      } catch (error) {
        console.error('Failed updating meta order', category.id, error)
      }
    }),
  )

  await reloadMetaCatalog()
}

async function toggleCategoryHidden(category: Meta): Promise<void> {
  if (!category.id || togglingHiddenId.value === category.id) return
  togglingHiddenId.value = category.id
  try {
    await typedApi.updateMeta(category.id, {hidden: !category.hidden})
    await reloadMetaCatalog()
  } catch (error) {
    console.error('Failed updating meta.hidden', error)
  } finally {
    togglingHiddenId.value = null
  }
}

function openCreateCategory(): void {
  metaEditMode.value = false
  metaForDialog.value = null
  metaDialog.value = true
}

function closeMetaDialog(): void {
  metaDialog.value = false
  metaForDialog.value = null
}

async function onMetaUpdated(): Promise<void> {
  await reloadMetaCatalog()
  closeMetaDialog()
}

async function onMetaCreated(): Promise<void> {
  await reloadMetaCatalog()
  closeMetaDialog()
}
</script>

<style scoped lang="scss">
.sidebar-tags-browser {
  --tags-hover: rgba(var(--v-theme-on-surface), 0.06);
  --tags-guide: rgba(var(--v-theme-on-surface), 0.1);

  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-tags-browser__toolbar {
  padding: 6px 0 10px;
  position: sticky;
  top: 0;
  z-index: 2;
  background: rgb(var(--v-theme-surface));
}

.sidebar-tags-browser__search {
  font-size: 0.8125rem;

  :deep(.v-input__control) {
    min-height: 32px;
  }

  :deep(.v-field) {
    background: rgba(var(--v-theme-on-surface), 0.045) !important;
    border-radius: 9px !important;
    --v-field-padding-top: 0;
    --v-field-padding-bottom: 0;
    --v-input-control-height: 32px;
    transition: background-color 0.12s ease;
  }

  :deep(.v-field:hover) {
    background: rgba(var(--v-theme-on-surface), 0.07) !important;
  }

  :deep(.v-field--focused) {
    background: rgb(var(--v-theme-surface)) !important;
  }

  :deep(.v-field__field) {
    --v-field-input-padding-top: 0;
    --v-field-input-padding-bottom: 0;
  }

  :deep(.v-field__input) {
    min-height: 32px !important;
    padding-top: 0;
    padding-bottom: 0;
    font-size: 0.8125rem;
  }

  :deep(.v-field__prepend-inner) {
    padding-top: 0;
    padding-inline-end: 4px;
    align-self: center;
  }

  :deep(.v-field__prepend-inner > .v-icon),
  :deep(.v-field__append-inner > .v-icon) {
    font-size: 16px !important;
    width: 16px;
    height: 16px;
    opacity: 0.5;
  }

  :deep(.v-field__outline) {
    --v-field-border-opacity: 0;
  }

  :deep(.v-field--focused .v-field__outline) {
    --v-field-border-opacity: 1;
  }
}

.sidebar-tags-browser__clear {
  cursor: pointer;
  opacity: 0.55;

  &:hover {
    opacity: 1;
  }
}

.sidebar-tags-browser__create {
  margin-top: 6px;
}

.sidebar-tags-browser__create-btn {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  padding: 6px 10px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.45);
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.06);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.3;
  text-align: left;
  transition: background-color 0.12s ease;

  &:hover:not(:disabled) {
    background: rgba(var(--v-theme-primary), 0.12);
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

.sidebar-tags-browser__create-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-tags-browser__add-category {
  margin-top: 6px;
}

.sidebar-tags-browser__empty {
  padding: 8px 4px;
  font-size: 0.75rem;
}

.sidebar-tags-browser__category {
  margin-bottom: 2px;
  border-radius: 8px;

  &--hidden {
    opacity: 0.55;
  }

  &--drop {
    outline: 2px dashed rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }
}

.sidebar-tags-browser__category-ghost {
  opacity: 0.45;
}

.sidebar-tags-browser--nest-drag:not(.sidebar-tags-browser--editing) .sidebar-tags-browser__category-header {
  cursor: grab;
}

/* Category header stays pinned under the search box while its tags scroll by */
.sidebar-tags-browser__category-header {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 2px;
  padding: 1px 0;
  position: sticky;
  top: var(--sidebar-tags-toolbar-h, 42px);
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

.sidebar-tags-browser__category-drag {
  flex-shrink: 0;
  cursor: grab;

  &--disabled {
    cursor: default;
    opacity: 0.35;
  }
}

.sidebar-tags-browser__category-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 24px;
  height: 36px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.55;
  transition: opacity 0.12s ease, background-color 0.12s ease;

  &:hover {
    opacity: 1;
    background: var(--tags-hover);
  }
}

.sidebar-tags-browser__category-link {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 36px;
  padding: 0 10px 0 8px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  transition: background-color 0.12s ease, color 0.12s ease;

  &:hover {
    background: var(--tags-hover);
  }

  &--active {
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
    font-weight: 600;

    .sidebar-tags-browser__category-icon {
      opacity: 1;
    }

    .sidebar-tags-browser__category-count {
      background: rgba(var(--v-theme-primary), 0.16);
      color: inherit;
    }
  }
}

.sidebar-tags-browser__category-icon {
  flex-shrink: 0;
  margin-inline-end: 10px;
  opacity: 0.72;
}

.sidebar-tags-browser__category-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.sidebar-tags-browser__category-count {
  flex-shrink: 0;
  min-width: 22px;
  margin-left: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.6);
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.sidebar-tags-browser__category-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 2px;
}

/* Tag list hangs off a thin guide line under the category chevron */
.sidebar-tags-browser__tags {
  margin: 1px 0 6px 11px;
  padding: 0 0 0 5px;
  border-left: 1px solid var(--tags-guide);
}

.sidebar-tags-browser--editing .sidebar-tags-browser__tags {
  margin-left: 29px;
}

.sidebar-tags-browser__tag {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 26px;
  padding: 3px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: grab;
  border-radius: 7px;
  font-size: 0.8125rem;
  line-height: 1.35;
  text-align: left;
  transition: background-color 0.1s ease, color 0.1s ease;

  &:hover {
    background: var(--tags-hover);
  }

  &--active {
    background: rgba(var(--v-theme-primary), 0.14);
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
  }

  &--favorite .sidebar-tags-browser__tag-name {
    font-weight: 500;
  }
}

.sidebar-tags-browser__tag-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.12);

  &--empty {
    background: rgba(var(--v-theme-on-surface), 0.16);
    box-shadow: none;
    transform: scale(0.6);
  }
}

.sidebar-tags-browser__tag--active .sidebar-tags-browser__tag-swatch--empty {
  background: currentColor;
}

.sidebar-tags-browser__tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
