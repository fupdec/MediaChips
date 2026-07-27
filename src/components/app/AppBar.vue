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

    <div class="darwin-buttons-background"
      v-if="isMac && is_electron && !fullscreen"></div>
    <div class="darwin-buttons"
      v-if="isMac && is_electron && !fullscreen"></div>

    <!-- LEFT AREA -->
    <div class="app-bar-container px-1 d-flex align-center flex-1">
      <router-link
        v-if="!itemsStore.isSelect && !itemsStore.type"
        to="/"
        class="app-bar-brand"
        :title="'MediaChips'"
      >
        <img
          src="/icons/logo.png"
          alt=""
          class="app-bar-brand__logo"
          draggable="false"
        >
        <span class="app-bar-brand__name">MediaChips</span>
      </router-link>

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

        <!-- Sort -->
<!--        <AppBarButton-->
<!--          :icon="itemsStore.sortDir === 'asc' ? 'sort-ascending' : 'sort-descending'"-->
<!--          :text="t('appbar.buttons.sort')"-->
<!--          :active="toolbar.sort.show"-->
<!--          @click="toggleSort"-->
<!--        />-->

<!--        &lt;!&ndash; Customize &ndash;&gt;-->
<!--        <AppBarButton-->
<!--          icon="tune"-->
<!--          :text="t('appbar.buttons.customize')"-->
<!--          :active="toolbar.appearance.show"-->
<!--          @click="toggleCustomization"-->
<!--        />-->
        <AppBarButton
          :disabled="itemsStore.entities.length == 0"
          :action="() => itemsStore.toggleSelectMode()"
          :text="$t('appbar.buttons.select')"
          icon="checkbox-marked-outline"
          :active="itemsStore.isSelect"
        ></AppBarButton>

        <TabAdd/>

        <ItemsEditMeta v-if="itemsStore.type == 'tag'"/>

        <!-- Random -->
        <AppBarButton
          :disabled="itemsStore.entities.length == 0"
          icon="dice-5"
          :text="t('appbar.buttons.open_random')"
          :action="openRandomItem"
        />
        <!--          </div>-->
        <!--        </div>-->
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
        <Feedback/>
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

/* Components */
const ItemsSelection = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsSelection.vue'))
import AppBarButton from '@/components/app/appbar/AppBarButton.vue'
const ItemsFilter = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsFilter.vue'))
const TabAdd = defineAsyncComponent(() => import('@/components/app/appbar/elements/TabAdd.vue'))
const TagsAdd = defineAsyncComponent(() => import('@/components/app/appbar/elements/TagsAdd.vue'))
const DialogMediaAdding = defineAsyncComponent(() => import('@/components/dialogs/DialogMediaAdding.vue'))
const ItemsEditMeta = defineAsyncComponent(() => import('@/components/app/appbar/elements/ItemsEditMeta.vue'))
const Tabs = defineAsyncComponent(() => import('@/components/app/appbar/Tabs.vue'))
const Feedback = defineAsyncComponent(() => import('@/components/app/appbar/Feedback.vue'))
const Documentation = defineAsyncComponent(() => import('@/components/app/appbar/Documentation.vue'))
const GlobalSearch = defineAsyncComponent(() => import('@/components/app/appbar/GlobalSearch.vue'))
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
}

.darwin-buttons-background {
  position: fixed;
  z-index: 5000;
  left: 10px;
  top: 10px;
  border-radius: 15px;
  width: 76px;
  height: 25px;
}

.app-bar-brand {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-right: 6px;
  padding: 2px 8px 2px 4px;
  border-radius: 999px;
  text-decoration: none;
  color: inherit;
  -webkit-app-region: no-drag;
  transition: background-color 0.15s ease, transform 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  &:active {
    transform: scale(0.98);
  }

  &__logo {
    width: 26px;
    height: 26px;
    object-fit: contain;
    border-radius: 7px;
    user-select: none;
    -webkit-user-drag: none;
  }

  &__name {
    font-size: 0.95rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1;
    white-space: nowrap;
  }
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
