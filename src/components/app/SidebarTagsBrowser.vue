<template>
  <div class="sidebar-tags-browser">
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
    </div>

    <div
      v-if="!categories.length"
      class="sidebar-tags-browser__empty text-medium-emphasis"
    >
      {{ t('browser_layout.tags_empty') }}
    </div>

    <div
      v-for="category in categories"
      :key="category.meta.id"
      class="sidebar-tags-browser__category"
    >
      <div class="sidebar-tags-browser__category-header">
        <button
          type="button"
          class="sidebar-tags-browser__category-toggle"
          :aria-expanded="isExpanded(category.meta.id)"
          :aria-label="category.meta.name"
          @click="toggleCategory(category.meta.id)"
        >
          <v-icon size="18">
            {{ isExpanded(category.meta.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
          </v-icon>
        </button>

        <button
          type="button"
          class="sidebar-tags-browser__category-link"
          :class="{'sidebar-tags-browser__category-link--active': isCategoryPageActive(category.meta.id)}"
          :title="t('all_tags.open_category')"
          @click="openCategoryPage(category.meta.id)"
        >
          <v-icon
            v-if="category.meta.icon"
            size="16"
            class="mr-1 opacity-70"
          >
            mdi-{{ category.meta.icon }}
          </v-icon>
          <span class="sidebar-tags-browser__category-name">{{ category.meta.name }}</span>
          <span class="sidebar-tags-browser__category-count">{{ category.tags.length }}</span>
          <v-icon
            size="14"
            class="sidebar-tags-browser__category-open"
          >
            mdi-open-in-new
          </v-icon>
        </button>
      </div>

      <div
        v-if="isExpanded(category.meta.id)"
        class="sidebar-tags-browser__tags"
      >
        <button
          v-for="tag in category.tags"
          :key="tag.id"
          type="button"
          class="sidebar-tags-browser__tag"
          :class="{
            'sidebar-tags-browser__tag--active': isTagFilterActive(tag.id),
            'sidebar-tags-browser__tag--favorite': tag.favorite,
          }"
          :title="tag.name"
          @click="onTagClick(tag)"
          @dblclick.prevent="openTagPage(tag)"
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
          v-if="!category.tags.length"
          class="sidebar-tags-browser__empty text-caption text-medium-emphasis px-3 py-1"
        >
          {{ t('browser_layout.no_matching_tags') }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, reactive, ref, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {metaPath, useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {useBrowserTagFilter} from '@/composable/useBrowserTagFilter'
import type {Meta, Tag} from '@/types/stores'

const STORAGE_KEY = 'mediachips.browserTagsExpanded'

const {t} = useI18n()
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const {metaVisible} = useLibraryNavItems()
const {isTagFilterActive, filterByTag} = useBrowserTagFilter()

const search = ref('')
const expanded = reactive<Record<number, boolean>>({})

function onSearchInput(value: string | null): void {
  search.value = value ?? ''
}

function clearSearch(): void {
  search.value = ''
}

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

loadExpanded()

watch(metaVisible, (metas) => {
  for (const meta of metas) {
    if (expanded[meta.id] === undefined) {
      expanded[meta.id] = true
    }
  }
  persistExpanded()
}, {immediate: true})

const categories = computed(() => {
  const query = search.value.trim().toLowerCase()

  return metaVisible.value.map((meta: Meta) => {
    let tags = appStore.getTagsByMetaId(meta.id) as Tag[]
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

    return {meta, tags}
  }).filter((category) => !query || category.tags.length > 0 || String(category.meta.name || '').toLowerCase().includes(query))
})

function isExpanded(metaId: number): boolean {
  return expanded[metaId] !== false
}

function toggleCategory(metaId: number): void {
  expanded[metaId] = !isExpanded(metaId)
  persistExpanded()
}

function isCategoryPageActive(metaId: number): boolean {
  return route.path === '/meta' && String(route.query.metaId) === String(metaId)
}

function openCategoryPage(metaId: number): void {
  void router.push(metaPath(metaId))
}

async function onTagClick(tag: Tag): Promise<void> {
  await filterByTag(tag)
}

function openTagPage(tag: Tag): void {
  if (tag.metaId == null) return
  void router.push(`/tag?metaId=${tag.metaId}&tagId=${tag.id}`)
}
</script>

<style scoped lang="scss">
.sidebar-tags-browser {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.sidebar-tags-browser__toolbar {
  padding: 8px 10px 10px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

.sidebar-tags-browser__search {
  font-size: 0.8125rem;

  :deep(.v-field) {
    background: rgba(var(--v-theme-on-surface), 0.04);
  }

  :deep(.v-field--focused) {
    background: transparent;
  }

  :deep(.v-field__input) {
    min-height: 34px;
    padding-top: 6px;
    padding-bottom: 6px;
  }

  :deep(.v-field__outline) {
    --v-field-border-opacity: 0.22;
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

.sidebar-tags-browser__empty {
  padding: 8px 12px;
  font-size: 0.75rem;
}

.sidebar-tags-browser__category {
  margin-bottom: 2px;
}

.sidebar-tags-browser__category-header {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 2px;
  padding: 2px 4px;
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
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.72;

  &:hover {
    opacity: 1;
    background: rgba(var(--v-theme-on-surface), 0.05);

    .sidebar-tags-browser__category-open {
      opacity: 0.7;
    }
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

.sidebar-tags-browser__category-open {
  flex-shrink: 0;
  margin-left: 4px;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.sidebar-tags-browser__tags {
  padding: 0 4px 6px;
}

.sidebar-tags-browser__tag {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 3px 8px 3px 22px;
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
