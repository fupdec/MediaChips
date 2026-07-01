<template>
  <v-app
    :class="{
      'not-macos': !isMac,
      'player-active': player.active,
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

      <AppBar/>

      <BottomBar v-if="useBottomBar"/>
      <SideBar v-else/>
    </template>

    <Player/>
    <ImageViewer v-if="isShellReady && !isPlayerWindow"/>

    <v-main
      v-if="isAppReady && !isPlayerWindow"
      class="reduced-top app-main-layout"
      :class="mainLayoutClasses"
      app
    >
      <div
        :class="addedTopClasses"
        class="added-top blur"
      ></div>

      <div class="main-scroll" :class="{'main-scroll--settings': isSettingsPage}">
        <div
          :class="[addedTopClasses, {'main-scroll-inner--settings': isSettingsPage}]"
          class="main-scroll-inner"
        >
          <router-view />

        </div>
      </div>

      <div id="main-drop-target" class="main-drop-target"></div>
    </v-main>

    <HoverImage v-if="isShellReady && !isPlayerWindow"/>

    <template v-if="isShellReady && !isPlayerWindow">
      <NotificationsPool/>
      <AutoUpdater/>
    </template>

    <Dialogs v-if="isShellReady && !isPlayerWindow"/>

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

    <ContextMenu v-if="isShellReady && !isPlayerWindow" v-show="contextMenu.show"></ContextMenu>
  </v-app>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent} from 'vue'
import {useRoute} from 'vue-router'
import {useNavigationLayout} from '@/composable/useNavigationLayout'
import {useAppStore} from '@/stores/app'
import {usePlayerStore} from '@/stores/player'
import {useSettingsStore} from '@/stores/settings'
import {useContextMenu} from '@/stores/contextMenu'
import {useAppPlatform} from '@/composable/useAppPlatform'
import {useAppBootstrap} from '@/composable/useAppBootstrap'
import {useAppZoom} from '@/composable/useAppZoom'
import {isStandalonePlayerRoute} from '@/utils/playerWindow'

import SystemBar from '@/components/app/SystemBar.vue'
import AppBar from '@/components/app/AppBar.vue'
import SideBar from '@/components/app/SideBar.vue'
import BottomBar from '@/components/app/BottomBar.vue'
import Player from '@/components/app/Player.vue'
import NotificationsPool from '@/components/app/NotificationsPool.vue'
import ContextMenu from '@/components/app/ContextMenu.vue'
import AutoUpdater from '@/components/app/AutoUpdater.vue'

const Dialogs = defineAsyncComponent(() => import('@/components/app/Dialogs.vue'))
const ImageViewer = defineAsyncComponent(() => import('@/components/app/ImageViewer.vue'))
const HoverImage = defineAsyncComponent(() => import('@/components/app/HoverImage.vue'))

const settingsStore = useSettingsStore()
const store = useAppStore()
const player = usePlayerStore()
const contextMenuStore = useContextMenu()
const route = useRoute()
const {useBottomBar} = useNavigationLayout()

const {isElectron, isMac, isWin} = useAppPlatform()
const isPlayerWindow = computed(() => isStandalonePlayerRoute(route))
const appZoom = route.query.player ? null : useAppZoom()
const contextMenu = computed(() => contextMenuStore)

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
</script>

<style lang="scss">
@use "@/assets/styles/app-preloader.scss";
</style>
