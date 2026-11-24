<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import {setOption} from '@/services/settingsService'
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'

const {t} = useI18n()
const settingsStore = useSettingsStore()
// Legacy/unknown values fall back to off, matching isVirtualGridWanted().
const mode = computed(() => (['0', '1', '2'].includes(String(settingsStore.virtualImageGrid))
  ? String(settingsStore.virtualImageGrid)
  : '0'))
</script>
<template><div class="mx-4">
  <div class="text-body-1 text-high-emphasis">{{ t('settings_labels.appearance.virtual_image_grid') }}</div>
  <div class="text-caption text-medium-emphasis mt-1 mb-3">{{ t('settings_labels.appearance.virtual_image_grid_hint') }}</div>
  <SettingsSegmentedControl
    :model-value="mode"
    :label="t('settings_labels.appearance.virtual_image_grid')"
    :items="[
      {value: '2', title: t('settings_labels.appearance.virtual_image_grid_auto')},
      {value: '1', title: t('settings_labels.appearance.virtual_image_grid_on')},
      {value: '0', title: t('settings_labels.appearance.virtual_image_grid_off')},
    ]"
    @update:model-value="(value: string) => setOption(value, 'virtualImageGrid')"
  />
</div></template>
