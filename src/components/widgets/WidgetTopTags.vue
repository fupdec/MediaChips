<template>
  <div class="widget-top-tags">
    <template v-if="tagsTop.length">
      <WidgetLazyMount
        v-for="(category, index) in visibleCategories"
        :key="category.meta.id"
        class="mb-6"
        min-height="220px"
        @activate="revealMoreCategories(index)"
      >
        <section class="widget-top-tags__section">
          <div class="d-flex align-center mb-3 min-width-0">
            <v-icon class="mr-2 flex-shrink-0" size="24">
              mdi-{{ category.meta.icon || 'tag' }}
            </v-icon>

            <div class="min-width-0">
              <div class="text-h6 text-truncate">
                {{ getMetaName(category.meta, t) }}
              </div>
              <div class="text-caption text-medium-emphasis">
                {{ t(categorySubtitleKey(category), {count: category.tags.length}) }}
              </div>
            </div>
          </div>

          <div class="widget-top-tags__scroll">
            <v-card
              v-for="tag in category.tags"
              :key="tag.id"
              class="widget-top-tags__card"
              @click="openTagPage(category.meta, tag)"
              rounded="lg"
              variant="outlined"
              flat
            >
              <div class="widget-top-tags__preview">
                <v-img
                  v-if="tag.image"
                  :src="tag.image"
                  cover
                  class="widget-top-tags__thumb"
                />
                <div v-else class="widget-top-tags__placeholder">
                  <v-icon color="grey-darken-1" size="28">mdi-tag-outline</v-icon>
                </div>

                <v-chip
                  v-if="tag.views && sortMode === META_SORT_MODES.popularity"
                  class="widget-top-tags__badge"
                  color="primary"
                  size="x-small"
                  variant="flat"
                >
                  <v-icon start size="12">mdi-eye</v-icon>
                  {{ tag.views }}
                </v-chip>
              </div>

              <div class="widget-top-tags__body pa-2">
                <div class="text-caption text-truncate">{{ tag.name }}</div>
              </div>
            </v-card>

            <button
              v-if="category.isNotAllLoaded"
              @click="void getTagsTop(category)"
              class="widget-top-tags__more"
              type="button"
            >
              <v-icon color="primary" size="22">mdi-plus</v-icon>
              <span class="text-caption text-medium-emphasis mt-1">
                {{ t('widgets.top_tags.show_more_short', {count: Math.min(10, category.total - category.limit)}) }}
              </span>
            </button>
          </div>
        </section>
      </WidgetLazyMount>
    </template>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useI18n} from 'vue-i18n'
