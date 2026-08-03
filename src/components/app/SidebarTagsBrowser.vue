<template>
  <div class="sidebar-tags-browser">
    <div class="sidebar-tags-browser__toolbar">
      <v-text-field
        v-model="search"
        density="compact"
        variant="plain"
        hide-details
        single-line
        clearable
        :placeholder="t('browser_layout.tags_search')"
        prepend-inner-icon="mdi-magnify"
        class="sidebar-tags-browser__search"
      />
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
      <button
        type="button"
        class="sidebar-tags-browser__category-header"
        @click="toggleCategory(category.meta.id)"
      >
        <v-icon size="18" class="mr-1">
          {{ isExpanded(category.meta.id) ? 'mdi-chevron-down' : 'mdi-chevron-right' }}
        </v-icon>
        <v-icon
          v-if="category.meta.icon"
          size="16"
          class="mr-1 opacity-70"
        >
          mdi-{{ category.meta.icon }}
        </v-icon>
        <span class="sidebar-tags-browser__category-name">{{ category.meta.name }}</span>
        <span class="sidebar-tags-browser__category-count">{{ category.tags.length }}</span>
      </button>

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
import {useRouter} from 'vue-router'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useLibraryNavItems} from '@/composable/useLibraryNavItems'
import {useBrowserTagFilter} from '@/composable/useBrowserTagFilter'
import type {Meta, Tag} from '@/types/stores'

const STORAGE_KEY = 'mediachips.browserTagsExpanded'

const {t} = useI18n()
const router = useRouter()
const appStore = useAppStore()
const {metaVisible} = useLibraryNavItems()
const {isTagFilterActive, filterByTag} = useBrowserTagFilter()

const search = ref('')
const expanded = reactive<Record<number, boolean>>({})

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
  padding: 4px 8px 8px;
  position: sticky;
  top: 0;
  z-index: 1;
  background: rgb(var(--v-theme-surface));
}

.sidebar-tags-browser__search {
  font-size: 0.8rem;

  :deep(.v-field__input) {
    min-height: 28px;
    padding-top: 4px;
    padding-bottom: 4px;
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
  padding: 4px 8px;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  opacity: 0.72;
  border-radius: 6px;

  &:hover {
    opacity: 1;
    background: rgba(var(--v-theme-on-surface), 0.05);
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
