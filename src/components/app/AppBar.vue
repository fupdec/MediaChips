<template>
  <v-app-bar
    :color="colorRGBA"
    :class="{
      'os-darwin': showDarwinTrafficLightSpacer,
      'os-windows-electron': isWinElectron,
    }"
    density="compact"
    :extended="tabs.length > 0"
    extension-height="36"
    :hide-on-scroll="xs"
    :style="[gradient, {'--app-header-bg': colorRGBA}]"
  >
    <!-- Gradient bg -->
    <!--    <template #image>-->
    <!--      <v-img :src="''" :gradient="gradient" cover/>-->
    <!--    </template>-->

    <div class="darwin-buttons"
      v-if="showDarwinTrafficLightSpacer"></div>

    <!-- LEFT AREA -->
    <div class="app-bar-container px-1 d-flex align-center flex-1">
      <ItemsSelection v-if="itemsStore.isSelect"/>

      <div
        v-if="isMediaOrTagPage && !itemsStore.isSelect"
        :key="itemsStore.type"
        class="d-flex align-center"
        style="height: 40px;"
      >

        <DialogMediaAdding v-if="showAddMediaButton"/>
        <TagsAdd v-if="itemsStore.type == 'tag'"/>
        <TagsAdd v-else :button="false"/>

        <ItemsFilter v-if="itemsStore.type"/>

        <AppBarButton
          :disabled="itemsStore.itemsOnPage.length == 0 && itemsStore.entities.length == 0"
          :action="() => itemsStore.toggleSelectMode()"
          :text="t('appbar.buttons.select')"
          icon="checkbox-marked-outline"
          :active="itemsStore.isSelect"
        />

        <v-menu
          location="bottom"
          :transition="false"
          content-class="app-bar-more-menu"
        >
          <template #activator="{ props: menuProps }">
            <v-btn
              v-bind="menuProps"
              icon
              variant="text"
              class="ml-1"
              :aria-label="t('appbar.buttons.more')"
            >
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>

          <v-list
            density="compact"
            class="context-menu"
            :lines="false"
            nav
            rounded="lg"
            min-width="180"
          >
            <v-list-item
              :disabled="route.path === '/tag'"
              link
              prepend-icon="mdi-tab"
              :title="t('appbar.buttons.create_tab')"
              @click="createTab"
            />
            <v-list-item
              v-if="itemsStore.type == 'tag'"
              link
              prepend-icon="mdi-wrench-cog"
              :title="t('appbar.buttons.edit_meta')"
              @click="editMetaFromMenu"
            />
            <v-list-item
              :disabled="randomItemLoading || itemsStore.totalFiltered == 0"
              link
              prepend-icon="mdi-dice-5"
              :title="t('appbar.buttons.open_random')"
              @click="openRandomItem"
            />
            <v-list-item
              :disabled="itemsStore.entities.length == 0"
              link
              prepend-icon="mdi-card-search-outline"
              :title="t('review_mode.open')"
              @click="openReviewFromMenu"
            />
          </v-list>
        </v-menu>

        <ItemsEditMeta
          v-if="itemsStore.type == 'tag'"
          ref="itemsEditMetaRef"
          :button="false"
        />
      </div>

      <div
        v-else-if="isCardSelectPage && !itemsStore.isSelect"
        class="d-flex align-center"
        style="height: 40px;"
      >
        <DialogMediaAdding v-if="showAddMediaButton"/>

        <AppBarButton
          v-if="itemsStore.type === 'playlist'"
          :action="openAddPlaylist"
          :text="t('playlists.add_new_playlist')"
          icon="playlist-plus"
        />

        <AppBarButton
          :disabled="itemsStore.itemsOnPage.length == 0 && itemsStore.entities.length == 0"
          :action="() => itemsStore.toggleSelectMode()"
          :text="t('appbar.buttons.select')"
          icon="checkbox-marked-outline"
          :active="itemsStore.isSelect"
        />
      </div>

      <div
        v-else-if="showAddMediaButton && !itemsStore.isSelect"
        class="d-flex align-center"
        style="height: 40px;"
      >
        <DialogMediaAdding/>
      </div>

      <v-spacer/>

      <!-- RIGHT AREA -->
      <div class="d-flex align-center">
        <v-tooltip v-if="!reg"
          location="bottom">
          <template v-slot:activator="{ props: activatorProps }">
            <v-btn v-bind="activatorProps"
              @click="register"
              icon>
              <v-icon>mdi-lock-question</v-icon>
            </v-btn>
          </template>
          <span>
            {{ t('registration.application_not_registered') }}
            <br/>
            {{ t('registration.unregistered_items_limit') }}
          </span>
        </v-tooltip>

        <div class="mr-1">
          <GlobalSearch/>
        </div>
        <MediaTrash/>
        <Documentation/>
        <Notifications/>
      </div>
    </div>

    <!-- Tabs -->
    <template #extension
      v-if="tabs.length > 0">
      <div class="extension-tabs">
        <Tabs/>
      </div>
    </template>

    <DialogTabEditing/>
  </v-app-bar>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onMounted, onUnmounted, ref} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useRegistrationStore} from '@/stores/registration'
