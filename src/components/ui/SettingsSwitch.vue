<script setup lang="ts">
import {useAttrs} from 'vue'
import {useSettingsStore} from "@/stores/settings";
import {setOption as persistSetting} from '@/services/settingsService'
import type {SettingsState} from '@/types/settings'

const emit = defineEmits<{
  update: [value: SettingsState[keyof SettingsState]]
}>()

const attrs = useAttrs()

const settingsStore = useSettingsStore();

const props = withDefaults(defineProps<{
  option: keyof SettingsState
  title?: string
  hint?: string
  iconText?: string
  iconColor?: string
  disabled?: boolean
}>(), {
  disabled: false,
})

const setOption = (value: SettingsState[keyof SettingsState]) => {
  persistSetting(value, props.option)
  emit('update', value)
}
</script>

<template>
  <v-switch
    v-bind="attrs"
    :model-value="settingsStore[props.option]"
    @update:modelValue="(value: string | null) => value != null && setOption(value as SettingsState[keyof SettingsState])"
    color="primary"
    false-value="0"
    true-value="1"
    class="mt-0 settings-switch"
    :disabled="disabled"
    hide-details
    inset
  >
    <template #label>
      <div
        v-if="title || hint"
        class="d-flex flex-column ml-4"
      >
        <div v-if="title" class="text-body-1 text-high-emphasis">
          <v-icon v-if="iconText" :color="iconColor"
            size="small"
            start>mdi-{{iconText}}
          </v-icon>
          {{ title }}
        </div>
        <div v-if="hint" class="text-caption text-medium-emphasis mt-1">{{ hint }}</div>
      </div>
      <slot name="label"></slot>
    </template>
    <template #thumb>
      <slot name="thumb"></slot>
    </template>
  </v-switch>
</template>

<style scoped>
.settings-switch :deep(.v-label) {
  background-color: transparent !important;
  opacity: 1;
}
</style>
