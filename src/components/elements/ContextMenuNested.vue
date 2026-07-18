<template>
  <div>
    <v-list v-if="xs" class="py-0 px-0" density="compact" rounded>
      <v-list-group :prepend-icon="'mdi-' + item.icon">
        <template v-slot:activator="{ props }">
          <v-list-item
            v-bind="props"
            :disabled="item.disabled"
          >
            <v-list-item-title style="font-size: inherit">
              {{ item.name }}
            </v-list-item-title>
          </v-list-item>
        </template>

        <div v-for="(sub, i) in item.menu" :key="i" style="padding-left: 10px">
          <v-list-item
            v-if="sub.type == 'item'"
            @click="activate(sub.action)"
            :active="false"
          >
            <template v-slot:prepend>
              <v-icon :color="sub.color">mdi-{{ sub.icon }}</v-icon>
            </template>
            <v-list-item-title v-text="sub.name" style="font-size: inherit"></v-list-item-title>
          </v-list-item>

          <ContextMenuNested v-else-if="sub.type == 'menu'" :item="sub"/>
        </div>
      </v-list-group>
    </v-list>

    <template v-else>
      <v-list-item
        ref="activatorRef"
        :disabled="item.disabled"
        class="pr-1"
        link
        @mouseenter="open"
      >
        <v-list-item-title class="d-flex align-items-center align-center justify-space-between">
          <div class="d-flex align-items-center align-center">
            <v-icon class="mr-3" :color="item.color">
              mdi-{{ item.icon }}
            </v-icon>
            {{ item.name }}
          </div>
          <v-icon size="22">mdi-menu-right</v-icon>
        </v-list-item-title>
      </v-list-item>

      <Teleport to="body">
        <div
          v-if="isOpen"
          ref="submenuRoot"
          class="app-context-menu app-context-menu--nested"
          :style="submenuStyle"
          @mouseenter="open"
          @pointerdown.stop
          @mousedown.stop
          @contextmenu.prevent.stop
        >
          <v-list
            class="context-menu"
            density="compact"
            :lines="false"
            nav
            rounded="lg"
            elevation="8"
          >
            <div class="wrapper">
              <div v-for="(sub, i) in item.menu" :key="i">
                <v-list-item
                  v-if="sub.type == 'item'"
                  @mouseenter="onPlainItemEnter"
                  @click="activate(sub.action)"
                  class="pr-1"
                  link
                >
                  <v-list-item-title class="d-flex align-items-center align-center justify-space-between">
                    <div class="d-flex align-items-center align-center">
                      <v-icon class="mr-3" :color="sub.color">
                        mdi-{{ sub.icon }}
                      </v-icon>
                      <span class="pr-4">{{ sub.name }}</span>
                    </div>
                  </v-list-item-title>
                </v-list-item>

                <v-divider v-else-if="sub.type == 'divider'" class="ma-1"/>

                <ContextMenuNested
                  v-else-if="sub.type == 'menu'"
                  @show-parent="showCurrent"
                  @close-siblings="hideChildNested"
                  :item="sub"
                />
              </div>
            </div>
          </v-list>
        </div>
      </Teleport>
    </template>
  </div>
</template>

<script setup lang="ts">
import type {ComponentPublicInstance, PropType} from 'vue'
import {computed, nextTick, ref, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useContextMenu} from '@/stores/contextMenu'
import type {ContextMenuEntry} from '@/types/stores'

const NESTED_MENU_Z_INDEX = 30010

const contextMenu = useContextMenu()

const props = defineProps({
  item: {
    type: Object as PropType<ContextMenuEntry>,
    required: true,
  },
  rootMenu: {
    type: Object as PropType<ContextMenuEntry>,
    required: false,
  },
})

const emit = defineEmits(['show-parent', 'close-siblings'])

const isOpen = ref(false)
const activatorRef = ref<ComponentPublicInstance | HTMLElement | null>(null)
const submenuRoot = ref<HTMLElement | null>(null)
const pos = ref({x: 0, y: 0})

const {xs} = useDisplay()

const submenuStyle = computed(() => ({
  left: `${pos.value.x}px`,
  top: `${pos.value.y}px`,
  zIndex: NESTED_MENU_Z_INDEX,
}))

watch(() => props.item.show, (visible) => {
  if (visible === false) isOpen.value = false
})

watch(() => contextMenu.show, (show) => {
  if (!show) isOpen.value = false
})

const activate = (originalFunction?: (...args: unknown[]) => unknown) => {
  originalFunction?.()
  contextMenu.show = false
}

const hideChildNested = () => {
  for (const sub of props.item.menu ?? []) {
    if (sub.type == 'menu') {
      sub.show = false
    }
  }
}

const resolveActivatorEl = (): HTMLElement | null => {
  const value = activatorRef.value
  if (!value) return null
  if (value instanceof HTMLElement) return value
  return (value.$el as HTMLElement | undefined) ?? null
}

const placeSubmenu = async () => {
  const activator = resolveActivatorEl()
  if (!activator) return

  const rect = activator.getBoundingClientRect()
  pos.value = {
    x: rect.right - 4,
    y: rect.top - 4,
  }

  await nextTick()

  const el = submenuRoot.value
  if (!el) return

  const menuRect = el.getBoundingClientRect()
  const pad = 8
  let x = pos.value.x
  let y = pos.value.y

  if (x + menuRect.width > window.innerWidth - pad) {
    x = Math.max(pad, rect.left - menuRect.width + 4)
  }
  if (y + menuRect.height > window.innerHeight - pad) {
    y = Math.max(pad, window.innerHeight - menuRect.height - pad)
  }

  pos.value = {x, y}
}

const open = () => {
  // Close other menus at this level before opening (v-menu used to do this).
  emit('close-siblings')
  emit('show-parent')
  props.item.show = true
  isOpen.value = true
  void placeSubmenu()
}

const onPlainItemEnter = () => {
  hideChildNested()
  emit('show-parent')
  props.item.show = true
  isOpen.value = true
}

const showCurrent = () => {
  props.item.show = true
  isOpen.value = true
  void placeSubmenu()
}
</script>

<style>
.v-list-group__items .v-list-item {
  padding-inline-start: 24px !important;
}

.app-context-menu--nested {
  position: fixed;
  min-width: 150px;
  pointer-events: auto;

  .context-menu {
    background: rgb(var(--v-theme-surface));
  }
}
</style>