import {useI18n} from 'vue-i18n'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {isFoldersRoute} from '@/composable/useBrowserLayout'
import {useReviewModeLauncher} from '@/composable/useReviewModeLauncher'
import {useHeaderBarStyle} from '@/composable/useHeaderBarStyle'
import {useAppPlatform} from '@/composable/useAppPlatform'
import {subscribeElectronIpc} from '@/utils/electronIpc'
import {typedApi} from '@/services/typedApi'
import {getDuplicatesGroupKey} from '@/utils/mediaSortFilter'
import {getTabUrl} from '@/services/routeService'
import {reloadTabsCatalog} from '@/composable/appCatalogs'
import {copyCurrentPageSettingsToTab} from '@/utils/tabPageSettings'
import type { TabLike } from '@/types/common'

/* Components */
const ItemsSelection = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsSelection.vue'))
const ItemsFilter = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsFilter.vue'))
const TagsAdd = defineAsyncComponent(() => import('@/components/app/appbar/elements/TagsAdd.vue'))
const DialogMediaAdding = defineAsyncComponent(() => import('@/components/dialogs/DialogMediaAdding.vue'))
const ItemsEditMeta = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsEditMeta.vue'))
const AppBarButton = defineAsyncComponent(() => import('@/components/app/appbar/AppBarButton.vue'))
const Tabs = defineAsyncComponent(() => import('@/components/app/appbar/Tabs.vue'))
const GlobalSearch = defineAsyncComponent(() => import('@/components/app/appbar/GlobalSearch.vue'))
const Documentation = defineAsyncComponent(() => import('@/components/app/appbar/Documentation.vue'))
const MediaTrash = defineAsyncComponent(() => import('@/components/app/appbar/MediaTrash.vue'))
const Notifications = defineAsyncComponent(() => import('@/components/app/appbar/Notifications.vue'))
const DialogTabEditing = defineAsyncComponent(() => import('@/components/dialogs/DialogTabEditing.vue'))

/* Stores */
const itemsStore = useItemsStore()
const dialogsStore = useDialogsStore()
const app = useAppStore()
const registrationStore = useRegistrationStore()
const pageCommands = useItemsPageCommands()
const {openReviewMode} = useReviewModeLauncher()

/* Router & i18n */
const route = useRoute()
const router = useRouter()
const {t} = useI18n()

/* Vuetify display */
const {xs} = useDisplay()
const {colorRGBA, gradient, isWinElectron} = useHeaderBarStyle('app')
const {isMac, isElectron} = useAppPlatform()

/* Fullscreen state — hide traffic-light spacer in native fullscreen */
const fullscreen = ref(false)
const itemsEditMetaRef = ref<{editMeta: () => void} | null>(null)

/* Colors */
const tabs = computed(() => app.tabs)
const reg = computed(() => registrationStore.reg)

const showDarwinTrafficLightSpacer = computed(() => (
  isMac && isElectron && !isWinElectron && !fullscreen.value
))

const isMediaOrTagPage = computed(() =>
  (itemsStore.type === 'media' || itemsStore.type === 'tag')
  && !isFoldersRoute(route.path),
)

const isCardSelectPage = computed(() =>
  itemsStore.type === 'mark'
  || itemsStore.type === 'playlist'
  || isFoldersRoute(route.path),
)

const isTagsSurface = computed(() => {
  const path = route.path
  if (path === '/tags' || path.startsWith('/tags/')) return true
  if (itemsStore.type === 'tag') return true
  return false
})

/** Add-media control in the app bar on every library surface except tag pages. */
const showAddMediaButton = computed(() => {
  if (itemsStore.isSelect || isTagsSurface.value) return false
  if (route.path.startsWith('/settings')) return false

  return itemsStore.type === 'media'
    || itemsStore.type === 'mark'
    || itemsStore.type === 'playlist'
    || isFoldersRoute(route.path)
    || route.path === '/'
    || route.path.startsWith('/media')
    || route.path.startsWith('/meta')
    || route.path.startsWith('/tag')
    || route.path.startsWith('/markers')
    || route.path.startsWith('/playlists')
})

function openAddPlaylist() {
  dialogsStore.openPlaylistAdd()
}

async function syncFullscreenState() {
  if (!isElectron || !window.electronAPI?.invoke) return
  try {
    const value = await window.electronAPI.invoke('isMainFullscreen')
    fullscreen.value = value === true
  } catch {
    // ignore — keep last known state
  }
}

