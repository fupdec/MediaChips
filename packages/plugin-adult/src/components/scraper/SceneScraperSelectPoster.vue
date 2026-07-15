<template>
  <v-card v-if="images.length" class="mt-4" variant="flat">
    <v-card-actions class="px-4 pt-4">
      <v-card-title class="pa-0 text-body-1">
        {{ t('scene_scraper.poster_import') }}
      </v-card-title>
      <v-spacer></v-spacer>
      <v-btn
        v-if="selectedIndex != null"
        @click="clearSelection"
        size="small"
        color="primary"
        variant="text"
      >
        <v-icon icon="mdi-restore" start></v-icon>
        {{ t('common.reset') }}
      </v-btn>
      <v-btn
        @click="openGallery"
        size="small"
        color="primary"
        variant="flat"
        rounded="xl"
      >
        <v-icon start>mdi-view-gallery</v-icon>
        {{ t('scraper.open_gallery') }}
      </v-btn>
    </v-card-actions>

    <v-card-text class="pt-2">
      <v-item-group v-model="selectedIndex">
        <v-row>
          <v-col
            v-for="(image, index) in images"
            :key="`${image.url}-${index}`"
            cols="6"
            sm="4"
            md="3"
          >
            <v-item v-slot="{ isSelected, toggle }" :value="index">
              <v-card
                @click="toggleSelection(index, toggle)"
                :variant="isSelected ? 'outlined' : 'elevated'"
                :color="isSelected ? 'primary' : undefined"
                class="scene-poster-card"
              >
                <v-img :src="image.url" :aspect-ratio="16 / 9" cover>
                  <v-chip
                    v-if="index === bestImageIndex"
                    class="scene-poster-card__best"
                    size="x-small"
                    color="primary"
                    variant="flat"
                  >
                    {{ t('scene_scraper.poster_best') }}
                  </v-chip>
                  <v-chip
                    v-if="image.width && image.height"
                    class="scene-poster-card__size"
                    size="x-small"
                    variant="flat"
                  >
                    {{ image.width }}×{{ image.height }}
                  </v-chip>
                </v-img>
                <v-badge
                  :model-value="isSelected"
                  class="scene-poster-card__badge"
                  color="primary"
                  icon="mdi-check"
                ></v-badge>
              </v-card>
            </v-item>
          </v-col>
        </v-row>
      </v-item-group>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSceneScraperStore} from '../../stores/sceneScraper'
import {pickBestSceneImage} from '../../utils/sceneScraperPoster'
import 'viewerjs/dist/viewer.css'
import {api as viewerApi} from 'v-viewer'
import type {SceneScraperScene} from '../../types/sceneScraper'

const props = defineProps<{
  scene: SceneScraperScene
}>()

const sceneScraperStore = useSceneScraperStore()
const {t} = useI18n()

const selectedIndex = ref<number | null>(null)

const images = computed(() =>
  (props.scene.images || []).filter((image) => String(image.url ?? '').trim()),
)

const imageUrls = computed(() => images.value.map((image) => image.url!))

const bestImage = computed(() => pickBestSceneImage(images.value))

const bestImageIndex = computed(() => {
  const bestUrl = bestImage.value?.url
  if (!bestUrl) return -1
  return images.value.findIndex((image) => image.url === bestUrl)
})

function syncSelectedIndexFromStore() {
  const selectedUrl = sceneScraperStore.selectedPosterUrl
  if (!selectedUrl) {
    selectedIndex.value = null
    return
  }

  const index = images.value.findIndex((image) => image.url === selectedUrl)
  selectedIndex.value = index >= 0 ? index : null
}

function toggleSelection(index: number, toggle?: () => void) {
  if (selectedIndex.value === index) {
    clearSelection()
    return
  }

  toggle?.()
}

function clearSelection() {
  selectedIndex.value = null
  sceneScraperStore.selectedPosterUrl = null
}

function openGallery() {
  if (!imageUrls.value.length) return

  viewerApi({
    images: imageUrls.value,
    zIndex: 5000,
  } as Parameters<typeof viewerApi>[0])
}

watch(selectedIndex, (index) => {
  if (index == null) {
    sceneScraperStore.selectedPosterUrl = null
    return
  }

  sceneScraperStore.selectedPosterUrl = images.value[index]?.url || null
})

watch(
  () => sceneScraperStore.selectedPosterUrl,
  () => {
    syncSelectedIndexFromStore()
  },
)

watch(
  () => props.scene.id,
  () => {
    clearSelection()
  },
)

watch(images, () => {
  syncSelectedIndexFromStore()
}, {immediate: true})
</script>

<style lang="scss">
.scene-poster-card {
  position: relative;
  cursor: pointer;

  &__badge {
    position: absolute;
    left: 12px;
    top: 10px;
  }

  &__best {
    position: absolute;
    top: 8px;
    right: 8px;
  }

  &__size {
    position: absolute;
    bottom: 4px;
    right: 4px;
    opacity: 0.85;
  }
}
</style>
