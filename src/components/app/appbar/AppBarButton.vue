<template>
  <!-- MOBILE VERSION -->
  <v-tooltip v-if="mdAndDown" location="bottom">
    <template #activator="{ props }">
      <v-btn
        v-bind="props"
        @click="action"
        :disabled="disabled"
        :color="color"
        :size="size"
        icon
      >
        <v-badge
          v-if="badge"
          :content="String(badge)"
          color="secondary"
          overlap
        >
          <v-icon :icon="`mdi-${icon}`"/>
        </v-badge>

        <v-icon v-else :icon="`mdi-${icon}`"/>
      </v-btn>
    </template>

    <span>{{ text }}</span>
  </v-tooltip>

  <!-- DESKTOP VERSION -->
  <v-btn
    v-else
    @click="action"
    :disabled="disabled"
    :variant="active ? 'flat' : variant"
    :color="active ? 'primary' : color"
    :size="size"
    rounded="xl"
    class="ml-1"
  >
    <v-icon :icon="`mdi-${icon}`" start/>
    <span>{{ text }}</span>
    <span v-if="badge" class="ml-1">({{ badge }})</span>
    <template #append>
      <v-hotkey :keys="hotkey" variant="flat"></v-hotkey>
    </template>
  </v-btn>
</template>

<script setup lang="ts">
import {useDisplay} from 'vuetify'
import type { PropType } from 'vue'

defineProps({
  action: Function as PropType<() => void>,
  icon: String,
  text: String,
  badge: {
    type: [String, Boolean, Number] as PropType<string | boolean | number>,
    default: false,
  },
  disabled: Boolean,
  active: Boolean,
  hotkey: String,
  color: {
    type: String,
    default: undefined,
  },
  size: {
    type: String,
    default: undefined,
  },
  variant: {
    type: String as PropType<'text' | 'flat' | 'elevated' | 'outlined' | 'plain' | 'tonal'>,
    default: 'text',
  },
})

const {mdAndDown} = useDisplay()
</script>

