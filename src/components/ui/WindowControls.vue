<template>
  <div
    class="window-controls"
    :class="{ 'windows-style': windowsStyle }"
  >
    <button
      type="button"
      class="window-control-btn"
      :aria-label="'Minimize'"
      @click="minimize"
    >
      <v-icon size="16">mdi-minus</v-icon>
    </button>
    <button
      v-if="maximized"
      type="button"
      class="window-control-btn"
      :aria-label="'Restore'"
      @click="unmaximize"
    >
      <v-icon size="14">mdi-window-restore</v-icon>
    </button>
    <button
      v-else
      type="button"
      class="window-control-btn"
      :aria-label="'Maximize'"
      @click="maximize"
    >
      <v-icon size="14">mdi-square-outline</v-icon>
    </button>
    <button
      type="button"
      class="window-control-btn close-app-btn"
      :aria-label="'Close'"
      @click="close"
    >
      <v-icon size="16">mdi-window-close</v-icon>
    </button>
  </div>
</template>

<script setup lang="ts">
import {ref, onMounted, onUnmounted, computed} from 'vue'
import {useRoute} from "vue-router";
import {subscribeElectronIpc} from '@/utils/electronIpc'

const props = defineProps({
  windowType: {
    type: String,
    default: 'main' // 'main' или 'player'
  },
  windowsStyle: {
    type: Boolean,
    default: false,
  },
})

const route = useRoute()

const resolvedWindowType = computed(() => route.query.player ? 'player' : props.windowType)

const emit = defineEmits(['minimize', 'maximize', 'unmaximize', 'close'])

const maximized = ref(false)

const minimize = () => {
  emit('minimize')
  window.electronAPI?.invoke?.("minimize", resolvedWindowType.value)
}

const maximize = () => {
  maximized.value = true
  emit('maximize')
  window.electronAPI?.invoke?.("maximize", resolvedWindowType.value)
}

const unmaximize = () => {
  maximized.value = false
  emit('unmaximize')
  window.electronAPI?.invoke?.("unmaximize", resolvedWindowType.value)
}

const close = () => {
  emit('close')
  if (resolvedWindowType.value === 'player') {
    window.electronAPI?.invoke?.('closePlayer')
  } else {
    // Soft close: main process hides only when minimize-to-tray is on AND a
    // tray icon exists; otherwise it force-quits (fixes Windows X black-hole).
    window.electronAPI?.send?.('closeApp')
  }
}

// Обработчики событий от IPC
const handleMaximize = () => {
  maximized.value = true
}

const handleUnmaximize = () => {
  maximized.value = false
}

let unsubscribeMaximize: (() => void) | undefined
let unsubscribeUnmaximize: (() => void) | undefined

onMounted(() => {
  unsubscribeMaximize = subscribeElectronIpc('maximize', handleMaximize)
  unsubscribeUnmaximize = subscribeElectronIpc('unmaximize', handleUnmaximize)
})

onUnmounted(() => {
  unsubscribeMaximize?.()
  unsubscribeUnmaximize?.()
})
</script>

<style scoped
  lang="scss">
.window-controls {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: stretch;
  height: 100%;
  -webkit-app-region: no-drag;

  &.windows-style {
    .window-control-btn {
      width: 46px;
      min-width: 46px;
      height: 100%;
      min-height: 32px;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: default;
      -webkit-app-region: no-drag;

      &:hover {
        background-color: rgba(255, 255, 255, 0.12);
      }

      &:active {
        background-color: rgba(255, 255, 255, 0.08);
      }
    }

    .close-app-btn {
      &:hover {
        background-color: #c42b1c;
        color: #fff;
      }

      &:active {
        background-color: #b22518;
        color: #fff;
      }
    }
  }

  &:not(.windows-style) {
    .window-control-btn {
      width: 46px;
      height: 32px;
      border: 0;
      border-radius: 0;
      background: transparent;
      color: inherit;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      -webkit-app-region: no-drag;

      &:hover {
        background-color: rgba(255, 255, 255, 0.1);
      }
    }

    .close-app-btn:hover {
      background-color: #d70000;
      color: #fff;
    }
  }
}
</style>
