<template>
  <section
    v-if="loading || items.length"
    class="widget-home-similar mb-6"
  >
    <WidgetMediaRow
      :title="title"
      icon="mdi-creation-outline"
      :items="items"
      :loading="loading"
      variant="views"
      @open="onOpen"
      @view-all="onViewAll"
    />
  </section>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useOpenMediaList} from '@/utils/openMediaList'
import {loadHomeMediaThumbs} from '@/utils/homeMediaThumbs'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {findMediaTypeById} from '@/utils/mediaType'
import WidgetMediaRow from '@/components/widgets/WidgetMediaRow.vue'
import type {MediaItem} from '@/types/stores'
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
const payload = ref<ParsedHomeSimilarResponse>({seed: null, items: []})
const items = ref<MediaItem[]>([])

const seedLabel = computed(() => {
  const seed = payload.value.seed
  if (!seed) return ''
  return String(seed.name || seed.basename || '').trim()
})

const title = computed(() => {
  if (seedLabel.value) {
    return t('home.widgets.similar_to', {name: seedLabel.value})
  }
  return t('home.widgets.similar')
})

async function loadSimilar() {
  loading.value = true
  try {
    const res = await typedApi.getHomeSimilar({limit: props.limit})
    payload.value = res.data
    const nextItems = (res.data.items || []) as MediaItem[]
    await loadHomeMediaThumbs(nextItems, appStore.mediaTypes, appStore.mediaPath)
    items.value = nextItems
  } catch (error) {
    console.error(error)
    payload.value = {seed: null, items: []}
    items.value = []
  } finally {
    loading.value = false
  }
}

async function onOpen(item: MediaItem) {
  const mediaType = findMediaTypeById(appStore.mediaTypes, item.mediaTypeId)
  const kind = resolveOpenMediaKind(mediaType, {path: item.path})

  if (kind === 'play-av') {
    await itemsStore.playVideo({
      video: item,
      videos: items.value.length ? items.value : [item],
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
  const ids = items.value.map((item) => Number(item.id)).filter((id) => id > 0)
  if (!ids.length) return
  const seed = payload.value.seed
  void openMediaList({
    mediaTypeId: seed?.mediaTypeId != null ? Number(seed.mediaTypeId) : undefined,
    ids,
    scope: {
      kind: 'clipSimilar',
      label: seedLabel.value
        ? t('home.widgets.similar_to', {name: seedLabel.value})
        : t('items.more_like_this_scope'),
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
