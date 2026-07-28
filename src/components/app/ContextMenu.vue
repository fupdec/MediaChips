<template>
  <v-bottom-sheet
    v-if="xs"
    v-model="contextMenu.show"
    content-class="bottom-menu-mobile"
    width="500"
    :z-index="20000"
  >
    <v-card max-height="80vh" class="menu">
      <v-list density="compact" class="px-2">
        <template v-for="(item, i) in menu.content" :key="i">
          <v-list-item
            v-if="item.type == 'item'"
            @mouseup="activate(item.action)"
            :disabled="item.disabled"
            class="pr-1"
            link
          >
            <template v-slot:prepend>
              <v-icon :color="item.color"> mdi-{{ item.icon }}</v-icon>
            </template>

            <v-list-item-title v-html="item.name" class="text-subtitle-1"/>
          </v-list-item>

          <div
            v-else-if="item.type == 'divider'"
            class="context-menu__divider"
            role="separator"
          />

          <ContextMenuNested
            v-else-if="item.type == 'menu'"
            :item="item"
          />
        </template>
      </v-list>
    </v-card>
  </v-bottom-sheet>

  <!--
    Use a body Teleport + fixed panel instead of v-menu.
    v-menu lives in Vuetify's overlay stack and loses to body-teleported
    big-preview (z-index 3000) when a modal dialog is also open.
  -->
  <Teleport v-else to="body">
    <div
      v-if="contextMenu.show"
      ref="menuRoot"
      class="app-context-menu"
      :style="menuStyle"
      @mousedown.stop
      @contextmenu.prevent.stop
    >
      <v-list density="compact" class="context-menu" :lines="false" nav rounded="lg" elevation="8">
        <div class="wrapper">
          <template v-for="(item, i) in menu.content" :key="i">
            <v-list-item
              v-if="item.type == 'item'"
              @mouseover="hideNested"
              @mouseup="activate(item.action)"
              :disabled="item.disabled"
              class="pr-3"
              link
            >
              <v-list-item-title>
                <v-icon class="mr-3" :color="item.color">
                  mdi-{{ item.icon }}
                </v-icon>
                {{ item.name }}
                <div class="px-3"></div>
              </v-list-item-title>
            </v-list-item>

            <div
              v-else-if="item.type == 'divider'"
              class="context-menu__divider"
              role="separator"
            />

            <ContextMenuNested
              v-else-if="item.type == 'menu'"
              :item="item"
              @close-siblings="hideNested"
            />
          </template>
        </div>
      </v-list>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useContextMenu} from '@/stores/contextMenu'
import ContextMenuNested from '@/components/elements/ContextMenuNested.vue'
import type {ContextMenuEntry} from '@/types/stores'

const CONTEXT_MENU_Z_INDEX = 30000

const {xs} = useDisplay()
const contextMenu = useContextMenu()
const menuRoot = ref<HTMLElement | null>(null)
const adjustedPos = ref({x: 0, y: 0})
const isPositioned = ref(false)

const menu = computed(() => contextMenu)

const menuStyle = computed(() => ({
  left: `${adjustedPos.value.x}px`,
  top: `${adjustedPos.value.y}px`,
  zIndex: CONTEXT_MENU_Z_INDEX,
  visibility: isPositioned.value ? 'visible' : 'hidden',
}))

const activate = (originalFunction: unknown) => {
  if (typeof originalFunction === 'function') {
    (originalFunction as () => void)()
  }
  menu.value.show = false
}

const hideNested = () => {
  for (const item of (menu.value.content ?? []) as ContextMenuEntry[]) {
    if (item.type == 'menu') {
      item.show = false
    }
  }
}

const clampToViewport = async () => {
  const cursorX = menu.value.x || 0
  const cursorY = menu.value.y || 0
  const pad = 8
  isPositioned.value = false

  // Measure at a safe origin so fixed shrink-to-fit is not crushed against the edge.
  adjustedPos.value = {x: pad, y: pad}
  await nextTick()

  const el = menuRoot.value
  if (!el) {
    isPositioned.value = true
    return
  }

  const w = el.offsetWidth
  const h = el.offsetHeight
  const vw = window.innerWidth
  const vh = window.innerHeight

  let x = cursorX
  let y = cursorY

  // Prefer opening to the right of the cursor; flip left when it does not fit.
  if (x + w > vw - pad) {
    x = cursorX - w
  }
  if (x < pad) x = pad
  if (x + w > vw - pad) x = Math.max(pad, vw - w - pad)

  // Prefer opening below the cursor; flip above when it does not fit.
  if (y + h > vh - pad) {
    y = cursorY - h
  }
  if (y < pad) y = pad
  if (y + h > vh - pad) y = Math.max(pad, vh - h - pad)

  adjustedPos.value = {x, y}
  await nextTick()
  isPositioned.value = true
}

const onPointerDownOutside = (event: PointerEvent) => {
  if (!contextMenu.show || xs.value) return
  const target = event.target
  // Nested submenus are separate body Teleports (.app-context-menu--nested),
  // so they are not inside menuRoot — treat any context-menu panel as inside.
  if (target instanceof Element && target.closest('.app-context-menu')) return
  if (target instanceof Node && menuRoot.value?.contains(target)) return
  contextMenu.show = false
}

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && contextMenu.show) {
    contextMenu.show = false
  }
}

watch(
  () => contextMenu.show,
  async (show) => {
    if (!show) {
      isPositioned.value = false
      return
    }
    if (xs.value) return
    await clampToViewport()
  },
)

watch(
  () => [contextMenu.x, contextMenu.y, contextMenu.show] as const,
  async ([, , show]) => {
    if (!show || xs.value) return
    await clampToViewport()
  },
)

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', onPointerDownOutside, true)
  window.addEventListener('keydown', onKeyDown)
}

onBeforeUnmount(() => {
  if (typeof window === 'undefined') return
  window.removeEventListener('pointerdown', onPointerDownOutside, true)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style>
.v-list-item {
  transition: background-color 0.2s ease, color 0.2s ease;
}

.v-list-item:hover {
  background-color: rgb(var(--v-theme-primary), 10%) !important;
  color: rgb(var(--v-theme-primary)) !important;
}

.app-context-menu {
  position: fixed;
  width: max-content;
  min-width: 180px;
  max-width: min(320px, calc(100vw - 16px));
  pointer-events: auto;

  .context-menu {
    background: rgb(var(--v-theme-surface));
  }
}
</style>
