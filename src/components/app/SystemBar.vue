<template>
  <v-system-bar
    :class="{ maximized: maximized }"
    :color="colorRGBA"
    :style="gradient"
    class="system-bar-custom"
    window
    app
  >
    <div class="app-menu-container">
      <SystemMenuDropdown
        v-for="menu in SYSTEM_MENUS"
        :key="menu.id"
        :menu="menu"
        :is-action-disabled="isActionDisabled"
        @action="handleMenuAction"
      />
    </div>

    <v-spacer></v-spacer>
    <div
      class="app-system-bar-title"
      v-text="app_title"
    ></div>
    <v-spacer></v-spacer>

    <WindowControls
      @minimize="minimize"
      @maximize="maximize"
      @unmaximize="unmaximize"
      @close="close"
      window-type="main"
    />
  </v-system-bar>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onUnmounted, defineAsyncComponent} from 'vue'
import {useRouter} from 'vue-router'
import {useAppStore} from '@/stores/app'
import {useHeaderBarStyle} from '@/composable/useHeaderBarStyle'
import {useSystemMenuActions} from '@/composable/useSystemMenuActions'
import {SYSTEM_MENUS} from '@/types/systemMenu'
import type {SystemMenuAction} from '@/types/systemMenu'
import {subscribeElectronIpc} from '@/utils/electronIpc'
import SystemMenuDropdown from '@/components/app/SystemMenuDropdown.vue'
const WindowControls = defineAsyncComponent(() => import('@/components/ui/WindowControls.vue'))

defineProps<{
  disabled?: boolean
}>()

const emit = defineEmits<{
  lock: []
}>()

const maximized = ref(false)

const router = useRouter()
const appStore = useAppStore()
const {runSystemMenuAction, isActionDisabled} = useSystemMenuActions({
  onLock: () => emit('lock'),
})
const {colorRGBA, gradient} = useHeaderBarStyle('system')

const app_title = computed(() => appStore.app_title || 'MediaChips')

const minimize = () => {}

const maximize = () => {
  maximized.value = true
}

const unmaximize = () => {
  maximized.value = false
}

const close = () => {
  window.electronAPI?.send?.('closeApp')
}

const handleMenuAction = (action: SystemMenuAction) => {
  void runSystemMenuAction(action)
}

const back = () => {
  router.go(-1)
}

const forward = () => {
  router.go(1)
}

const handleMaximize = () => {
  maximized.value = true
}

const handleUnmaximize = () => {
  maximized.value = false
}

const handleNavigationBack = () => {
  back()
}

const handleNavigationForward = () => {
  forward()
}

let unsubscribeMaximize: (() => void) | undefined
let unsubscribeUnmaximize: (() => void) | undefined
let unsubscribeNavigationBack: (() => void) | undefined
let unsubscribeNavigationForward: (() => void) | undefined

onMounted(() => {
  unsubscribeMaximize = subscribeElectronIpc('maximize', handleMaximize)
  unsubscribeUnmaximize = subscribeElectronIpc('unmaximize', handleUnmaximize)
  unsubscribeNavigationBack = subscribeElectronIpc('navigationBack', handleNavigationBack)
  unsubscribeNavigationForward = subscribeElectronIpc('navigationForward', handleNavigationForward)
})

onUnmounted(() => {
  unsubscribeMaximize?.()
  unsubscribeUnmaximize?.()
  unsubscribeNavigationBack?.()
  unsubscribeNavigationForward?.()
})
</script>

<style lang="scss">
.app-menu-container {
  -webkit-app-region: no-drag;
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  height: 100%;
  flex: 0 0 auto;

  .v-btn,
  .system-menu-btn {
    -webkit-app-region: no-drag;
    text-transform: capitalize;
    font-weight: normal;
    letter-spacing: normal;
    padding: 0 8px !important;
    min-width: 0 !important;

    &__content {
      line-height: 1;
    }
  }
}

.app-system-bar-title {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-size: 12px;
  pointer-events: none;
  z-index: 1;
}

.system-bar-custom.v-system-bar {
  overflow: visible;
  position: relative;
  -webkit-app-region: drag;

  .app-menu-container,
  .app-menu-container .v-btn,
  .system-menu,
  .system-menu-btn,
  .window-controls,
  .window-controls .v-btn,
  .window-controls .window-control-btn {
    -webkit-app-region: no-drag;
  }
}

.context-menu,
.system-menu,
.system-menu-btn,
.system-menu-dropdown,
.system-menu-dropdown .v-list,
.system-menu-dropdown .v-list-item {
  -webkit-app-region: no-drag;
}

.system-menu-btn {
  position: relative;
  z-index: 2;
}

.system-menu-dropdown {
  min-width: 180px !important;
}

.system-bar-custom .context-menu {
  min-width: 180px;

  .system-menu-item-with-hotkey {
    display: flex;
    align-items: center;
    width: 100%;

    > span:first-child {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
    }

    .v-hotkey {
      flex-shrink: 0;
      margin-left: 12px;
    }
  }
}

@media (max-width: 680px) {
  .app-system-bar-title {
    display: none;
  }
}
</style>
