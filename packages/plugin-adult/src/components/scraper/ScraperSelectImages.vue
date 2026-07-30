<template>
  <v-card class="mt-4" variant="flat">
    <v-card-actions>
      <v-card-title>
        {{ t('scraper.images_import') }}
        <span v-if="assignments.length">({{ assignments.length }})</span>
      </v-card-title>

      <v-btn
        v-if="assignments.length"
        @click="clearAssignments"
        class="px-4"
        color="primary"
        variant="flat"
        rounded
      >
        <v-icon icon="mdi-restore" start></v-icon>
        {{ t('common.reset') }}
      </v-btn>
      <v-spacer></v-spacer>
      <v-btn @click="showGallery" class="ml-4 px-4" color="primary" variant="flat" rounded="xl">
        <v-icon start>mdi-view-gallery</v-icon>
        {{ t('scraper.open_gallery') }}
      </v-btn>
    </v-card-actions>
    <v-card-text>
      <v-alert type="info" class="caption mb-4" variant="tonal" density="compact" rounded="xl" closable>
        {{ t('scraper.select_images_hint', {count: SCRAPER_IMAGE_SLOTS.length}) }}
      </v-alert>

      <v-row>
        <v-col
          v-for="poster in images"
          :key="poster.id"
          cols="6"
          sm="4"
          md="3"
          lg="2"
        >
          <v-card
            class="scraper-selected-image"
            :class="{'scraper-selected-image--selected': Boolean(slotForUrl(poster.url))}"
            :disabled="isFull && !slotForUrl(poster.url)"
            @click="onCardClick(poster.url)"
          >
            <v-img :src="poster.url" aspect-ratio="0.7" cover>
              <div class="scraper-selected-image__chips">
                <v-chip
                  v-if="resolutionLabel(poster)"
                  size="x-small"
                  variant="flat"
                  class="scraper-selected-image__chip"
                >
                  {{ resolutionLabel(poster) }}
                </v-chip>
                <v-chip
                  v-if="poster.size > 0"
                  size="x-small"
                  variant="flat"
                  class="scraper-selected-image__chip"
                >
                  {{ getReadableFileSize(poster.size) }}
                </v-chip>
              </div>
            </v-img>

            <v-menu
              v-if="slotForUrl(poster.url)"
              location="bottom start"
              :close-on-content-click="true"
            >
              <template #activator="{ props: menuProps }">
                <v-chip
                  v-bind="menuProps"
                  class="scraper-selected-image__slot"
                  color="primary"
                  size="small"
                  variant="flat"
                  @click.stop
                >
                  {{ t(`scraper.image_slots.${slotForUrl(poster.url)}`) }}
                  <v-icon end size="14" icon="mdi-menu-down"></v-icon>
                </v-chip>
              </template>
              <v-list density="compact" min-width="160">
                <v-list-item
                  v-for="slot in SCRAPER_IMAGE_SLOTS"
                  :key="slot"
                  :title="t(`scraper.image_slots.${slot}`)"
                  :prepend-icon="slotForUrl(poster.url) === slot ? 'mdi-check' : undefined"
                  @click="reassignSlot(poster.url, slot)"
                />
                <v-divider class="my-1"/>
                <v-list-item
                  :title="t('scraper.clear_image_slot')"
                  prepend-icon="mdi-close"
                  @click="clearUrl(poster.url)"
                />
              </v-list>
            </v-menu>
          </v-card>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import {ref, computed, watch, reactive} from 'vue'
import {useI18n} from 'vue-i18n'
import {useDialogsStore} from '@/stores/dialogs'
import {getReadableFileSize} from '@/services/formatUtils'
import 'viewerjs/dist/viewer.css'
import {api as viewerApi} from 'v-viewer'
import {
  SCRAPER_IMAGE_SLOTS,
  type ScraperImageAssignment,
  type ScraperImageSlot,
  type ScraperSelectedResult,
} from '../../types/scraper'
import {
  assignScraperImageSlot,
  getOrderedScraperPosters,
  nextFreeScraperImageSlot,
  toggleScraperImageAssignment,
} from '../../utils/scraperPosters'

const props = withDefaults(defineProps<{
  selected: ScraperSelectedResult
  defaultSelectFirst?: boolean
}>(), {
  defaultSelectFirst: false,
})

const dialogsStore = useDialogsStore()
const {t} = useI18n()

const assignments = ref<ScraperImageAssignment[]>([])
const probedDims = reactive<Record<string, {width: number; height: number}>>({})

const images = computed(() => getOrderedScraperPosters(props.selected.posters || []))

const isFull = computed(() => nextFreeScraperImageSlot(assignments.value) == null)

function slotForUrl(url: string): ScraperImageSlot | null {
  return assignments.value.find((item) => item.url === url)?.type ?? null
}

function resolutionLabel(poster: {url: string; width?: number; height?: number}): string {
  const width = poster.width || probedDims[poster.url]?.width
  const height = poster.height || probedDims[poster.url]?.height
  if (!width || !height) return ''
  return `${width}×${height}`
}

function syncStore() {
  dialogsStore.scraper.images = assignments.value.map((item) => ({...item}))
}

function clearAssignments() {
  assignments.value = []
  syncStore()
}

function onCardClick(url: string) {
  if (isFull.value && !slotForUrl(url)) return
  assignments.value = toggleScraperImageAssignment(assignments.value, url)
  syncStore()
}

function reassignSlot(url: string, type: ScraperImageSlot) {
  assignments.value = assignScraperImageSlot(assignments.value, url, type)
  syncStore()
}

function clearUrl(url: string) {
  assignments.value = assignments.value.filter((item) => item.url !== url)
  syncStore()
}

function showGallery() {
  viewerApi({
    images: images.value.map((poster) => poster.url),
    zIndex: 5000,
  } as Parameters<typeof viewerApi>[0])
}

function probeMissingDimensions() {
  for (const poster of images.value) {
    if (poster.width && poster.height) continue
    if (probedDims[poster.url]) continue

    const img = new Image()
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        probedDims[poster.url] = {
          width: img.naturalWidth,
          height: img.naturalHeight,
        }
      }
    }
    img.src = poster.url
  }
}

watch(
  () => props.selected,
  () => {
    if (props.defaultSelectFirst && images.value.length) {
      assignments.value = [{url: images.value[0].url, type: 'main'}]
    } else {
      assignments.value = []
    }
    syncStore()
    probeMissingDimensions()
  },
  {immediate: true},
)

watch(images, () => {
  probeMissingDimensions()
})
</script>

<style lang="scss">
.scraper-selected-image {
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  transition: border-color 0.15s ease;

  &--selected {
    border-color: rgb(var(--v-theme-primary));
  }

  &:disabled,
  &[disabled='true'] {
    opacity: 0.5;
    cursor: default;
  }

  &__chips {
    position: absolute;
    left: 4px;
    right: 4px;
    bottom: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    justify-content: flex-end;
    opacity: 0.9;
    transition: opacity 0.15s ease;
  }

  &:hover &__chips {
    opacity: 0;
  }

  &__chip {
    pointer-events: none;
  }

  &__slot {
    position: absolute;
    left: 6px;
    top: 6px;
    z-index: 1;
  }
}

.viewer-container {
  z-index: 2999 !important;
  font-family: "Roboto", sans-serif;
}
</style>
