<template>
  <v-menu
    v-model="open"
    bottom
    offset-y
    :offset="[1, -1]"
    :transition="false"
    min-width="220"
    content-class="system-menu-dropdown context-menu"
    class="system-menu"
    :z-index="2000"
    :open-on-hover="false"
    :close-on-content-click="false"
  >
    <template #activator="{ props: menuProps }">
      <v-btn
        v-bind="menuProps"
        :ripple="false"
        class="system-menu-btn"
        :class="{'system-menu-btn--active': open}"
        height="32"
        size="small"
        variant="text"
        @mouseenter="onActivatorEnter"
      >
        {{ t(menu.labelKey) }}
      </v-btn>
    </template>

    <v-list
      density="compact"
      class="context-menu"
      :lines="false"
      nav
      rounded="lg"
    >
      <div class="wrapper">
        <template
          v-for="(item, index) in menu.items"
          :key="`${menu.id}-${index}`"
        >
          <v-divider
            v-if="item.divider"
            class="ma-1"
          />

          <v-list-item
            v-else-if="item.action"
            link
            class="pr-3"
            :disabled="isActionDisabled(item.action)"
            @mouseup.stop="handleItemClick(item.action)"
          >
            <v-list-item-title
              :class="{'system-menu-item-with-hotkey': item.hotkey}"
            >
              <span>
                <v-icon
                  v-if="item.icon"
                  class="mr-3"
                >
                  {{ item.icon }}
                </v-icon>
                {{ t(item.labelKey || '') }}
              </span>
              <v-hotkey
                v-if="item.hotkey"
                :keys="item.hotkey"
                inline
              />
            </v-list-item-title>
          </v-list-item>
        </template>
      </div>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SystemMenuConfig, SystemMenuAction} from '@/types/systemMenu'

const props = defineProps<{
  menu: SystemMenuConfig
  isActionDisabled: (action: SystemMenuAction) => boolean
  openMenuId: string | null
}>()

const emit = defineEmits<{
  'update:openMenuId': [id: string | null]
  action: [action: SystemMenuAction]
}>()

const {t} = useI18n()

const open = computed({
  get: () => props.openMenuId === props.menu.id,
  set: (value: boolean) => {
    if (value) {
      emit('update:openMenuId', props.menu.id)
      return
    }
    // Ignore close events from a menu that is no longer active (hover switch).
    if (props.openMenuId === props.menu.id) {
      emit('update:openMenuId', null)
    }
  },
})

/** Native menubar: after any menu is open, hover switches between menus. */
function onActivatorEnter() {
  if (props.openMenuId != null && props.openMenuId !== props.menu.id) {
    emit('update:openMenuId', props.menu.id)
  }
}

function handleItemClick(action: SystemMenuAction) {
  emit('update:openMenuId', null)
  emit('action', action)
}
</script>

<style scoped lang="scss">
.system-menu-btn--active {
  background-color: rgba(255, 255, 255, 0.16) !important;
}
</style>
