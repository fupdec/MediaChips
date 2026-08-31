<template>
  <div
    class="floating-bottom-dock"
    :class="{
      'floating-bottom-dock--bottom-nav': useBottomBar,
      'floating-bottom-dock--hidden': !hasLanes,
      'floating-bottom-dock--stacked': stacked,
    }"
    :style="barStyle"
  >
    <div
      :id="hostId"
      ref="hostRef"
      class="floating-bottom-dock__lanes"
    />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {useFixedGridBarBounds} from '@/composable/useFixedGridBarBounds'
import {FLOATING_BOTTOM_DOCK_HOST_ID} from '@/utils/floatingBottomDock'

const hostId = FLOATING_BOTTOM_DOCK_HOST_ID
const hostRef = ref<HTMLElement | null>(null)
const laneCount = ref(0)
const hasLanes = computed(() => laneCount.value > 0)
const stacked = computed(() => laneCount.value > 1)

const {barStyle, useBottomBar, syncBounds, observeGrid} = useFixedGridBarBounds()

function syncLaneCount() {
  laneCount.value = hostRef.value?.childElementCount ?? 0
}

let mutationObserver: MutationObserver | null = null

function syncDockReserve() {
  if (typeof document === 'undefined') return

  const laneHeight = stacked.value ? 112 : 56
  const bottomOffset = useBottomBar.value ? 72 : 16
  const reserve = hasLanes.value ? `${laneHeight + bottomOffset + 16}px` : '0px'
  document.documentElement.style.setProperty('--floating-bottom-dock-reserve', reserve)
}

watch([hasLanes, stacked, useBottomBar], () => {
  requestAnimationFrame(syncBounds)
  syncDockReserve()
}, {immediate: true})

onMounted(() => {
  observeGrid()
  syncBounds()
  syncLaneCount()
  syncDockReserve()
  if (!hostRef.value || typeof MutationObserver === 'undefined') return
  mutationObserver = new MutationObserver(() => {
    syncLaneCount()
    syncBounds()
    syncDockReserve()
  })
  mutationObserver.observe(hostRef.value, {childList: true})
})

onBeforeUnmount(() => {
  mutationObserver?.disconnect()
  mutationObserver = null
  if (typeof document !== 'undefined') {
    document.documentElement.style.setProperty('--floating-bottom-dock-reserve', '0px')
  }
})
</script>

<style lang="scss">
.floating-bottom-dock {
  position: fixed;
  box-sizing: border-box;
  bottom: 16px;
  left: calc(var(--v-layout-left, 0px) + 16px);
  right: calc(var(--v-layout-right, 0px) + 16px);
  margin-inline: auto;
  width: auto;
  max-width: min(100%, var(--container-max-width, 1184px));
  z-index: 1005;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-primary), 0.18);
  border-radius: 18px;
  box-shadow:
    0 0 0 1px rgba(var(--v-theme-primary), 0.06),
    0 -6px 18px -4px rgba(0, 0, 0, 0.16),
    0 0 20px -2px rgba(0, 0, 0, 0.14),
    0 10px 28px -8px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.floating-bottom-dock--bottom-nav {
  bottom: 72px;
}

.floating-bottom-dock--hidden {
  display: none;
}

.floating-bottom-dock__lanes {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.floating-bottom-dock-lane {
  min-width: 0;
  padding: 0 14px;
}

.floating-bottom-dock-lane[data-dock-order='clipboard'] {
  order: 1;
}

.floating-bottom-dock-lane[data-dock-order='tray'] {
  order: 2;
}

.floating-bottom-dock--stacked .floating-bottom-dock-lane[data-dock-order='tray'] {
  border-top: 1px solid rgba(var(--v-theme-primary), 0.12);
}

.floating-bottom-dock-lane__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 52px;
  max-height: 56px;
  overflow: hidden;
}

.floating-bottom-dock-lane__left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
}

.floating-bottom-dock-lane__glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 9px;
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.floating-bottom-dock-lane__title {
  font-size: 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.floating-bottom-dock-lane__entries {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.floating-bottom-dock-lane__empty {
  font-size: 0.7rem;
  color: rgba(var(--v-theme-on-surface), 0.4);
  white-space: nowrap;
}

.floating-bottom-dock-lane__actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.floating-bottom-dock-lane__divider {
  width: 1px;
  height: 20px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
