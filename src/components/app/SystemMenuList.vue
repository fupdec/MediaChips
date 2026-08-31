<template>
  <template
    v-for="(item, index) in items"
    :key="`${index}-${item.action || item.labelKey || item.label || 'divider'}`"
  >
    <v-divider
      v-if="item.divider"
      class="ma-1"
    />

    <v-list-item
      v-else-if="item.submenu?.length"
      class="pr-2"
      link
    >
      <v-list-item-title class="d-flex align-center justify-space-between">
        <span class="d-flex align-center">
          <v-icon
            v-if="item.icon"
            class="mr-3"
          >
            {{ item.icon }}
          </v-icon>
          {{ itemLabel(item) }}
        </span>
        <v-icon size="18">mdi-menu-right</v-icon>
      </v-list-item-title>
      <v-menu
        activator="parent"
        open-on-hover
        submenu
        location="end"
        :open-delay="80"
        :close-delay="120"
        :close-on-content-click="false"
        content-class="system-menu-dropdown context-menu"
      >
        <v-list
          density="compact"
          class="context-menu"
          :lines="false"
          nav
          rounded="lg"
        >
          <div class="wrapper">
            <SystemMenuList
              :items="item.submenu"
              :is-action-disabled="isActionDisabled"
              :is-action-checked="isActionChecked"
              @action="emit('action', $event)"
            />
          </div>
        </v-list>
      </v-menu>
    </v-list-item>

    <v-list-item
      v-else-if="item.action"
      link
      class="pr-3"
      :disabled="isActionDisabled(item.action)"
      @mouseup.stop="emit('action', item.action)"
    >
      <v-list-item-title
        :class="{'system-menu-item-with-hotkey': item.hotkey}"
      >
        <span>
          <v-icon
            v-if="item.checkable"
            class="mr-3 system-menu-check"
            :class="{'system-menu-check--off': !isActionChecked(item.action)}"
          >
            mdi-check
          </v-icon>
          <v-icon
            v-else-if="item.icon"
            class="mr-3"
          >
            {{ item.icon }}
          </v-icon>
          {{ itemLabel(item) }}
        </span>
        <v-hotkey
          v-if="item.hotkey"
          :keys="item.hotkey"
          inline
        />
      </v-list-item-title>
    </v-list-item>
  </template>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import type {SystemMenuAction, SystemMenuItemConfig} from '@/types/systemMenu'

defineOptions({name: 'SystemMenuList'})

defineProps<{
  items: SystemMenuItemConfig[]
  isActionDisabled: (action: SystemMenuAction) => boolean
  isActionChecked: (action: SystemMenuAction) => boolean
}>()

const emit = defineEmits<{
  action: [action: SystemMenuAction]
}>()

const {t} = useI18n()

function itemLabel(item: SystemMenuItemConfig) {
  if (item.label) return item.label
  if (item.labelKey) return t(item.labelKey)
  return ''
}
</script>
