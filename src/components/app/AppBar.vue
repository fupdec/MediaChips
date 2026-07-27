<template>
  <v-app-bar
    :color="colorRGBA"
    :class="{
      'os-darwin': isMac && !fullscreen,
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
      v-if="isMac && is_electron && !fullscreen"></div>

    <!-- LEFT AREA -->
    <div class="app-bar-container px-1 d-flex align-center flex-1">
      <ItemsSelection v-if="itemsStore.isSelect"/>

      <div
        v-if="itemsStore.type && !itemsStore.isSelect"
        :key="itemsStore.type"
        class="d-flex align-center"
        style="height: 40px;"
      >

        <DialogMediaAdding v-if="itemsStore.type == 'media'"/>
        <TagsAdd v-if="itemsStore.type == 'tag'"/>
        <TagsAdd v-else :button="false"/>

        <ItemsFilter v-if="itemsStore.type"/>

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
              :disabled="itemsStore.entities.length == 0"
              link
              prepend-icon="mdi-checkbox-marked-outline"
              :title="t('appbar.buttons.select')"
              @click="itemsStore.toggleSelectMode()"
            />
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
              :disabled="itemsStore.entities.length == 0"
              link
              prepend-icon="mdi-dice-5"
              :title="t('appbar.buttons.open_random')"
              @click="openRandomItem"
            />
          </v-list>
        </v-menu>

        <ItemsEditMeta
          v-if="itemsStore.type == 'tag'"
          ref="itemsEditMetaRef"
          :button="false"
        />
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
            APP NOT REGISTERED <br/>
            the number of items per page is limited to 15
          </span>
        </v-tooltip>

        <div class="mr-1">
          <GlobalSearch/>
        </div>
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
import {useItemsStore} from '@/stores/items'
import {useRegistrationStore} from '@/stores/registration'
import {useI18n} from 'vue-i18n'
import {useItemsPageCommands} from '@/composable/itemsPageCommands'
import {useHeaderBarStyle} from '@/composable/useHeaderBarStyle'
import {subscribeElectronIpc} from '@/utils/electronIpc'
import {typedApi} from '@/services/typedApi'
import {getTabUrl} from '@/services/routeService'
import {reloadTabsCatalog} from '@/composable/appCatalogs'
import type { TabLike } from '@/types/common'

/* Components */
const ItemsSelection = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsSelection.vue'))
const ItemsFilter = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsFilter.vue'))
const TagsAdd = defineAsyncComponent(() => import('@/components/app/appbar/elements/TagsAdd.vue'))
const DialogMediaAdding = defineAsyncComponent(() => import('@/components/dialogs/DialogMediaAdding.vue'))
const ItemsEditMeta = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsEditMeta.vue'))
const Tabs = defineAsyncComponent(() => import('@/components/app/appbar/Tabs.vue'))
const GlobalSearch = defineAsyncComponent(() => import('@/components/app/appbar/GlobalSearch.vue'))
const Documentation = defineAsyncComponent(() => import('@/components/app/appbar/Documentation.vue'))
const Notifications = defineAsyncComponent(() => import('@/components/app/appbar/Notifications.vue'))
const DialogTabEditing = defineAsyncComponent(() => import('@/components/dialogs/DialogTabEditing.vue'))

/* Stores */
const itemsStore = useItemsStore()
const app = useAppStore()
const registrationStore = useRegistrationStore()
const pageCommands = useItemsPageCommands()

/* Router & i18n */
const route = useRoute()
const router = useRouter()
const {t} = useI18n()

/* Vuetify display */
const {platform, xs} = useDisplay()
const {colorRGBA, gradient, isWinElectron} = useHeaderBarStyle('app')

/* macOS detection */
const isMac = platform.value.mac
const is_electron = platform.value.electron

/* Fullscreen state */
const fullscreen = ref(false)
const itemsEditMetaRef = ref<{editMeta: () => void} | null>(null)

/* Colors */
const tabs = computed(() => app.tabs)
const reg = computed(() => registrationStore.reg)

function openRandomItem() {
  const ids = itemsStore.entities.map(i => i.id)
  if (ids.length > 0) {
    const rand = Math.floor(Math.random() * ids.length)
    pageCommands.openRandomItem(ids[rand])
  }
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
  unsubscribeEnterFullScreen = subscribeElectronIpc('enter-full-screen', handleEnterFullScreen)
  unsubscribeLeaveFullScreen = subscribeElectronIpc('leave-full-screen', handleLeaveFullScreen)
})

onUnmounted(() => {
  unsubscribeEnterFullScreen?.()
  unsubscribeLeaveFullScreen?.()
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
  justify-content: center;
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