const randomItemLoading = ref(false)

async function openRandomItem() {
  // If already loading, skip to avoid double-clicks.
  if (randomItemLoading.value) return

  randomItemLoading.value = true
  try {
    if (itemsStore.type === 'media') {
      // Use the full filtered list when scoped (semantic / more-like-this).
      if (itemsStore.listScopeIds?.length) {
        const ids = itemsStore.listScopeIds
        const rand = Math.floor(Math.random() * ids.length)
        await pageCommands.openRandomItem(ids[rand])
        return
      }

      // Fetch ALL filtered IDs so the random truly spans
      // the entire filtered set, not just the loaded page.
      const mediaTypeId = itemsStore.environment.media_type_id
      const mediaType = app.mediaTypes?.find((item) => item.id === mediaTypeId)

      const response = await typedApi.getMediaIds({
        mediaTypeId,
        filters: itemsStore.filters,
        sortBy: itemsStore.sortBy,
        direction: itemsStore.sortDir,
        find_duplicates: itemsStore.find_duplicates,
        duplicates_by: getDuplicatesGroupKey(mediaType, itemsStore.duplicates_by),
      })

      const ids = response.data.ids || []
      if (ids.length > 0) {
        const rand = Math.floor(Math.random() * ids.length)
        await pageCommands.openRandomItem(ids[rand])
        return
      }
    }
  } catch {
    // Fall through to frontend entities fallback on error.
  } finally {
    randomItemLoading.value = false
  }

  // Fallback for non-media pages (tags) or when the API returns empty.
  const ids = itemsStore.entities.map(i => i.id)
  if (ids.length > 0) {
    const rand = Math.floor(Math.random() * ids.length)
    pageCommands.openRandomItem(ids[rand])
  }
}

function openReviewFromMenu() {
  void openReviewMode()
}

function editMetaFromMenu() {
  itemsEditMetaRef.value?.editMeta()
}

async function createTab() {
  if (route.path === '/tag') return

  try {
    const { data } = await typedApi.createTab({
      name: itemsStore.name,
      icon: itemsStore.icon,
      url: route.path,
      tagId: itemsStore.environment.tag_id,
      mediaTypeId: itemsStore.environment.media_type_id,
      metaId: itemsStore.environment.meta_id,
    })

    const tabId = Number((data as TabLike)?.id)
    if (Number.isFinite(tabId) && tabId > 0) {
      await copyCurrentPageSettingsToTab(tabId)
    }

    const url = getTabUrl(data as TabLike)
    router.push(url)
    void reloadTabsCatalog()
  } catch (error) {
    console.error(error)
  }
}

function register() {
  if (!route.path.startsWith('/settings')) {
    router.push("/settings/?tab=about")
  }
}

const handleEnterFullScreen = () => {
  fullscreen.value = true
}

const handleLeaveFullScreen = () => {
  fullscreen.value = false
}

let unsubscribeEnterFullScreen: (() => void) | undefined
let unsubscribeLeaveFullScreen: (() => void) | undefined

onMounted(() => {
  void syncFullscreenState()
  unsubscribeEnterFullScreen = subscribeElectronIpc('enter-full-screen', handleEnterFullScreen)
  unsubscribeLeaveFullScreen = subscribeElectronIpc('leave-full-screen', handleLeaveFullScreen)
  window.addEventListener('focus', syncFullscreenState)
})

onUnmounted(() => {
  unsubscribeEnterFullScreen?.()
  unsubscribeLeaveFullScreen?.()
  window.removeEventListener('focus', syncFullscreenState)
})
</script>

<style scoped
  lang="scss">
.darwin-buttons {
  width: 96px;
  height: 36px;
  border-radius: 25px;
  margin-left: 5px;
  flex-shrink: 0;
}

.scrollable {
  overflow-x: auto;
  max-width: 60vw;
}

.extension-tabs {
  min-height: 28px;
  height: auto;
  width: 100%;
  display: flex;
  justify-content: flex-start;
}

.scrollable-child {
  display: flex;
  align-items: center;
}
</style>

<!-- Teleported menu — must be unscoped to match SystemBar density. -->
<style lang="scss">
.app-bar-more-menu {
  min-width: 180px !important;

  .v-list {
    padding: 4px !important;
  }

  .v-list-item {
    min-height: 32px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    padding-inline: 8px !important;
  }

  .v-list-item__prepend {
    margin-inline-end: 10px !important;

    > .v-icon {
      font-size: 18px !important;
    }

    .v-list-item__spacer {
      width: 10px !important;
    }
  }

  .v-list-item-title {
    font-size: 0.8125rem !important;
    line-height: 1.25 !important;
  }
}
</style>
