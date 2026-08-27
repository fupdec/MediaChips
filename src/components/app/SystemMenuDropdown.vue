<template>
  <v-menu
    v-model="open"
    bottom
    offset-y
    :offset="[1, -1]"
    :transition="false"
    min-width="240"
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
        <SystemMenuList
          :items="menu.items"
          :is-action-disabled="isActionDisabled"
          :is-action-checked="isActionChecked"
          @action="handleItemClick"
        />
      </div>
    </v-list>
  </v-menu>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import type {SystemMenuConfig, SystemMenuAction} from '@/types/systemMenu'
import SystemMenuList from '@/components/app/SystemMenuList.vue'

const props = defineProps<{
  menu: SystemMenuConfig
  isActionDisabled: (action: SystemMenuAction) => boolean
  isActionChecked: (action: SystemMenuAction) => boolean
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