import groupBy from 'lodash/groupBy'
import {typedApi} from '@/services/typedApi'
import WidgetLazyMount from '@/components/widgets/WidgetLazyMount.vue'
import {resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {getMetaName} from '@/utils/metaI18n'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {
  sortMetaItems,
  sortTagItems,
  getTopTagsSubtitleKey,
  META_SORT_MODES,
  type MetaSortMode,
} from '@/utils/metaSort'
import type {TopTagsCategory, TopTagItem} from '@/types/widgets'
import type {Meta} from '@/types/stores'

const INITIAL_VISIBLE_CATEGORIES = 2
const REVEAL_CATEGORY_BATCH = 2

const props = withDefaults(defineProps<{
  limit?: number
}>(), {
  limit: 10,
})

const store = useAppStore()
const itemsStore = useItemsStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const {t} = useI18n()

const tagsTop = ref<TopTagsCategory[]>([])
const visibleCategoryCount = ref(INITIAL_VISIBLE_CATEGORIES)
/** Page-settings sort from `/meta?metaId=` for each category. */
const pageSortByMetaId = ref<Record<number, {sortBy: string; sortDir: string}>>({})

const tags = computed(() => store.tags)
const metas = computed(() => store.meta)
const sortMode = computed((): MetaSortMode =>
  (settingsStore.meta_sort_mode as MetaSortMode) || META_SORT_MODES.menu,
)
const visibleCategories = computed(() => tagsTop.value.slice(0, visibleCategoryCount.value))

function resolveCategorySort(meta: Meta): {sortBy: string; sortDir: string} {
  const pageSort = pageSortByMetaId.value[Number(meta.id)]
  let sortBy = String(pageSort?.sortBy || meta.sortBy || 'createdAt')
  let sortDir = String(pageSort?.sortDir || meta.sortDir || 'asc')
  // Widget always shows a stable list — map page shuffle to name.
  if (sortBy === 'shuffle') {
    sortBy = 'name'
    sortDir = 'asc'
  }
  return {sortBy, sortDir}
}

function categorySubtitleKey(category: TopTagsCategory): string {
  const {sortBy} = resolveCategorySort(category.meta)
  return getTopTagsSubtitleKey(
    sortMode.value,
    sortMode.value === META_SORT_MODES.menu ? sortBy : null,
  )
}

function resolveTagImageUrl(metaId: string, tagId: number): string {
  return resolveTagThumbDisplayUrl({
    dbPath: store.dbPath,
    metaId,
    tagId,
    type: 'main',
  })
}

async function loadPageSorts(metaIds: number[]) {
  const missing = metaIds.filter((id) => pageSortByMetaId.value[id] == null)
  if (!missing.length) return

  const entries = await Promise.all(missing.map(async (metaId) => {
    try {
      const res = await typedApi.fetchPageSettings({
        metaId,
        tagId: null,
        mediaTypeId: null,
        tabId: null,
      })
      const settings = res.data?.[0]
      return [metaId, {
        sortBy: String(settings?.sortBy || ''),
        sortDir: String(settings?.sortDir || 'asc'),
      }] as const
    } catch {
      return [metaId, {sortBy: '', sortDir: 'asc'}] as const
    }
  }))

  pageSortByMetaId.value = {
    ...pageSortByMetaId.value,
    ...Object.fromEntries(entries),
  }
}

async function getTagsTop(activeGroup: TopTagsCategory | null = null) {
  if (!metas.value.length) return

  // Fresh page sorts on full rebuild so home tracks the category page.
  if (!activeGroup) {
    pageSortByMetaId.value = {}
  }

  const grouped = groupBy(tags.value, 'metaId')
  // Category order always matches the navigation menu.
  const visibleMetas = sortMetaItems(
    metas.value.filter((meta) => meta.type === 'array' && !meta.hidden),
    META_SORT_MODES.menu,
  )
  const metaIds = visibleMetas.map((meta) => Number(meta.id)).filter((id) => id > 0)
  await loadPageSorts(metaIds)

  const groups: TopTagsCategory[] = []
  for (const meta of visibleMetas) {
    const metaId = String(meta.id)
    if (!grouped[metaId]?.length) continue

    let limit = props.limit
    if (activeGroup && activeGroup.meta.id === meta.id) {
      limit = activeGroup.limit + 10
    }

    const pageSort = resolveCategorySort(meta)
    const sorted = sortTagItems(
      grouped[metaId] as TopTagItem[],
      sortMode.value,
      pageSort,
    ).slice(0, limit) as TopTagItem[]
    if (!sorted.length) continue

    const tagsWithImages = sorted.map((tag) => ({
      ...tag,
      image: resolveTagImageUrl(metaId, tag.id),
    }))

    const total = grouped[metaId].length
    groups.push({
      meta: {
        ...meta,
        sortBy: pageSort.sortBy,
        sortDir: pageSort.sortDir,
      },
      tags: tagsWithImages,
      limit,
      total,
      isNotAllLoaded: total > limit,
    })
  }

  tagsTop.value = groups
  visibleCategoryCount.value = Math.min(
    Math.max(visibleCategoryCount.value, INITIAL_VISIBLE_CATEGORIES),
    groups.length || INITIAL_VISIBLE_CATEGORIES,
  )
}

function revealMoreCategories(index: number) {
  if (index < visibleCategoryCount.value - 1) return
  if (visibleCategoryCount.value >= tagsTop.value.length) return
  visibleCategoryCount.value = Math.min(
    tagsTop.value.length,
    visibleCategoryCount.value + REVEAL_CATEGORY_BATCH,
  )
}

function openTagPage(meta: Meta, tag: TopTagItem) {
  router.push(`/tag?metaId=${meta.id}&tagId=${tag.id}&mediaTypeId=${getDefaultMediaTypeId(store.mediaTypes)}`)
}

function refreshTagsTop() {
  void getTagsTop()
}

watch(tags, refreshTagsTop)
watch(metas, refreshTagsTop)
watch(() => props.limit, refreshTagsTop)
watch(
  () => itemsStore.thumbRefreshKeys,
  refreshTagsTop,
  {deep: true},
)
watch(sortMode, () => {
  visibleCategoryCount.value = INITIAL_VISIBLE_CATEGORIES
  refreshTagsTop()
})

onMounted(() => {
  window.dispatchEvent(new CustomEvent('getTags'))
  refreshTagsTop()
})
</script>

<style lang="scss" scoped>
.widget-top-tags {
  &__scroll {
    display: flex;
    align-items: stretch;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 2px;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;

    & > * {
      scroll-snap-align: start;
    }
  }

  &__card {
    width: 104px;
    flex: 0 0 104px;
    align-self: stretch;
    height: auto;
    min-height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: pointer;
    border-color: rgba(var(--v-theme-on-surface), 0.12) !important;
    box-shadow: none !important;
    transition: border-color 180ms ease;

    &:hover {
      border-color: rgb(var(--v-theme-primary)) !important;
    }
  }

  &__preview {
    position: relative;
    aspect-ratio: 3 / 4;
    flex: 0 0 auto;
    overflow: hidden;
    background: rgba(var(--v-theme-on-surface), 0.06);
  }

  &__thumb {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    :deep(.v-img__img) {
      object-fit: cover;
    }
  }

  &__placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  &__badge {
    position: absolute;
    right: 6px;
    bottom: 6px;
    z-index: 1;
  }

  &__body {
    flex: 1 1 auto;
    min-height: 36px;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  &__more {
    width: 72px;
    flex: 0 0 72px;
    align-self: stretch;
    min-height: 148px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px dashed rgba(var(--v-theme-primary), 0.45);
    border-radius: 12px;
    background: rgba(var(--v-theme-primary), 0.04);
    cursor: pointer;
    transition: background-color 0.15s ease, border-color 0.15s ease;

    &:hover {
      background: rgba(var(--v-theme-primary), 0.08);
      border-color: rgba(var(--v-theme-primary), 0.7);
    }
  }
}
</style>
