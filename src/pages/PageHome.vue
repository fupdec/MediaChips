<template>
  <v-container>
    <v-card
      v-if="settingsStore.show_salutation === '1'"
      class="home-welcome rounded-lg mb-6"
      variant="flat"
    >
      <v-card-text class="pa-4">
        <div class="home-welcome__title d-flex align-center mb-2">
          <img
            src="/icons/logo.png"
            alt=""
            class="home-welcome__logo"
            draggable="false"
          >
          <span>{{ t('home.welcome') }}</span>
        </div>

        <div class="text-body-2 text-medium-emphasis mb-3">
          {{ t('home.documentation_hint') }}
        </div>

        <i18n-t
          keypath="home.keyboard_hint"
          tag="div"
          class="text-caption text-medium-emphasis mb-3 d-flex align-center flex-wrap ga-1"
        >
          <template #search>
            <v-hotkey keys="slash" variant="flat"/>
          </template>
          <template #shortcuts>
            <v-hotkey keys="?" variant="flat"/>
          </template>
        </i18n-t>

        <div class="d-flex flex-wrap ga-2">
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

          <v-btn
            color="primary"
            rounded
            size="small"
            variant="tonal"
            @click="openGettingStarted"
          >
            <v-icon start size="18">mdi-flag-outline</v-icon>
            {{ t('home.show_onboarding') }}
          </v-btn>
        </div>
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

    <div class="d-flex justify-end flex-wrap ga-2 mb-2">
      <v-btn
        color="primary"
        variant="text"
        rounded
        size="small"
        @click="openGettingStarted"
      >
        <v-icon start>mdi-flag-outline</v-icon>
        {{ t('home.show_onboarding') }}
      </v-btn>

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
import {useAppShell} from '@/composable/appShell'
import {resolveLanShareUrl} from "@/utils/apiBaseUrl"
import {useHomeWidgets} from '@/composable/useHomeWidgets'
import {invalidateHomeMediaCache, useHomeMedia} from '@/composable/useHomeMedia'
import {useOpenMediaList} from "@/utils/openMediaList"
import {
  buildContinueWatchingFilters,
  buildFavoritesFilters,
} from "@/utils/homeMediaListFilters"
import {findMediaTypeById, isAudioMediaType, isVideoMediaType} from "@/utils/mediaType"
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import HomeWidgetRenderer from '@/components/widgets/HomeWidgetRenderer.vue'
import DialogHomeWidgets from '@/components/dialogs/DialogHomeWidgets.vue'
import {setOption} from '@/services/settingsService'
import {openOnboarding, saveOnboardingStep} from '@/composable/useOnboarding'
import type { MediaItem } from '@/types/stores'

const store = useAppStore()
const settingsStore = useSettingsStore()
const itemsStore = useItemsStore()
const {on: onEventBus, clearAll: clearEventBusListeners, emit: emitEventBus} = useEventBus()
  const appShell = useAppShell()
const {t} = useI18n()
const {openMediaList} = useOpenMediaList()
const {orderedEnabledWidgets, limits, isWidgetEnabled} = useHomeWidgets()
const { loadHomeMedia } = useHomeMedia()

const showWidgetsDialog = ref(false)

const apiUrl = computed(() =>
  resolveLanShareUrl(store.config as Parameters<typeof resolveLanShareUrl>[0])
  || store.localhost,
)

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
  const kind = resolveOpenMediaKind(mediaType, {path: item.path})

  if (kind === 'play-av') {
    await itemsStore.playVideo({
      video: item,
      videos: [item],
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
  const videoType = store.mediaTypes.find((mediaType) => (
    isVideoMediaType(mediaType) && !mediaType.hidden
  ))
  void openMediaList({
    sortBy: 'viewedAt',
    sortDir: 'desc',
    mediaTypeId: videoType?.id,
    filters: buildContinueWatchingFilters(),
  })
}

function openFavoritesList() {
  void openMediaList({
    sortBy: 'viewedAt',
    sortDir: 'desc',
    filters: buildFavoritesFilters(),
  })
}

function openTopViewsList() {
  void openMediaList({sortBy: 'views', sortDir: 'desc'})
}

function emitShowDocs() {
  appShell.showDocumentation("app")
}

async function openGettingStarted() {
  await saveOnboardingStep(0)
  openOnboarding()
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

<style scoped lang="scss">
.home-welcome {
  overflow: hidden;
  // Logo palette: magenta-violet → amber-gold
  --welcome-violet: #7a3ea8;
  --welcome-magenta: #a3368d;
  --welcome-gold: #ffc511;
  --welcome-amber: #f7941d;
  border: 1px solid color-mix(in srgb, var(--welcome-violet) 22%, transparent);
  background:
    radial-gradient(ellipse 80% 110% at 0% -10%, color-mix(in srgb, var(--welcome-magenta) 28%, transparent), transparent 58%),
    radial-gradient(ellipse 70% 100% at 100% 110%, color-mix(in srgb, var(--welcome-amber) 26%, transparent), transparent 55%),
    linear-gradient(
      125deg,
      color-mix(in srgb, var(--welcome-violet) 10%, rgb(var(--v-theme-surface))) 0%,
      color-mix(in srgb, var(--welcome-gold) 8%, rgb(var(--v-theme-surface))) 100%
    );

  &__title {
    font-size: 1.15rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.2;
  }

  &__logo {
    width: 28px;
    height: 28px;
    margin-right: 10px;
    border-radius: 8px;
    object-fit: contain;
    user-select: none;
    -webkit-user-drag: none;
  }
}
</style>
