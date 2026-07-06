<template>
  <v-container>
    <v-card
      v-if="settingsStore.show_salutation === '1'"
      class="rounded-lg mb-6"
      color="primary"
      variant="tonal"
    >
      <v-card-text class="pa-3">
        <div class="d-flex align-center text-body-1 font-weight-medium mb-2">
          <v-icon class="mr-2" size="20">mdi-hand-wave-outline</v-icon>
          {{ t('home.welcome') }}
        </div>

        <div class="text-body-2 text-medium-emphasis mb-3">
          {{ t('home.documentation_hint') }}
        </div>

        <v-btn
          color="primary"
          rounded
          size="small"
          variant="tonal"
          @click="emitShowDocs"
        >
          <v-icon start size="18">mdi-book-open-variant-outline</v-icon>
          {{ t('home.show_documentation') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-alert
      v-if="settingsStore.show_ip_at_home_screen === '1'"
      type="info"
      icon="mdi-web"
      class="mb-6"
      rounded="lg"
      density="compact"
      variant="tonal"
      closable
      @click:close="hideAlert"
    >
      <div class="text-body-2">
        {{ t('settings_labels.general.browser_access') }}
      </div>

      <v-btn
        @click="copy"
        color="info"
        :title="t('settings_labels.general.copy_link')"
        rounded
        size="small"
        variant="text"
        class="mt-2 px-0"
      >
        <v-icon start size="18">mdi-content-copy</v-icon>
        <span class="text-body-2">{{ t('settings_labels.general.copy_link') }}:</span>
        <span class="text-body-2 font-weight-medium ml-1">{{ apiUrl }}</span>
      </v-btn>
    </v-alert>

    <div class="d-flex justify-end mb-2">
      <v-btn
        @click="showWidgetsDialog = true"
        v-tooltip:top="t('home.customize_widgets')"
        color="primary"
        variant="text"
        rounded
        size="small"
      >
        <v-icon start>mdi-view-dashboard-edit-outline</v-icon>
        {{ t('home.customize_widgets') }}
      </v-btn>
    </div>

    <DialogHomeWidgets v-model="showWidgetsDialog"/>

    <HomeWidgetRenderer
      v-for="widgetId in orderedEnabledWidgets"
      :key="`${store.dbPath}-${widgetId}`"
      :widget-id="widgetId"
      :limits="limits"
      :media-widgets-enabled="mediaWidgetsEnabled"
      :on-open-media="openMediaItem"
      :on-open-continue="openContinueItem"
      :on-open-continue-list="openContinueList"
      :on-open-favorites-list="openFavoritesList"
      :on-open-top-views-list="openTopViewsList"
    />
  </v-container>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from "vue"
import {useI18n} from 'vue-i18n'
import {useAppStore} from "@/stores/app"
import {useSettingsStore} from "@/stores/settings"
import {useItemsStore} from "@/stores/items"
import {useEventBus} from "@/utils/eventBus"
import {useHomeWidgets} from '@/composable/useHomeWidgets'
import {invalidateHomeMediaCache, useHomeMedia} from '@/composable/useHomeMedia'
import {useOpenMediaList} from "@/utils/openMediaList"
import {findMediaTypeById, isAudioMediaType, isTextMediaType, isVideoMediaType} from "@/utils/mediaType"
import HomeWidgetRenderer from '@/components/widgets/HomeWidgetRenderer.vue'
import DialogHomeWidgets from '@/components/dialogs/DialogHomeWidgets.vue'
import {openPath} from '@/services/shellService'
import {setOption} from '@/services/settingsService'
import type { MediaItem } from '@/types/stores'

const store = useAppStore()
const settingsStore = useSettingsStore()
const itemsStore = useItemsStore()
const {on: onEventBus, clearAll: clearEventBusListeners, emit: emitEventBus} = useEventBus()
const {t} = useI18n()
const {openMediaList} = useOpenMediaList()
const {orderedEnabledWidgets, limits, isWidgetEnabled} = useHomeWidgets()
const { loadHomeMedia } = useHomeMedia()

const showWidgetsDialog = ref(false)

const apiUrl = computed(() => store.localhost)

const mediaWidgetsEnabled = computed(() => ({
  continue: isWidgetEnabled('continue'),
  favorites: isWidgetEnabled('favorites'),
  topViews: isWidgetEnabled('topViews'),
}))

async function reloadHomeMediaIfNeeded() {
  const enabled = mediaWidgetsEnabled.value
  if (!enabled.continue && !enabled.favorites && !enabled.topViews) return

  invalidateHomeMediaCache()
  await loadHomeMedia({
    limits: limits.value,
    loadContinue: enabled.continue,
    loadFavorites: enabled.favorites,
    loadTopViews: enabled.topViews,
  })
}

async function openMediaItem(item: MediaItem) {
  const mediaType = findMediaTypeById(store.mediaTypes, item.mediaTypeId)

  if (isVideoMediaType(mediaType) || isAudioMediaType(mediaType)) {
    await itemsStore.playVideo({
      video: item,
      videos: [item],
    })
    return
  }

  if (isTextMediaType(mediaType) && item.path) {
    await openPath(item.path)
    return
  }

  await openMediaList({mediaTypeId: item.mediaTypeId})
}

async function openContinueItem(item: MediaItem) {
  const mediaType = findMediaTypeById(store.mediaTypes, item.mediaTypeId)

  if (!isVideoMediaType(mediaType) && !isAudioMediaType(mediaType)) {
    await openMediaList({sortBy: 'viewedAt', sortDir: 'desc', mediaTypeId: item.mediaTypeId})
    return
  }

  await itemsStore.playVideo({
    video: item,
    time: item.time,
    videos: [item],
  })
}

function openContinueList() {
  openMediaList({sortBy: 'viewedAt', sortDir: 'desc'})
}

function openFavoritesList() {
  openMediaList({sortBy: 'viewedAt', sortDir: 'desc'})
}

function openTopViewsList() {
  openMediaList({sortBy: 'views', sortDir: 'desc'})
}

function emitShowDocs() {
  emitEventBus("showDocumentation", "app")
}

function copy() {
  navigator.clipboard.writeText(apiUrl.value)
}

async function hideAlert() {
  await setOption('0', "show_ip_at_home_screen")
}

watch(
  () => [
    store.dbPath,
    limits.value.continue,
    limits.value.favorites,
    limits.value.topViews,
    mediaWidgetsEnabled.value.continue,
    mediaWidgetsEnabled.value.favorites,
    mediaWidgetsEnabled.value.topViews,
  ],
  () => reloadHomeMediaIfNeeded(),
)

onEventBus('app:database-changed', reloadHomeMediaIfNeeded)

onBeforeUnmount(() => {
  clearEventBusListeners()
  setOption('0', "show_salutation")
})
</script>
