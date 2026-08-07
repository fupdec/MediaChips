<template>
  <div
    class="sidebar-tags-browser"
    :class="{'sidebar-tags-browser--editing': editMode}"
  >
    <div class="sidebar-tags-browser__toolbar">
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
          }"
        >
          <div class="sidebar-tags-browser__category-header">
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
              @click="openCategoryPage(category.id)"
            >
              <v-icon
                v-if="category.icon"
                size="16"
                class="mr-2 opacity-70"
              >
                mdi-{{ category.icon }}
              </v-icon>
              <span class="sidebar-tags-browser__category-name">{{ category.name }}</span>
              <span class="sidebar-tags-browser__category-count">
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
              <v-btn
                icon
                size="x-small"
                variant="text"
                :aria-label="t('all_tags.edit_category')"
                @click="openEditCategory(category)"
              >
                <v-icon size="16">mdi-cog-outline</v-icon>
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
              @click="onTagClick(tag, $event)"
              @mouseenter="onTagHover($event, tag, category)"
              @mouseleave="hideHoverImage"
            >
              <span
                v-if="tag.color"
                class="sidebar-tags-browser__tag-swatch"
                :style="{backgroundColor: tag.color}"
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
      :edit-mode="true"
      :meta="metaForDialog"
      :dialog="metaDialog"
      :allowed-types="['array']"
      @updated="onMetaUpdated"
      @created="onMetaUpdated"
      @close="closeMetaDialog"
      @delete="onMetaUpdated"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import DialogMetaManager from '@/components/dialogs/DialogMetaManager.vue'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {metaPath, useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {useBrowserTagFilter} from '@/composable/useBrowserTagFilter'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {hideHoverImage, showHoverImage} from '@/services/hoverService'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
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

const search = ref('')
const expanded = reactive<Record<number, boolean>>({})
const categoryRows = ref<Meta[]>([])
const categoryDragging = ref(false)
const togglingHiddenId = ref<number | null>(null)
const metaDialog = ref(false)
const metaForDialog = ref<Meta | null>(null)
const creatingTag = ref(false)

function onSearchInput(value: string | null): void {
  search.value = value ?? ''
}

function clearSearch(): void {
  search.value = ''
}

const searchTrimmed = computed(() => search.value.trim())

const createCategories = computed(() => {
  return categoryRows.value.filter((category) => props.editMode || !category.hidden)
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
  }
  return true
}

function syncCategoryRows(items: Meta[]): void {
  categoryRows.value = items.map((item) => ({...item}))
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

const tagsByMetaId = computed(() => {
  const query = search.value.trim().toLowerCase()
  const map = new Map<number, Tag[]>()

  for (const category of categoryRows.value) {
    let tags = appStore.getTagsByMetaId(category.id) as Tag[]
    tags = [...tags].sort((a, b) => {
      if (Boolean(a.favorite) !== Boolean(b.favorite)) {
        return a.favorite ? -1 : 1
      }
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, {sensitivity: 'base'})
    })
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

function tagsForMeta(metaId: number): Tag[] {
  return tagsByMetaId.value.get(metaId) || []
}

function isExpanded(metaId: number): boolean {
  return expanded[metaId] !== false
}

function toggleCategory(metaId: number): void {
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

defineExpose({
  allCategoriesExpanded,
  toggleAllCategories,
  setAllCategoriesExpanded,
})

function isCategoryPageActive(metaId: number): boolean {
  return route.path === '/meta' && String(route.query.metaId) === String(metaId)
}

function openCategoryPage(metaId: number): void {
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
    const res = await typedApi.createTags([{name, metaId}])
    const created = res.data?.[0]
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

function openEditCategory(category: Meta): void {
  metaForDialog.value = category
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
</script>

<style scoped lang="scss">
.sidebar-tags-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-tags-browser__toolbar {
  padding: 0 0 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

.sidebar-tags-browser__search {
  font-size: 0.75rem;

  :deep(.v-input__control) {
    min-height: 28px;
  }

  :deep(.v-field) {
    background: transparent !important;
    --v-field-padding-top: 0;
    --v-field-padding-bottom: 0;
    --v-input-control-height: 28px;
  }

  :deep(.v-field__field) {
    --v-field-input-padding-top: 0;
    --v-field-input-padding-bottom: 0;
  }

  :deep(.v-field__input) {
    min-height: 28px !important;
    padding-top: 0;
    padding-bottom: 0;
    font-size: 0.75rem;
  }

  :deep(.v-field__prepend-inner) {
    padding-top: 0;
    padding-inline-end: 2px;
    align-self: center;
  }

  :deep(.v-field__prepend-inner > .v-icon),
  :deep(.v-field__append-inner > .v-icon) {
    font-size: 15px !important;
    width: 15px;
    height: 15px;
    opacity: 0.5;
  }

  :deep(.v-field__outline) {
    --v-field-border-opacity: 0.18;
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
  padding: 5px 8px;
  border: 1px dashed rgba(var(--v-theme-primary), 0.45);
  border-radius: 8px;
  background: rgba(var(--v-theme-primary), 0.06);
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.3;
  text-align: left;

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

.sidebar-tags-browser__empty {
  padding: 8px 4px;
  font-size: 0.75rem;
}

.sidebar-tags-browser__category {
  margin-bottom: 2px;

  &--hidden {
    opacity: 0.55;
  }
}

.sidebar-tags-browser__category-ghost {
  opacity: 0.45;
}

.sidebar-tags-browser__category-header {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 2px;
  padding: 2px 0;
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
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  opacity: 0.65;

  &:hover {
    opacity: 1;
    background: rgba(var(--v-theme-on-surface), 0.06);
  }
}

.sidebar-tags-browser__category-link {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  padding: 4px 6px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: normal;
  text-transform: none;
  opacity: 0.9;

  &:hover {
    opacity: 1;
    background: rgba(var(--v-theme-on-surface), 0.05);
  }

  &--active {
    opacity: 1;
    background: rgba(var(--v-theme-primary), 0.12);
    color: rgb(var(--v-theme-primary));
  }
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
  font-weight: 500;
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
  margin-left: 6px;
}

.sidebar-tags-browser__category-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  margin-left: 2px;
}

.sidebar-tags-browser__tags {
  padding: 0 4px 6px;
}

.sidebar-tags-browser__tag {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 8px 3px 28px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  border-radius: 6px;
  font-size: 0.8rem;
  line-height: 1.35;
  text-align: left;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.06);
  }

  &--active {
    background: rgba(var(--v-theme-primary), 0.16);
    color: rgb(var(--v-theme-primary));
    font-weight: 600;
  }

  &--favorite .sidebar-tags-browser__tag-name {
    font-weight: 500;
  }
}

.sidebar-tags-browser--editing .sidebar-tags-browser__tag {
  padding-left: 36px;
}

.sidebar-tags-browser__tag-swatch {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.sidebar-tags-browser__tag-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
