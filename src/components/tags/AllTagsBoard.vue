<template>
  <div class="all-tags-board">
    <aside class="all-tags-board__categories">
      <div class="all-tags-board__pane-header">
        <v-text-field
          v-model="categorySearch"
          :placeholder="t('all_tags.search_categories')"
          prepend-inner-icon="mdi-magnify"
          density="compact"
          variant="outlined"
          rounded="lg"
          hide-details
          clearable
          class="flex-grow-1"
        />
        <v-btn
          v-tooltip:top="categoriesEditMode
            ? t('all_tags.done_editing_categories')
            : t('all_tags.edit_categories')"
          icon
          size="small"
          :variant="categoriesEditMode ? 'flat' : 'tonal'"
          :color="categoriesEditMode ? 'primary' : undefined"
          @click="categoriesEditMode = !categoriesEditMode"
        >
          <v-icon>{{ categoriesEditMode ? 'mdi-check' : 'mdi-pencil-outline' }}</v-icon>
        </v-btn>
        <v-btn
          v-tooltip:top="t('all_tags.add_category')"
          icon
          size="small"
          variant="tonal"
          color="primary"
          @click="openCreateCategory"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div
        v-if="!categoryRows.length"
        class="all-tags-board__empty text-center pa-6"
      >
        <v-icon size="40" class="mb-2 text-medium-emphasis">mdi-tag-off-outline</v-icon>
        <div class="text-body-2 font-weight-medium">{{ t('all_tags.no_categories') }}</div>
        <div class="text-caption text-medium-emphasis mt-1">{{ t('all_tags.no_categories_hint') }}</div>
        <v-btn
          class="mt-4"
          color="primary"
          variant="tonal"
          rounded="lg"
          prepend-icon="mdi-plus"
          @click="openCreateCategory"
        >
          {{ t('all_tags.add_category') }}
        </v-btn>
      </div>

      <div
        v-else-if="!filteredCategories.length"
        class="all-tags-board__empty text-center pa-6"
      >
        <v-icon size="40" class="mb-2 text-medium-emphasis">mdi-magnify</v-icon>
        <div class="text-body-2 text-medium-emphasis">{{ t('all_tags.no_categories_filtered') }}</div>
      </div>

      <div
        v-else
        ref="categoryListRef"
        class="all-tags-board__category-list"
      >
        <div
          v-if="categoriesEditMode && !categorySearch.trim()"
          class="text-caption text-medium-emphasis mb-2 px-1"
        >
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('all_tags.reorder_categories_hint') }}
        </div>

        <Draggable
          v-model="categoryRows"
          item-key="id"
          handle=".all-tags-board__category-drag"
          :animation="200"
          ghost-class="all-tags-board__category-ghost"
          class="all-tags-board__category-scroll"
          :disabled="!categoriesEditMode || Boolean(categorySearch.trim())"
          @start="categoryDragging = true"
          @end="onCategoryReorderEnd"
        >
          <template #item="{element: category}">
            <div
              v-show="categoryMatchesSearch(category)"
              class="all-tags-board__category"
              :class="{
                'all-tags-board__category--active': selectedMetaId === category.id,
                'all-tags-board__category--drop': dropTargetMetaId === category.id,
                'all-tags-board__category--hidden': category.hidden,
                'all-tags-board__category--editing': categoriesEditMode,
              }"
              :data-meta-id="category.id"
              @click="selectCategory(category.id)"
              @dragover.prevent="onCategoryDragOver(category, $event)"
              @dragleave="onCategoryDragLeave(category, $event)"
              @drop.prevent="onDropToCategory(category)"
            >
              <div class="all-tags-board__category-row">
                <v-icon
                  v-if="categoriesEditMode"
                  size="16"
                  class="all-tags-board__category-drag text-medium-emphasis"
                  :class="{'all-tags-board__category-drag--disabled': Boolean(categorySearch.trim())}"
                  :aria-label="t('all_tags.reorder_category')"
                >
                  mdi-drag-vertical
                </v-icon>
                <v-icon size="20" class="all-tags-board__category-icon flex-shrink-0">mdi-{{ category.icon || 'tag' }}</v-icon>
                <div class="all-tags-board__category-main">
                  <span class="text-body-2 font-weight-medium text-truncate">
                    {{ category.name }}
                  </span>
                  <span class="all-tags-board__category-count text-caption text-medium-emphasis">
                    ({{ tagCountByMetaId[category.id] || 0 }})
                  </span>
                  <v-icon
                    v-if="defaultCategoryId === category.id"
                    v-tooltip:top="t('all_tags.default_category')"
                    size="14"
                    class="all-tags-board__category-default flex-shrink-0"
                    color="primary"
                  >
                    mdi-star
                  </v-icon>
                </div>
                <div
                  v-if="categoriesEditMode"
                  class="all-tags-board__category-actions"
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
            </div>
          </template>
        </Draggable>
      </div>
    </aside>

    <main class="all-tags-board__tags">
      <template v-if="selectedCategory">
        <div class="all-tags-board__pane-header">
          <div class="all-tags-board__tags-title">
            <v-icon size="22" start>mdi-{{ selectedCategory.icon || 'tag' }}</v-icon>
            <span class="text-h6">{{ selectedCategory.name }}</span>
            <span class="text-caption text-medium-emphasis ml-2">
              {{ t('all_tags.tags_count', {count: filteredTags.length}) }}
            </span>
          </div>
          <div class="d-flex align-center ga-2">
            <v-btn
              v-tooltip:top="t('all_tags.open_category')"
              icon
              size="small"
              variant="text"
              :to="metaPath(selectedCategory.id)"
            >
              <v-icon>mdi-open-in-new</v-icon>
            </v-btn>
            <v-btn
              v-tooltip:top="t('all_tags.edit_category')"
              icon
              size="small"
              variant="text"
              @click="openEditCategory(selectedCategory)"
            >
              <v-icon>mdi-cog-outline</v-icon>
            </v-btn>
            <TagsAdd
              :meta_id="selectedCategory.id"
              button-color="primary"
              button-size="small"
              button-variant="tonal"
            />
          </div>
        </div>

        <div class="all-tags-board__pane-header">
          <v-text-field
            v-model="tagSearch"
            :placeholder="t('all_tags.search_tags')"
            prepend-inner-icon="mdi-magnify"
            density="compact"
            variant="outlined"
            rounded="lg"
            hide-details
            clearable
            class="flex-grow-1"
          />
        </div>

        <div
          v-if="selectedIds.length"
          class="all-tags-board__selection d-flex align-center ga-2 px-1 mb-2"
        >
          <span class="text-caption">
            {{ t('all_tags.selected_count', {count: selectedIds.length}) }}
          </span>
          <v-btn
            size="x-small"
            variant="text"
            @click="clearSelection"
          >
            {{ t('all_tags.clear_selection') }}
          </v-btn>
        </div>

        <div class="text-caption text-medium-emphasis mb-2 px-1">
          <v-icon size="14" start>mdi-drag</v-icon>
          {{ t('all_tags.drag_hint') }}
        </div>

        <div
          ref="tagListRef"
          class="all-tags-board__tag-list"
        >
          <div
            v-if="!filteredTags.length"
            class="all-tags-board__empty text-center pa-8"
          >
            <v-icon size="40" class="mb-2 text-medium-emphasis">mdi-tag-off-outline</v-icon>
            <div class="text-body-2 text-medium-emphasis">
              {{ tagSearch.trim() ? t('all_tags.no_tags_filtered') : t('all_tags.no_tags') }}
            </div>
            <TagsAdd
              v-if="!tagSearch.trim()"
              class="mt-4"
              :meta_id="selectedCategory.id"
              button-color="primary"
              button-variant="tonal"
            />
          </div>

          <v-virtual-scroll
            v-else
            :items="filteredTags"
            :item-height="TAG_ROW_HEIGHT"
            :height="tagListHeight"
            :bench="8"
            item-key="id"
            class="all-tags-board__virtual-scroll"
          >
            <template #default="{ item: tag }">
              <div
                class="all-tags-board__tag"
                :class="{'all-tags-board__tag--selected': selectedIds.includes(tag.id)}"
                draggable="true"
                @click="onTagClick(tag, $event)"
                @dblclick.stop="editTag(tag)"
                @dragstart="onTagDragStart(tag, $event)"
                @dragend="onTagDragEnd"
              >
                <v-checkbox-btn
                  :model-value="selectedIds.includes(tag.id)"
                  density="compact"
                  color="primary"
                  class="all-tags-board__tag-check"
                  @click.stop="toggleTagSelection(tag.id)"
                />
                <div class="all-tags-board__tag-main">
                  <div class="text-body-2 font-weight-medium text-truncate">
                    {{ tag.name }}
                  </div>
                  <div
                    v-if="tagSynonymsText(tag)"
                    class="text-caption text-medium-emphasis text-truncate"
                  >
                    {{ tagSynonymsText(tag) }}
                  </div>
                </div>
                <v-btn
                  icon
                  size="x-small"
                  variant="text"
                  @click.stop="editTag(tag)"
                >
                  <v-icon size="16">mdi-pencil-outline</v-icon>
                </v-btn>
                <v-icon size="16" class="all-tags-board__drag-handle text-medium-emphasis">
                  mdi-drag-vertical
                </v-icon>
              </div>
            </template>
          </v-virtual-scroll>
        </div>
      </template>

      <div
        v-else
        class="all-tags-board__empty text-center pa-10"
      >
        <v-icon size="48" class="mb-3 text-medium-emphasis">mdi-tag-multiple-outline</v-icon>
        <div class="text-body-1 font-weight-medium">{{ t('all_tags.select_category') }}</div>
        <div class="text-caption text-medium-emphasis mt-1">
          {{ t('all_tags.select_category_hint') }}
        </div>
      </div>
    </main>

    <DialogMetaManager
      :edit-mode="metaEditMode"
      :meta="metaForDialog"
      :dialog="metaDialog"
      :allowed-types="['array']"
      @updated="onMetaUpdated"
      @created="onMetaCreated"
      @close="closeMetaDialog"
      @delete="onMetaDeleted"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, nextTick, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import TagsAdd from '@/components/app/appbar/elements/TagsAdd.vue'
