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
          <div class="d-flex align-center justify-space-between mb-3 ga-2 min-width-0">
            <div class="d-flex align-center min-width-0">
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

            <v-btn
              v-tooltip:top="t('all_tags.open_category')"
              icon
              size="small"
              variant="text"
              color="primary"
              class="flex-shrink-0"
              :aria-label="t('all_tags.open_category')"
              @click="openCategoryPage(category.meta)"
            >
              <v-icon size="20">mdi-open-in-new</v-icon>
            </v-btn>
          </div>

          <div class="widget-top-tags__scroll">
            <v-card
              v-for="tag in category.tags"
              :key="tag.id"
              class="widget-top-tags__card"
              :style="categoryCardStyle(category.meta)"
              @click="openTagPage(category.meta, tag)"
              @contextmenu="showTagContextMenu($event, category.meta, tag)"
              rounded="lg"
              variant="outlined"
              flat
            >
              <div
                class="widget-top-tags__preview"
                :style="{aspectRatio: String(categoryImageRatio(category.meta))}"
              >
                <v-img
                  :src="tagDisplayImage(tag)"
                  cover
                  class="widget-top-tags__thumb"
                  @error="onTagImageError(category.meta.id, tag)"
                />

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

    <section
      v-else-if="loading"
      class="widget-top-tags__section mb-6"
      aria-hidden="true"
    >
      <div class="d-flex align-center mb-3 min-width-0 ga-2">
        <v-skeleton-loader
          class="widget-top-tags__skel-avatar"
          type="avatar"
          width="24"
          height="24"
        />
        <div class="widget-top-tags__skel-title min-width-0 flex-grow-1">
          <v-skeleton-loader
            type="heading"
            class="widget-top-tags__skel-line widget-top-tags__skel-line--title mb-1"
          />
          <v-skeleton-loader
            type="text"
            class="widget-top-tags__skel-line widget-top-tags__skel-line--subtitle"
          />
        </div>
      </div>
      <div class="widget-top-tags__scroll">
        <HomeCardSkeleton
          v-for="index in 6"
          :key="index"
          variant="tag"
        />
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted, onBeforeUnmount} from 'vue'
import {useRouter} from 'vue-router'
import path from 'path-browserify'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useI18n} from 'vue-i18n'
import groupBy from 'lodash/groupBy'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import WidgetLazyMount from '@/components/widgets/WidgetLazyMount.vue'
import HomeCardSkeleton from '@/components/widgets/HomeCardSkeleton.vue'
import {IMAGE_UNAVAILABLE_URL} from '@/utils/imageSource'
import {isThumbUnavailable, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'
import {
  getCachedThumb,
  setCachedThumb,
  tagThumbKey,
} from '@/utils/thumbDisplayCache'
import {getMetaName} from '@/utils/metaI18n'
import {getDefaultMediaTypeId} from '@/utils/mediaType'
import {metaPath} from '@/composable/useLibraryNavItems'
import {
  sortMetaItems,
  sortTagItems,
  getTopTagsSubtitleKey,
  META_SORT_MODES,
  type MetaSortMode,
} from '@/utils/metaSort'
import {openItemContextMenu} from '@/composable/openItemContextMenu'
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
const loading = ref(true)
/** Page-settings sort from `/meta?metaId=` for each category. */
const pageSortByMetaId = ref<Record<number, {sortBy: string; sortDir: string}>>({})

const tags = computed(() => store.tags)
const metas = computed(() => store.meta)
const sortMode = computed((): MetaSortMode =>
  (settingsStore.meta_sort_mode as MetaSortMode) || META_SORT_MODES.menu,
)
const visibleCategories = computed(() => tagsTop.value)

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

/** Preview height the default 3:4 card had at 104px width. */
const CARD_PREVIEW_HEIGHT = 104 * 4 / 3
const CARD_MIN_WIDTH = 80
const CARD_MAX_WIDTH = 240
const DEFAULT_IMAGE_RATIO = 3 / 4

/** Image aspect ratio (width / height) from the category settings. */
function categoryImageRatio(meta: Meta): number {
  const ratio = Number(meta.imageAspectRatio)
  return Number.isFinite(ratio) && ratio > 0 ? ratio : DEFAULT_IMAGE_RATIO
}

/** Keep the row height stable; card width follows the category ratio. */
function categoryCardStyle(meta: Meta): Record<string, string> {
  const width = Math.round(Math.min(
    CARD_MAX_WIDTH,
    Math.max(CARD_MIN_WIDTH, CARD_PREVIEW_HEIGHT * categoryImageRatio(meta)),
  ))
  return {width: `${width}px`, flex: `0 0 ${width}px`}
}

function tagDisplayImage(tag: TopTagItem): string {
  if (isThumbUnavailable(tag.image)) return IMAGE_UNAVAILABLE_URL
  return tag.image || IMAGE_UNAVAILABLE_URL
}

function onTagImageError(metaId: number | string, tag: TopTagItem) {
  tag.image = IMAGE_UNAVAILABLE_URL
  setCachedThumb(tagThumbKey(metaId, tag.id, 'main'), IMAGE_UNAVAILABLE_URL)
}

async function resolveTagImageUrl(metaId: string, tagId: number): Promise<string> {
  const cacheKey = tagThumbKey(metaId, tagId, 'main')
  const cached = getCachedThumb(cacheKey)
  if (cached) {
    return isThumbUnavailable(cached) ? IMAGE_UNAVAILABLE_URL : cached
  }

  if (!store.dbPath) return IMAGE_UNAVAILABLE_URL

  const absPath = path.join(store.dbPath, 'meta', String(metaId), `${tagId}_main.jpg`)
  if (!await checkFileExists(absPath)) {
    setCachedThumb(cacheKey, IMAGE_UNAVAILABLE_URL)
    return IMAGE_UNAVAILABLE_URL
  }

  const url = resolveTagThumbDisplayUrl({
    dbPath: store.dbPath,
    metaId,
    tagId,
    type: 'main',
  })
  setCachedThumb(cacheKey, url)
  return url
}

async function loadPageSorts(metaIds: number[]) {
  const missing = metaIds.filter((id) => pageSortByMetaId.value[id] == null)
  if (!missing.length) return

  const entries = await Promise.all(missing.map(async (metaId) => {
    try {
      // Lookup only — never create defaults (that forced "createdAt" on home).
      const res = await typedApi.findPageSettings({
        metaId,
        tagId: null,
        mediaTypeId: null,
        tabId: null,
      })
      const settings = res.data
      return [metaId, {
        sortBy: String(settings?.sortBy || ''),
        sortDir: String(settings?.sortDir || ''),
      }] as const
    } catch {
      return [metaId, {sortBy: '', sortDir: ''}] as const
    }
  }))

  pageSortByMetaId.value = {
    ...pageSortByMetaId.value,
    ...Object.fromEntries(entries),
  }
}

async function fetchTagsForCategory(
  meta: Meta,
  catalogTags: TopTagItem[],
  limit: number,
  pageSort: {sortBy: string; sortDir: string},
): Promise<TopTagItem[]> {
  // Match category page SQL order (mediaCount, dates, etc.).
  if (sortMode.value === META_SORT_MODES.menu) {
    try {
      const res = await typedApi.postTagItems({
        metaId: Number(meta.id),
        page: 1,
        limit,
        skipTotals: true,
        sortBy: pageSort.sortBy,
        direction: pageSort.sortDir,
      })
      const items = (res.data?.items || []) as TopTagItem[]
      if (items.length) return items
    } catch {
      // Fall through to catalog sort.
    }
  }

  return sortTagItems(catalogTags, sortMode.value, pageSort).slice(0, limit) as TopTagItem[]
}

/** Categories (with tags) in menu order; data is loaded lazily from the top. */
let candidateMetas: Meta[] = []
let buildSeq = 0
let loadingMore = false

async function buildCategory(
  meta: Meta,
  limit: number,
): Promise<TopTagsCategory | null> {
  const metaId = String(meta.id)
  const catalogTags = groupBy(tags.value, 'metaId')[metaId] as TopTagItem[] | undefined
  if (!catalogTags?.length) return null

  const pageSort = resolveCategorySort(meta)
  const sorted = await fetchTagsForCategory(meta, catalogTags, limit, pageSort)
  if (!sorted.length) return null

  const tagsWithImages = await Promise.all(sorted.map(async (tag) => ({
    ...tag,
    image: await resolveTagImageUrl(metaId, tag.id),
  })))

  const total = catalogTags.length
  return {
    meta: {...meta, sortBy: pageSort.sortBy, sortDir: pageSort.sortDir},
    tags: tagsWithImages,
    limit,
    total,
    isNotAllLoaded: total > limit,
  } satisfies TopTagsCategory
}

async function buildCategories(list: Meta[]): Promise<TopTagsCategory[]> {
  await loadPageSorts(list.map((meta) => Number(meta.id)).filter((id) => id > 0))
  const results = await Promise.all(list.map((meta) => buildCategory(meta, props.limit)))
  return results.filter((group): group is TopTagsCategory => group != null)
}

async function getTagsTop(activeGroup: TopTagsCategory | null = null) {
  if (!metas.value.length) {
    tagsTop.value = []
    candidateMetas = []
    loading.value = false
    return
  }

  // "Show more" on one category: rebuild only that category in place.
  if (activeGroup) {
    const index = tagsTop.value.findIndex((group) => group.meta.id === activeGroup.meta.id)
    if (index < 0) return
    const updated = await buildCategory(activeGroup.meta, activeGroup.limit + 10)
    const current = tagsTop.value.findIndex((group) => group.meta.id === activeGroup.meta.id)
    if (updated && current >= 0) {
      const next = tagsTop.value.slice()
      next[current] = updated
      tagsTop.value = next
    }
    return
  }

  const seq = ++buildSeq
  loading.value = !tagsTop.value.length
  // Fresh page sorts on full rebuild so home tracks the category page.
  pageSortByMetaId.value = {}

  try {
    const withTags = new Set(tags.value.map((tag) => String(tag.metaId)))
    // Category order always matches the navigation menu.
    candidateMetas = sortMetaItems(
      metas.value.filter((meta) => meta.type === 'array' && !meta.hidden),
      META_SORT_MODES.menu,
    ).filter((meta) => withTags.has(String(meta.id)))

    // Only the first screenful is fetched; the rest loads on scroll.
    const groups = await buildCategories(candidateMetas.slice(0, visibleCategoryCount.value))
    if (seq !== buildSeq) return
    tagsTop.value = groups
  } finally {
    if (seq === buildSeq) loading.value = false
  }
}

async function revealMoreCategories(index: number) {
  if (loadingMore || index < tagsTop.value.length - 1) return
  const loadedIds = new Set(tagsTop.value.map((group) => String(group.meta.id)))
  const rest = candidateMetas.filter((meta) => !loadedIds.has(String(meta.id)))
  if (!rest.length) return

  loadingMore = true
  const seq = buildSeq
  try {
    const groups = await buildCategories(rest.slice(0, REVEAL_CATEGORY_BATCH))
    if (seq !== buildSeq) return
    visibleCategoryCount.value += REVEAL_CATEGORY_BATCH
    tagsTop.value = [...tagsTop.value, ...groups]
  } finally {
    loadingMore = false
  }
}

function openTagPage(meta: Meta, tag: TopTagItem) {
  router.push(`/tag?metaId=${meta.id}&tagId=${tag.id}&mediaTypeId=${getDefaultMediaTypeId(store.mediaTypes)}`)
}

function showTagContextMenu(event: MouseEvent, meta: Meta, tag: TopTagItem) {
  const fullTag = store.getTagById(Number(tag.id)) || tag
  openItemContextMenu(event, fullTag, 'tag', meta)
}

function openCategoryPage(meta: Meta) {
  router.push(metaPath(meta.id))
}

let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** Coalesce bursts (tags + meta + thumb keys change together at startup). */
function refreshTagsTop() {
  if (refreshTimer) clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => {
    refreshTimer = null
    void getTagsTop()
  }, 80)
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

onBeforeUnmount(() => {
  if (refreshTimer) clearTimeout(refreshTimer)
  buildSeq++
})

onMounted(() => {
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

  &__skel-avatar {
    flex: 0 0 auto;
    background: transparent !important;
    padding: 0 !important;

    :deep(.v-skeleton-loader__bone) {
      margin: 0;
      width: 24px !important;
      height: 24px !important;
      border-radius: 6px;
    }
  }

  &__skel-title {
    overflow: hidden;
    max-width: 100%;

    :deep(.v-skeleton-loader) {
      max-width: 100%;
      background: transparent !important;
      padding: 0 !important;
    }
  }

  &__skel-line {
    :deep(.v-skeleton-loader__bone) {
      margin-block: 2px;
      max-width: 100%;
    }

    &--title :deep(.v-skeleton-loader__bone) {
      width: 42% !important;
      max-width: 220px;
    }

    &--subtitle :deep(.v-skeleton-loader__bone) {
      width: 28% !important;
      max-width: 160px;
    }
  }
}
</style>
