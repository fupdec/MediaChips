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

onMounted(() => {
  if (window.electronAPI?.on) {
    window.electronAPI.on('maximize', handleMaximize)
    window.electronAPI.on('unmaximize', handleUnmaximize)
    window.electronAPI.on('navigationBack', handleNavigationBack)
    window.electronAPI.on('navigationForward', handleNavigationForward)
  }
})

onUnmounted(() => {
  if (window.electronAPI?.removeListener) {
    window.electronAPI.removeListener('maximize', handleMaximize)
    window.electronAPI.removeListener('unmaximize', handleUnmaximize)
    window.electronAPI.removeListener('navigationBack', handleNavigationBack)
    window.electronAPI.removeListener('navigationForward', handleNavigationForward)
  }
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

  .v-btn {
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
  left: 380px;
  right: 138px;
  text-align: center;
  font-size: 12px;
  -webkit-app-region: drag;
}

.v-system-bar {
  overflow: visible;

  &:before {
    content: "";
    position: absolute;
    height: 100%;
    top: 3px;
    left: 380px;
    right: 138px;
    background-color: transparent;
    -webkit-app-region: drag;
    pointer-events: none;
    z-index: 0;
  }

  &.maximized:before {
    top: 0;
  }
}

.context-menu,
.system-menu {
  -webkit-app-region: no-drag;
}

.system-menu-btn {
  position: relative;
  z-index: 2;
  -webkit-app-region: no-drag;
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

@media (max-width: 840px) {
  .app-system-bar-title {
    right: 160px;
    position: absolute;
  }
}

@media (max-width: 680px) {
  .app-system-bar-title {
    display: none;
  }
}
</style>