import DialogMetaManager from '@/components/dialogs/DialogMetaManager.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {metaPath} from '@/composable/useLibraryNavItems'
import {useMoveTagsToCategory} from '@/composable/useMoveTagsToCategory'
import {useAutoListHeight} from '@/composable/useAutoListHeight'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {getDefaultTagCategoryId} from '@/services/ensureStarterMeta'
import {useSettingsStore} from '@/stores/settings'
import {typedApi} from '@/services/typedApi'
import type {Meta, Tag} from '@/types/stores'
import {clearMediaTagDrag} from '@/utils/mediaTagDrag'
import {writeSessionFocusTagsMime} from '@/utils/sessionFocusDrag'
import {normalizeSessionFocusTag} from '@/stores/sessionFocus'

const Draggable = defineAsyncComponent(() => import('vuedraggable'))

const TAG_ROW_HEIGHT = 52

const {t} = useI18n()
const appStore = useAppStore()
const settingsStore = useSettingsStore()
const dialogsStore = useDialogsStore()
const {moveTagsToCategory} = useMoveTagsToCategory()

const categorySearch = ref('')
const tagSearch = ref('')
const selectedMetaId = ref<number | null>(null)
const selectedIds = ref<number[]>([])
const dropTargetMetaId = ref<number | null>(null)
const draggingTagIds = ref<number[]>([])
const categoryDragging = ref(false)
const categoriesEditMode = ref(false)
const categoryRows = ref<Meta[]>([])
const togglingHiddenId = ref<number | null>(null)
const categoryListRef = ref<HTMLElement | null>(null)
const tagListRef = ref<HTMLElement | null>(null)
const {listHeight: tagListHeight} = useAutoListHeight(tagListRef)

