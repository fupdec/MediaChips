<template>
  <v-bottom-sheet
    v-if="xs"
    v-model="contextMenu.show"
    content-class="bottom-menu-mobile"
    width="500"
    :z-index="4000"
  >
    <v-card max-height="80vh" class="menu">
      <v-list density="compact" class="px-2">
        <div v-for="(item, i) in menu.content" :key="i">
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

          <v-divider v-else-if="item.type == 'divider'" class="ma-1"/>

          <ContextMenuNested
            v-else-if="item.type == 'menu'"
            :item="item"
          />
        </div>
      </v-list>
    </v-card>
  </v-bottom-sheet>

  <v-menu
    v-else
    v-model="contextMenu.show"
    :offset="[1, -1]"
    :target="[menu.x, menu.y]"
    :close-on-content-click="false"
    :close-on-click="false"
    :transition="false"
    :z-index="4000"
    min-width="150"
  >
    <v-list density="compact" class="context-menu" :lines="false" nav rounded="lg">
      <div class="wrapper">
        <div v-for="(item, i) in menu.content" :key="i">
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

          <v-divider v-else-if="item.type == 'divider'" class="ma-1"/>

          <ContextMenuNested
            v-else-if="item.type == 'menu'"
            :item="item"
          />
        </div>
      </div>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import {computed} from "vue"
import {useDisplay} from 'vuetify'
import {useContextMenu} from '@/stores/contextMenu'
import ContextMenuNested from "@/components/elements/ContextMenuNested.vue"
import type {ContextMenuEntry} from '@/types/stores'

const {xs} = useDisplay()
const contextMenu = useContextMenu()

const menu = computed(() => contextMenu)

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
</script>

<style>
.v-list-item {
  transition: background-color 0.2s ease, color 0.2s ease;
}

.v-list-item:hover {
  background-color: rgb(var(--v-theme-primary), 10%) !important;
  color: rgb(var(--v-theme-primary)) !important;
}
</style>