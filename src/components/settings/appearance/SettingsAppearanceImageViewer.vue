<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import {setOption} from '@/services/settingsService'

const settingsStore = useSettingsStore()
const SETTINGS = computed(() => settingsStore)
const {t} = useI18n()

const slideshowIntervalSeconds = computed(() => {
  const raw = Number(SETTINGS.value.imageSlideshowInterval)
  if (!Number.isFinite(raw)) return 4
  return Math.min(30, Math.max(1, Math.round(raw)))
})

const onSlideshowIntervalChange = (val: number | number[]) => {
  const seconds = Array.isArray(val) ? val[0] : val
  void setOption(String(seconds), 'imageSlideshowInterval')
}
</script>

<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.appearance.image_viewer')"
      icon="image-multiple-outline"
    />

    <div
      class="mb-4"
      style="max-width: 420px"
    >
      <div class="d-flex align-center justify-space-between mb-1">
        <span class="text-body-1 text-high-emphasis">
          {{ t('settings_labels.appearance.slideshow_interval') }}
        </span>
        <span class="text-caption text-medium-emphasis">
          {{ slideshowIntervalSeconds }}s
        </span>
      </div>
      <div class="text-caption text-medium-emphasis mb-2">
        {{ t('settings_labels.appearance.slideshow_interval_hint') }}
      </div>
      <v-slider
        :model-value="slideshowIntervalSeconds"
        @update:model-value="onSlideshowIntervalChange"
        min="1"
        max="30"
        step="1"
        track-size="7"
        density="compact"
        color="primary"
        hide-details
        thumb-label
      />
    </div>

    <settings-switch
      option="imageSlideshowLoop"
      :title="t('settings_labels.appearance.slideshow_loop')"
      :hint="t('settings_labels.appearance.slideshow_loop_hint')"
    />

    <settings-switch
      option="virtualImageGrid"
      :title="t('settings_labels.appearance.virtual_image_grid')"
      :hint="t('settings_labels.appearance.virtual_image_grid_hint')"
    />
  </div>
</template>