const metaDialog = ref(false)
const metaEditMode = ref(false)
const metaForDialog = ref<Meta | null>(null)

const categories = computed(() =>
  orderBy(
    appStore.meta.filter((item) => item.type === 'array'),
    ['order', 'name'],
    ['asc', 'asc'],
  ),
)

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

watch(categories, (items) => {
  if (categoryDragging.value) return
  if (categoriesEqual(categoryRows.value, items)) return
  syncCategoryRows(items)
}, {immediate: true})

const filteredCategories = computed(() => {
  const query = categorySearch.value.trim().toLowerCase()
  if (!query) return categoryRows.value
  return categoryRows.value.filter((category) =>
    String(category.name ?? '').toLowerCase().includes(query),
  )
})

function categoryMatchesSearch(category: Meta): boolean {
  const query = categorySearch.value.trim().toLowerCase()
  if (!query) return true
  return String(category.name ?? '').toLowerCase().includes(query)
}

const defaultCategoryId = computed(() =>
  getDefaultTagCategoryId(appStore.meta, settingsStore.defaultTagCategoryId),
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

const selectedCategory = computed(() =>
  categoryRows.value.find((category) => category.id === selectedMetaId.value) ?? null,
)

const categoryTags = computed(() => {
  if (!selectedMetaId.value) return [] as Tag[]
  return orderBy(
    (appStore.tags || []).filter((tag) => Number(tag.metaId) === selectedMetaId.value),
    [(tag) => String(tag.name ?? '').toLowerCase()],
    ['asc'],
  )
})

const filteredTags = computed(() => {
  const query = tagSearch.value.trim().toLowerCase()
  if (!query) return categoryTags.value
  return categoryTags.value.filter((tag) => {
    const name = String(tag.name ?? '').toLowerCase()
    const synonyms = tagSynonymsText(tag).toLowerCase()
    return name.includes(query) || synonyms.includes(query)
  })
})

watch(
  [selectedCategory, () => filteredTags.value.length],
  async () => {
    await nextTick()
    if (tagListRef.value) {
      tagListHeight.value = Math.max(120, tagListRef.value.clientHeight)
    }
  },
)

watch(
  categories,
  (items) => {
    if (!selectedMetaId.value && items.length) {
      selectedMetaId.value = items[0].id
    } else if (
      selectedMetaId.value
      && !items.some((item) => item.id === selectedMetaId.value)
    ) {
      selectedMetaId.value = items[0]?.id ?? null
    }
  },
  {immediate: true},
)

watch(selectedMetaId, () => {
  clearSelection()
  tagSearch.value = ''
})

function tagSynonymsText(tag: Tag): string {
  const raw = tag.synonyms
  if (!raw) return ''
  return String(raw)
}

function selectCategory(metaId: number) {
  selectedMetaId.value = metaId
}

function clearSelection() {
  selectedIds.value = []
}

function toggleTagSelection(tagId: number) {
  if (selectedIds.value.includes(tagId)) {
    selectedIds.value = selectedIds.value.filter((id) => id !== tagId)
  } else {
    selectedIds.value = [...selectedIds.value, tagId]
  }
}

function onTagClick(tag: Tag, event: MouseEvent) {
  if (event.metaKey || event.ctrlKey) {
    toggleTagSelection(tag.id)
    return
  }
  if (event.shiftKey && selectedIds.value.length) {
    const ids = filteredTags.value.map((item) => item.id)
    const lastId = selectedIds.value[selectedIds.value.length - 1]
    const from = ids.indexOf(lastId)
    const to = ids.indexOf(tag.id)
    if (from >= 0 && to >= 0) {
      const [start, end] = from < to ? [from, to] : [to, from]
      const range = ids.slice(start, end + 1)
      selectedIds.value = [...new Set([...selectedIds.value, ...range])]
      return
    }
  }
  selectedIds.value = [tag.id]
}

function onTagDragStart(tag: Tag, event: DragEvent) {
  const ids = selectedIds.value.includes(tag.id) && selectedIds.value.length > 1
    ? [...selectedIds.value]
    : [tag.id]
  draggingTagIds.value = ids

  const trayTags = resolveTagsByIds(ids)
    .map((entry) => {
      const meta = appStore.getMetaById(Number(entry.metaId))
      return normalizeSessionFocusTag({
        tagId: Number(entry.id),
        metaId: Number(entry.metaId),
        name: String(entry.name || ''),
        icon: meta?.icon ? String(meta.icon) : null,
        color: entry.color ? String(entry.color) : null,
      })
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
  writeSessionFocusTagsMime(event, trayTags)

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'copyMove'
    event.dataTransfer.setData('text/plain', ids.join(','))
  }
}

function onTagDragEnd() {
  dropTargetMetaId.value = null
  draggingTagIds.value = []
  clearMediaTagDrag()
}

function onCategoryDragOver(category: Meta, event: DragEvent) {
  if (!draggingTagIds.value.length) return
  if (Number(category.id) === Number(selectedMetaId.value)) {
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
  if (dropTargetMetaId.value === category.id) {
    dropTargetMetaId.value = null
  }
}

function resolveTagsByIds(ids: number[]): Tag[] {
  const byId = new Map((appStore.tags || []).map((tag) => [Number(tag.id), tag]))
  return ids
    .map((id) => byId.get(Number(id)))
    .filter((tag): tag is Tag => Boolean(tag))
}

function onDropToCategory(category: Meta) {
  const ids = [...draggingTagIds.value]
  dropTargetMetaId.value = null
  draggingTagIds.value = []

  if (!ids.length) return
  if (Number(category.id) === Number(selectedMetaId.value)) return

  const tagsToMove = resolveTagsByIds(ids).filter(
    (tag) => Number(tag.metaId) !== Number(category.id),
  )
  if (!tagsToMove.length) return

  moveTagsToCategory(tagsToMove, Number(category.id), String(category.name ?? ''), {
    clearSelection: false,
    syncItemsList: false,
    allowOpenCategoryAction: false,
  })
  selectedIds.value = []
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

function editTag(tag: Tag) {
  if (!selectedCategory.value) return
  dialogsStore.editTag(tag, selectedCategory.value)
}

function openCreateCategory() {
  metaEditMode.value = false
  metaForDialog.value = null
  metaDialog.value = true
}

function openEditCategory(category: Meta) {
  metaEditMode.value = true
  metaForDialog.value = category
  metaDialog.value = true
}

function closeMetaDialog() {
  metaDialog.value = false
}

async function onMetaUpdated() {
  await reloadMetaCatalog()
  closeMetaDialog()
}

async function onMetaCreated(created?: Meta | null) {
  await reloadMetaCatalog()
  if (created?.id) {
    selectedMetaId.value = created.id
  }
  closeMetaDialog()
}

async function onMetaDeleted() {
  await reloadMetaCatalog()
  closeMetaDialog()
}
</script>

<style scoped lang="scss">
.all-tags-board {
  display: grid;
  grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
  gap: 16px;
  min-height: calc(100vh - 160px);
}

.all-tags-board__categories,
.all-tags-board__tags {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 16px;
  background: rgb(var(--v-theme-surface));
  padding: 12px;
  min-height: 420px;
  display: flex;
  flex-direction: column;
}

.all-tags-board__pane-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.all-tags-board__tags-title {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
}

.all-tags-board__category-list {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.all-tags-board__category-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}

.all-tags-board__tag-list {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.all-tags-board__virtual-scroll {
  height: 100%;
}

.all-tags-board__category {
  height: 44px;
  border-radius: 12px;
  transition: background-color 0.15s ease, outline-color 0.15s ease, opacity 0.15s ease;
  cursor: pointer;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
  }

  &--active {
    background: rgba(var(--v-theme-primary), 0.1);
  }

  &--drop {
    outline: 2px dashed rgb(var(--v-theme-primary));
    outline-offset: -2px;
  }

  &--hidden {
    opacity: 0.55;
  }
}

.all-tags-board__category-ghost {
  opacity: 0.55;
}

.all-tags-board__category-row {
  display: flex;
  align-items: center;
  padding: 6px 8px;
  gap: 4px;
  height: 100%;
}

.all-tags-board__category-icon {
  margin-right: 8px;
}

.all-tags-board__category-drag {
  flex: 0 0 auto;
  cursor: grab;
  opacity: 0.45;

  &:hover {
    opacity: 0.85;
  }

  &--disabled {
    cursor: default;
    opacity: 0.2;
  }
}

.all-tags-board__category-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.all-tags-board__category-count {
  flex-shrink: 0;
  white-space: nowrap;
}

.all-tags-board__category-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.7;
}

.all-tags-board__category--editing:hover .all-tags-board__category-actions,
.all-tags-board__category--editing.all-tags-board__category--active .all-tags-board__category-actions {
  opacity: 1;
}

.all-tags-board__tag {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 52px;
  padding: 0 10px;
  border-radius: 12px;
  cursor: grab;
  user-select: none;

  &:hover {
    background: rgba(var(--v-theme-on-surface), 0.04);
  }

  &--selected {
    background: rgba(var(--v-theme-primary), 0.12);
  }
}

.all-tags-board__tag-check {
  flex: 0 0 auto;
  width: auto;
  max-width: max-content;

  :deep(.v-selection-control) {
    flex: 0 0 auto;
    width: auto;
    min-width: 0;
  }

  :deep(.v-selection-control__wrapper) {
    width: auto;
  }
}

.all-tags-board__tag-main {
  min-width: 0;
  flex: 1 1 auto;
}

.all-tags-board__drag-handle {
  flex: 0 0 auto;
  cursor: grab;
}

.all-tags-board__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

@media (max-width: 960px) {
  .all-tags-board {
    grid-template-columns: 1fr;
  }
}
</style>
