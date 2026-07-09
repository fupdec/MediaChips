<template>
  <v-app
    :class="{
      'not-macos': !isMac,
      'player-active': isPlayerUiActive,
      'player-window-app': isPlayerWindow,
      'electron-win': isWin && isElectron,
      'sfw-mode': settingsStore.sfwMode === '1',
    }"
  >
    <template v-if="isShellReady && !isPlayerWindow">
      <SystemBar
        v-if="isWin && isElectron && !isPlayerWindow"
        :disabled="store.isLocked"
        @lock="store.isLocked = true"
      />

      <component :is="AppBar"/>

      <component :is="useBottomBar ? BottomBar : SideBar"/>
    </template>

    <component :is="Player" v-if="isShellReady || isPlayerWindow"/>
    <component :is="ImageViewer" v-if="isShellReady && !isPlayerWindow"/>

    <v-main
      v-if="isShellReady && !isPlayerWindow"
      class="reduced-top app-main-layout"
      :class="mainLayoutClasses"
      app
    >
      <div
        v-if="isAppReady"
        :class="addedTopClasses"
        class="added-top blur"
      ></div>

      <div
        v-if="isAppReady"
        class="main-scroll"
        :class="{'main-scroll--settings': isSettingsPage}"
      >
        <div
          :class="[addedTopClasses, {'main-scroll-inner--settings': isSettingsPage}]"
          class="main-scroll-inner"
        >
          <router-view />
        </div>
      </div>

      <div
        v-else-if="!store.isLocked"
        class="app-content-loading"
        aria-live="polite"
        aria-busy="true"
      >
        <v-progress-circular
          indeterminate
          size="64"
          width="2"
        />
      </div>

    </v-main>

    <component :is="HoverImage" v-if="isShellReady && !isPlayerWindow"/>

    <template v-if="isShellReady && !isPlayerWindow">
      <component :is="NotificationsPool"/>
      <component :is="AutoUpdater"/>
    </template>

    <component :is="Dialogs" v-if="isShellReady && !isPlayerWindow"/>

    <div
      v-if="!isShellReady && !isPlayerWindow"
      class="app-startup-splash"
      aria-hidden="true"
    >
      <img
        src="/icons/logo.png"
        alt=""
        class="app-startup-splash__logo"
      >
    </div>

    <v-overlay :model-value="isPlayerWindow && !isAppReady"
      :opacity="1">
      <v-progress-circular indeterminate
        size="96"
        width="2"/>
    </v-overlay>

    <ContextMenu v-if="isShellReady && !isPlayerWindow" v-show="contextMenu.show"/>

    <div
      v-if="isElectron && !isPlayerWindow"
      class="main-drop-target"
      aria-hidden="true"
    >
      <div
        class="dropzone"
        :class="{'dropzone--active': dropzoneActive}"
        @click="dismissDropzone"
      >
        <div class="text">{{ t('items.drop_video_or_folder') }}</div>
      </div>
    </div>
  </v-app>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue'
import {useI18n} from 'vue-i18n'
import {useRoute} from 'vue-router'
import {useNavigationLayout} from '@/composable/useNavigationLayout'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {useAppPlatform} from '@/composable/useAppPlatform'
import {useAppBootstrap} from '@/composable/useAppBootstrap'
import {useAppZoom} from '@/composable/useAppZoom'
import {useThemeColorMeta} from '@/composable/useThemeColorMeta'
import {isStandalonePlayerRoute} from '@/utils/playerWindow'
import {isPlayerUiActive} from '@/utils/playerShellState'

import SystemBar from '@/components/app/SystemBar.vue'
import {useGlobalMediaDrop} from '@/composable/useGlobalMediaDrop'

const AppBar = defineAsyncComponent(() => import('@/components/app/AppBar.vue'))
const SideBar = defineAsyncComponent(() => import('@/components/app/SideBar.vue'))
const BottomBar = defineAsyncComponent(() => import('@/components/app/BottomBar.vue'))
const Player = defineAsyncComponent(() => import('@/components/app/Player.vue'))
const Dialogs = defineAsyncComponent(() => import('@/components/app/Dialogs.vue'))
const ImageViewer = defineAsyncComponent(() => import('@/components/app/ImageViewer.vue'))
const HoverImage = defineAsyncComponent(() => import('@/components/app/HoverImage.vue'))
const NotificationsPool = defineAsyncComponent(() => import('@/components/app/NotificationsPool.vue'))
const ContextMenu = defineAsyncComponent(() => import('@/components/app/ContextMenu.vue'))
const AutoUpdater = defineAsyncComponent(() => import('@/components/app/AutoUpdater.vue'))

const settingsStore = useSettingsStore()
const store = useAppStore()
const contextMenuStore = useContextMenu()
const route = useRoute()
const {t} = useI18n()
const {useBottomBar} = useNavigationLayout()

const {isElectron, isMac, isWin} = useAppPlatform()
const isPlayerWindow = computed(() => isStandalonePlayerRoute(route))
const appZoom = route.query.player ? null : useAppZoom()
const contextMenu = computed(() => contextMenuStore)
const {dropzoneActive, resetDropzone} = useGlobalMediaDrop()

function dismissDropzone() {
  if (dropzoneActive.value) {
    resetDropzone()
  }
}

const addedTopClasses = computed(() => ({
  'windows-os-added-top': isWin && isElectron,
  'added-top-tabs': store.tabs.length,
}))

const mainLayoutClasses = computed(() => ({
  ...addedTopClasses.value,
  'has-bottom-bar': useBottomBar.value,
}))

const isSettingsPage = computed(() => route.path === '/settings')

const {isAppReady, isShellReady} = useAppBootstrap({isPlayerWindow, appZoom})
useThemeColorMeta()
</script>

<style lang="scss">
@use "@/assets/styles/app-preloader.scss";
</style>
