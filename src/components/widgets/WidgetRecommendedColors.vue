<script setup lang="ts">
import {computed, ref, useId} from 'vue'
import {useI18n} from 'vue-i18n'
import {useTheme} from 'vuetify'
import {paletteGradient, useThemePalette} from '@/composable/useThemePalette'
import {useSettingsStore} from '@/stores/settings'
import {recommendedThemePalettes} from '@shared/recommendedThemePalettes'

const {t} = useI18n()
const theme = useTheme()
const {applyPalette, isPaletteActive} = useThemePalette()
const settings = useSettingsStore()
const targets = [
  {value: 'light', icon: 'mdi-weather-sunny'},
  {value: 'dark', icon: 'mdi-weather-night'},
  {value: 'both', icon: 'mdi-theme-light-dark'},
] as const
const tabsId = useId()
const target = ref<typeof targets[number]['value']>('both')
const mode = computed(() => target.value === 'both'
  ? (theme.current.value.dark ? 'dark' : 'light')
  : target.value)
const saving = ref(false)
const saveFailed = ref(false)

type Palette = typeof recommendedThemePalettes[number]

async function selectPalette(palette: Palette) {
  saving.value = true
  saveFailed.value = false
  saveFailed.value = !(await applyPalette(palette, target.value))
  saving.value = false
}
</script>

<template>
  <v-card variant="outlined" rounded="xl" class="recommended-colors pa-4">
    <h2 class="text-subtitle-1 font-weight-medium">
      <v-icon start>mdi-palette-swatch</v-icon>
      {{ t('settings_labels.appearance.recommended_colors') }}
    </h2>
    <p class="text-body-2 text-medium-emphasis mt-1 mb-3">
      {{ t('settings_labels.appearance.recommended_colors_hint') }}
    </p>
    <v-tabs
      v-model="target"
      :aria-label="t('settings_labels.appearance.palette_target')"
      color="primary"
      density="compact"
      grow
      class="palette-tabs mb-4"
    >
      <v-tab
        v-for="option in targets"
        :id="`${tabsId}-${option.value}`"
        :key="option.value"
        :value="option.value"
        :aria-controls="`${tabsId}-panel`"
        :disabled="saving"
      >
        <v-icon start>{{ option.icon }}</v-icon>
        {{ t(`settings_labels.appearance.palette_target_${option.value}`) }}
      </v-tab>
    </v-tabs>
    <div
      :id="`${tabsId}-panel`"
      :aria-labelledby="`${tabsId}-${target}`"
      role="tabpanel"
      class="d-flex flex-wrap ga-2"
    >
      <v-btn
        v-for="palette in recommendedThemePalettes"
        :key="palette.id"
        :variant="isPaletteActive(palette, target) ? 'tonal' : 'outlined'"
        :color="isPaletteActive(palette, target) ? 'primary' : undefined"
        rounded="lg"
        class="palette-chip"
        :disabled="saving"
        :aria-pressed="isPaletteActive(palette, target)"
        @click="selectPalette(palette)"
      >
        <span class="d-inline-flex ga-1 mr-2" aria-hidden="true">
          <span
            class="palette-swatch"
            :style="{
              background: settings.headerGradient === '1'
                ? paletteGradient(palette[mode])
                : palette[mode].header,
            }"
          />
          <span
            v-for="color in [palette[mode].primary, palette[mode].secondary]"
            :key="color"
            class="palette-swatch"
            :style="{backgroundColor: color}"
          />
        </span>
        {{ t(`settings_labels.appearance.palette_${palette.id}`) }}
      </v-btn>
    </div>
    <p v-if="saveFailed" role="alert" class="text-body-2 text-error mt-3">
      {{ t('settings_labels.appearance.palette_save_failed') }}
    </p>
  </v-card>
</template>

<style scoped>
.recommended-colors {
  border-color: rgba(var(--v-theme-on-surface), 0.12);
}

.palette-tabs {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.palette-tabs :deep(.v-tab) {
  min-width: 0;
  padding-inline: clamp(6px, 2vw, 12px);
}

@media (max-width: 380px) {
  .palette-tabs :deep(.v-icon) {
    display: none;
  }
}

.palette-chip {
  padding-inline: 10px;
}

.palette-chip.v-btn--variant-outlined {
  border-color: rgba(var(--v-theme-on-surface), 0.14);
}

.palette-swatch {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.35);
}
</style>
