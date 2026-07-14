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

    <v-menu
      v-else
      :model-value="isOpen"
      min-width="150"
      :nudge-top="3"
      offset-y
      location="end top"
      :close-on-content-click="false"
      :close-on-click="false"
      :open-on-hover="true"
      :transition="false"
      :z-index="4010"
    >
      <template v-slot:activator="{ props }">
        <v-list-item
          v-bind="props"
          @mouseover="open"
          :disabled="item.disabled"
          class="pr-1"
          link
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
      </template>

      <v-list
        @mouseover="open"
        class="context-menu"
        density="compact"
        :lines="false"
        nav
      >
        <div class="wrapper">
          <div v-for="(sub, i) in item.menu" :key="i">
            <v-list-item
              v-if="sub.type == 'item'"
              @mouseover="open"
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
              :item="sub"
            />
          </div>
        </div>
      </v-list>
    </v-menu>
  </div>
</template>

<script setup lang="ts">
import type { PropType } from 'vue'
import { ref, watch } from 'vue'
import {useDisplay} from 'vuetify'
import {useContextMenu} from "@/stores/contextMenu"
import type { ContextMenuEntry } from '@/types/stores'

const contextMenu = useContextMenu()

const props = defineProps({
  item: {
    type: Object as PropType<ContextMenuEntry>,
    required: true,
  },
  rootMenu: {
    type: Object as PropType<ContextMenuEntry>,
    required: false
  }
})

const emit = defineEmits(['show-parent'])

const isOpen = ref(false)

watch(() => props.item.show, (visible) => {
  if (visible === false) isOpen.value = false
})

const {xs} = useDisplay()

const activate = (originalFunction?: (...args: unknown[]) => unknown) => {
  originalFunction?.()
  contextMenu.show = false
}

const open = () => {
  // Если нужно скрыть другие вложенные меню, передаем событие наверх
  emit('show-parent')

  // Показываем текущее меню
  isOpen.value = true
}

const showCurrent = () => {
  isOpen.value = true
}
</script>

<style>
.v-list-group__items .v-list-item {
  padding-inline-start: 24px !important;
}
</style>