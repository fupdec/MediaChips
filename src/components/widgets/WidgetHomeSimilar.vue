<template>
  <section
    v-if="loading || seedItem || items.length"
    class="widget-home-similar mb-6"
  >
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center text-h6">
        <v-icon class="mr-2" size="24">mdi-creation-outline</v-icon>
        <span>{{ t('home.widgets.similar') }}</span>
      </div>

      <div class="d-flex align-center ga-1">
        <v-btn
          @click="loadSimilar"
          :loading="loading"
          color="primary"
          icon
          size="small"
          variant="text"
          :title="t('home.widgets.reshuffle')"
        >
          <v-icon>mdi-shuffle</v-icon>
        </v-btn>

        <v-btn
          v-if="items.length"
          @click="onViewAll"
          color="primary"
          variant="text"
          rounded
          size="small"
        >
          {{ t('home.widgets.view_all') }}
          <v-icon end size="18">mdi-chevron-right</v-icon>
        </v-btn>
      </div>
    </div>

    <div
      v-if="seedItem || items.length"
      class="widget-home-similar__scroll"
    >
      <template v-if="seedItem">
        <WidgetMediaCard
          :item="seedItem"
          :thumb="seedItem.thumb"
          :badge="t('home.widgets.similar_seed_badge')"
          variant="views"
          @click="onOpen(seedItem)"
        />
        <div
          class="widget-home-similar__divider"
          aria-hidden="true"
        >
          <v-icon size="18" color="primary">mdi-approximately-equal</v-icon>
        </div>
      </template>

      <WidgetMediaCard
        v-for="item in items"
        :key="item.id"
        :item="item"
        :thumb="item.thumb"
        variant="views"
        @click="onOpen(item)"
      />
    </div>

    <div
      v-else
      class="widget-home-similar__scroll"
      aria-hidden="true"
    >
      <div
        v-for="index in 5"
        :key="index"
        class="widget-home-similar__skeleton"
        :class="{'widget-home-similar__skeleton--seed': index === 1}"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useOpenMediaList} from '@/utils/openMediaList'
import {loadHomeMediaThumbs} from '@/utils/homeMediaThumbs'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {findMediaTypeById} from '@/utils/mediaType'
import WidgetMediaCard from '@/components/widgets/WidgetMediaCard.vue'
import type {HomeMediaItem} from '@/types/widgets'
import type {ParsedHomeSimilarResponse} from '@shared/schemas/home'

const props = withDefaults(defineProps<{
  limit?: number
}>(), {
  limit: 12,
})

const {t} = useI18n()
const appStore = useAppStore()
const itemsStore = useItemsStore()
const {openMediaList} = useOpenMediaList()

const loading = ref(false)
const payload = ref<ParsedHomeSimilarResponse>({seed: null, seedItem: null, items: []})
const seedItem = ref<HomeMediaItem | null>(null)
const items = ref<HomeMediaItem[]>([])

async function loadSimilar() {
  loading.value = true
  try {
    const res = await typedApi.getHomeSimilar({limit: props.limit})
    payload.value = res.data
    const nextSeed = (res.data.seedItem || null) as HomeMediaItem | null
    const nextItems = (res.data.items || []) as HomeMediaItem[]
    const withThumbs = [nextSeed, ...nextItems].filter(Boolean) as HomeMediaItem[]
    await loadHomeMediaThumbs(withThumbs, appStore.mediaTypes, appStore.mediaPath)
    seedItem.value = nextSeed
    items.value = nextItems
  } catch (error) {
    console.error(error)
    payload.value = {seed: null, seedItem: null, items: []}
    seedItem.value = null
    items.value = []
  } finally {
    loading.value = false
  }
}

async function onOpen(item: HomeMediaItem) {
  const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
  const kind = resolveOpenMediaKind(mediaType, {path: item.path})
  const queue = [
    ...(seedItem.value ? [seedItem.value] : []),
    ...items.value,
  ]

  if (kind === 'play-av') {
    await itemsStore.playVideo({
      video: item,
      videos: queue.length ? queue : [item],
    })
    return
  }
  if (kind === 'view-image') {
    itemsStore.viewImage({image: item})
    return
  }
  if (kind === 'preview-text' || kind === 'open-path') {
    openTextMedia(item)
    return
  }
  await openMediaList({mediaTypeId: item.mediaTypeId})
}

function onViewAll() {
  const seed = payload.value.seed
  const ids = [
    ...(seedItem.value ? [Number(seedItem.value.id)] : []),
    ...items.value.map((item) => Number(item.id)),
  ].filter((id) => id > 0)
  if (!ids.length) return
  const seedName = String(seed?.name || seed?.basename || seedItem.value?.name || '').trim()
  void openMediaList({
    mediaTypeId: seed?.mediaTypeId != null
      ? Number(seed.mediaTypeId)
      : seedItem.value?.mediaTypeId,
    ids,
    scope: {
      kind: 'similar',
      label: seedName
        ? t('home.widgets.similar_to', {name: seedName})
        : t('filters.similar_scope'),
    },
  })
}

watch(() => props.limit, () => {
  void loadSimilar()
})

onMounted(() => {
  void loadSimilar()
})
</script>

<style lang="scss" scoped>
.widget-home-similar {
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

  &__divider {
    flex: 0 0 auto;
    align-self: center;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    opacity: 0.7;
  }

  &__skeleton {
    width: 148px;
    flex: 0 0 148px;
    align-self: stretch;
    min-height: 148px;
    border-radius: 8px;
    border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
    background: rgba(var(--v-theme-on-surface), 0.06);

    &--seed {
      border-color: rgba(var(--v-theme-primary), 0.35);
    }
  }
}
</style>
