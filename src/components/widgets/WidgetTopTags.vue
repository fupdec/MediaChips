<template>
  <div v-if="tagsTop.length" class="widget-top-tags">
    <section
      v-for="category in tagsTop"
      :key="category.meta.id"
      class="widget-top-tags__section mb-6"
    >
      <div class="d-flex align-center mb-3 min-width-0">
        <v-icon class="mr-2 flex-shrink-0" size="24">
          mdi-{{ category.meta.icon || 'tag' }}
        </v-icon>

        <div class="min-width-0">
          <div class="text-h6 text-truncate">
            {{ getMetaName(category.meta, t) }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ t(subtitleKey, { count: category.tags.length }) }}
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
          elevation="2"
          hover
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
          @click="getTagsTop(category)"
          class="widget-top-tags__more"
          type="button"
        >
          <v-icon color="primary" size="22">mdi-plus</v-icon>
          <span class="text-caption text-medium-emphasis mt-1">
            {{ t('widgets.top_tags.show_more_short', { count: Math.min(10, category.total - category.limit) }) }}
          </span>
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, watch, onMounted} from "vue"
import {useRouter} from "vue-router"
import {useAppStore} from "@/stores/app"
import {useSettingsStore} from "@/stores/settings"
import {useI18n} from 'vue-i18n'
import groupBy from 'lodash/groupBy'
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
import type { TopTagsCategory, TopTagItem } from '@/types/widgets'
import type { Meta } from '@/types/stores'

const props = withDefaults(defineProps<{
  limit?: number
}>(), {
  limit: 10,
})

const store = useAppStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const {t} = useI18n()

const tagsTop = ref<TopTagsCategory[]>([])

const tags = computed(() => store.tags)
const metas = computed(() => store.meta)
const sortMode = computed((): MetaSortMode =>
  (settingsStore.meta_sort_mode as MetaSortMode) || META_SORT_MODES.menu,
)
const subtitleKey = computed(() => getTopTagsSubtitleKey(sortMode.value))

function resolveTagImageUrl(metaId: string, tagId: number): string {
  return resolveTagThumbDisplayUrl({
    dbPath: store.dbPath,
    metaId,
    tagId,
    type: 'main',
  })
}

function getTagsTop(activeGroup: TopTagsCategory | null = null) {
  if (!metas.value.length) return

  const grouped = groupBy(tags.value, "metaId")
  const groups: TopTagsCategory[] = []
  const visibleMetas = sortMetaItems(
    metas.value.filter((meta) => meta.type === 'array' && !meta.hidden),
    sortMode.value,
  )

  for (const meta of visibleMetas) {
    const metaId = String(meta.id)
    if (!grouped[metaId]?.length) continue

    let limit = props.limit

    if (activeGroup && activeGroup.meta.id === meta.id) {
      limit = activeGroup.limit + 10
    }

    const sorted = sortTagItems(grouped[metaId] as TopTagItem[], sortMode.value).slice(0, limit) as TopTagItem[]
    if (!sorted.length) continue

    const tagsWithImages = sorted.map((tag) => ({
      ...tag,
      image: resolveTagImageUrl(metaId, tag.id),
    }))

    const total = grouped[metaId].length

    groups.push({
      meta,
      tags: tagsWithImages,
      limit,
      total,
      isNotAllLoaded: total > limit,
    })
  }

  tagsTop.value = groups
}

function openTagPage(meta: Meta, tag: TopTagItem) {
  router.push(`/tag?metaId=${meta.id}&tagId=${tag.id}&mediaTypeId=${getDefaultMediaTypeId(store.mediaTypes)}`)
}

watch(tags, () => getTagsTop())
watch(metas, () => getTagsTop())
watch(() => props.limit, () => getTagsTop())
watch(sortMode, () => getTagsTop())

onMounted(() => {
  window.dispatchEvent(new CustomEvent("getTags"))
  getTagsTop()
})
</script>

<style lang="scss" scoped>
.widget-top-tags {
  &__scroll {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    overflow-x: auto;
    overflow-y: hidden;
    padding-bottom: 4px;
    scroll-snap-type: x proximity;
    -webkit-overflow-scrolling: touch;

    & > * {
      scroll-snap-align: start;
    }
  }

  &__card {
    width: 104px;
    flex: 0 0 104px;
    overflow: hidden;
    cursor: pointer;
  }

  &__preview {
    position: relative;
    aspect-ratio: 3 / 4;
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
    min-height: 36px;
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
