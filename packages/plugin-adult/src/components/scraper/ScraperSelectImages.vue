<template>
  <v-card class="mt-4" variant="flat">
    <v-card-actions>
      <v-card-title>
        {{ t('scraper.images_import') }}
        <span v-if="selected_images.length">({{ selected_images.length }})</span>
      </v-card-title>

      <v-btn v-if="selected_images.length>3" @click="selected_images=[]" class="px-4" color="primary" variant="flat" rounded>
        <v-icon icon="mdi-restore" start></v-icon>
        {{ t('common.reset') }}
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn @click="show" class="ml-4 px-4" color="primary" variant="flat" rounded="xl">
        <v-icon start>mdi-view-gallery</v-icon>
        {{ t('scraper.open_gallery') }}
      </v-btn>
    </v-card-actions>
    <v-card-text>
      <v-alert type="info" class="caption mb-4" variant="tonal" density="compact" rounded="xl" closable>
        {{ t('scraper.select_images_hint', {count: 4}) }}
      </v-alert>

      <v-item-group v-model="selected_images" multiple>
        <v-row>
          <v-col v-for="(poster, x) in images" :key="poster.id" cols="4" xs="4" sm="3" md="2">
            <v-item v-slot="{ isSelected, toggle }" :value="x">
              <v-card @click="toggle" :disabled="selected_images.length>3 && !isSelected" class="scraper-selected-image">
                <v-img :src="poster.url" contain>
                  <v-chip class="scraper-selected-image__size" size="small" variant="flat">
                    {{ getReadableFileSize(poster.size) }}
                  </v-chip>
                </v-img>
                <v-badge :model-value="isSelected" :content="selected_images.indexOf(x) + 1"
                         class="scraper-selected-image__badge" color="primary"></v-badge>
              </v-card>
            </v-item>
          </v-col>
        </v-row>
      </v-item-group>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {getReadableFileSize} from '@/services/formatUtils'
import 'viewerjs/dist/viewer.css'
import {api as viewerApi} from 'v-viewer'
import type { ScraperSelectedResult } from '../../types/scraper'

const props = defineProps<{
  selected: ScraperSelectedResult
}>()

const selected_images = ref<number[]>([])
const dialogsStore = useDialogsStore()
const {t} = useI18n()

const images = computed(() => props.selected.posters || [])

const images_urls = computed(() => images.value.map((i) => i.url))

const show = () => {
  viewerApi({
    images: images_urls.value,
    zIndex: 5000,
  } as Parameters<typeof viewerApi>[0])
}

watch(selected_images, (val) => {
  const posters = props.selected.posters || []
  const urls = val.map((i) => posters[i]?.url).filter(Boolean)
  dialogsStore.scraper.images = urls
})
</script>

<style lang="scss">
.scraper-selected-image {
  &__badge {
    position: absolute;
    left: 15px;
    top: 10px;
  }

  &__size {
    position: absolute;
    bottom: 2px;
    right: 2px;
    opacity: 0.8;
  }
}

.viewer-container {
  z-index: 2999 !important;
  font-family: "Roboto", sans-serif;
}
</style>
