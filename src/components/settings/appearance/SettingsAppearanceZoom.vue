<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppZoom} from '@/composable/useAppZoom'
import {MAX_ZOOM, MIN_ZOOM} from '@/utils/appZoom'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'

const {t} = useI18n({useScope: 'global'})
const {zoom, setZoom, zoomIn, zoomOut, resetZoom, formatZoomPercent} = useAppZoom()

const zoomPercent = computed(() => Math.round(zoom.value * 100))
</script>

<template>
  <SettingsGroupPanel
    :title="t('settings_labels.appearance.zoom')"
    :spaced="false"
  >
    <div class="app-zoom">
      <div class="d-flex align-center flex-wrap">
        <v-btn
          icon
          size="small"
          variant="text"
          :disabled="zoom <= MIN_ZOOM"
          @click="zoomOut"
        >
          <v-icon>mdi-minus</v-icon>
        </v-btn>

        <v-slider
          :model-value="zoomPercent"
          :min="Math.round(MIN_ZOOM * 100)"
          :max="Math.round(MAX_ZOOM * 100)"
          :step="5"
          class="mx-2 app-zoom-slider"
          hide-details
          @update:model-value="value => setZoom(value / 100)"
        />

        <v-btn
          icon
          size="small"
          variant="text"
          :disabled="zoom >= MAX_ZOOM"
          @click="zoomIn"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>

        <span class="text-body-2 ml-2 text-medium-emphasis">
          {{ formatZoomPercent(zoom) }}
        </span>
      </div>

      <div class="app-zoom__footer d-flex align-center flex-wrap ga-3 mt-2">
        <v-btn
          size="small"
          variant="outlined"
          rounded
          :disabled="zoom === 1"
          @click="resetZoom"
        >
          {{ t('settings_labels.appearance.zoom_reset') }}
        </v-btn>

        <div class="app-zoom__hotkeys text-caption text-medium-emphasis d-flex align-center flex-wrap ga-2">
          <v-hotkey keys="ctrl++" inline/>
          <span aria-hidden="true">·</span>
          <v-hotkey keys="ctrl+-" inline/>
          <span>{{ t('settings_labels.appearance.zoom_hint_or') }}</span>
          <v-hotkey keys="ctrl+0" inline/>
          <span>{{ t('settings_labels.appearance.zoom_hint_reset') }}</span>
        </div>
      </div>
    </div>
  </SettingsGroupPanel>
</template>

<style lang="scss" scoped>
.app-zoom-slider {
  max-width: 280px;
  min-width: 180px;
}

.app-zoom__footer {
  row-gap: 8px;
}

.app-zoom__hotkeys {
  line-height: 1.6;
}
</style>
