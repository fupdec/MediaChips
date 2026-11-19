<script setup lang="ts">
import {computed, ref} from "vue";
import {useI18n} from "vue-i18n";
import {useSettingsStore} from "@/stores/settings";
import WidgetRecommendedColors from '@/components/widgets/WidgetRecommendedColors.vue'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import SettingsHeaderGradient from "@/components/settings/appearance/SettingsHeaderGradient.vue";
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue";
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";
import {useAppTheme} from "@/composable/useAppTheme";
import {setOption} from '@/services/settingsService'
import {paletteGradient, useThemePalette} from '@/composable/useThemePalette'
import {derivePageBackground, deriveSurfaceBackground} from '@/utils/themeBackground'
import {derivePaletteFromBase, isValidHexColor} from '@/utils/themeColorDerivation'

const {t} = useI18n();
const {applyTheme} = useAppTheme();

type ThemeColorKey =
  | 'appColorLightHeader'
  | 'appColorLightPrimary'
  | 'appColorLightSecondary'
  | 'appColorDarkHeader'
  | 'appColorDarkPrimary'
  | 'appColorDarkSecondary'

type HeaderGradientKey = 'headerGradientLight' | 'headerGradientDark'

const dialogPalette = ref(false);
const dialogHeaderGradient = ref(false);
const dialogGenerateTheme = ref(false);
const colorType = ref<ThemeColorKey | null>(null);
const palette = ref<string>("#777777");
const gradientThemeDark = ref(false);
const generateBaseColor = ref('#8A86F2');
const generating = ref(false)
const generationFailed = ref(false)
const validBase = computed(() => isValidHexColor(normalizeColor(generateBaseColor.value)))
const generated = computed(() => {
  const base = normalizeColor(generateBaseColor.value)
  return {
    light: derivePaletteFromBase(base, 'light'),
    dark: derivePaletteFromBase(base, 'dark'),
  }
})

const {applyPalette} = useThemePalette()

const SETTINGS = useSettingsStore()

function normalizeColor(value: unknown): string {
  if (!value) return String(value)
  if (typeof value === 'object' && value !== null) {
    const colorObj = value as { hex?: string; rgba?: string }
    return colorObj.hex ?? colorObj.rgba ?? String(value)
  }
  return String(value)
}

function openDialogPalette(type: ThemeColorKey) {
  colorType.value = type;
  palette.value = SETTINGS[type];
  dialogPalette.value = true;
}

function applyColor() {
  dialogPalette.value = false;
  const value = normalizeColor(palette.value);
  const option = colorType.value;
  if (!option) return
  SETTINGS[option] = value;
  applyTheme();
  setOption(value, option);
}

const manualThemes = [
  {
    mode: 'light',
    icon: 'mdi-weather-sunny',
    gradient: 'headerGradientLight',
    header: 'appColorLightHeader',
    primary: 'appColorLightPrimary',
    secondary: 'appColorLightSecondary',
  },
  {
    mode: 'dark',
    icon: 'mdi-weather-night',
    gradient: 'headerGradientDark',
    header: 'appColorDarkHeader',
    primary: 'appColorDarkPrimary',
    secondary: 'appColorDarkSecondary',
  },
] as const

function openToolbarEditor(theme: typeof manualThemes[number]) {
  if (SETTINGS.headerGradient !== '1') {
    openDialogPalette(theme.header)
    return
  }

  gradientThemeDark.value = theme.mode === 'dark'
  dialogHeaderGradient.value = true
}

function saveHeaderGradient(values: { themeDark?: boolean; gradient: string }) {
  const key: HeaderGradientKey = values.themeDark ? "headerGradientDark" : "headerGradientLight";
  SETTINGS[key] = values.gradient;
  applyTheme();
  setOption(values.gradient, key);
}

function openGenerateTheme() {
  const current = SETTINGS.appColorLightPrimary
  generateBaseColor.value = isValidHexColor(current) ? current.replace(/^#?/, '#') : '#8A86F2'
  generationFailed.value = false
  dialogGenerateTheme.value = true;
}

async function applyGeneratedTheme(mode: 'light' | 'dark' | 'both') {
  if (!validBase.value || generating.value) return

  generating.value = true
  generationFailed.value = false
  generationFailed.value = !(await applyPalette(generated.value, mode))
  generating.value = false
  if (!generationFailed.value) dialogGenerateTheme.value = false
}
</script>

<template>
  <div>
    <SettingsCategoryDivider :title="t('settings_labels.appearance.colors')" icon="brush-variant"></SettingsCategoryDivider>

    <settings-switch
      class="mb-4"
      :title="t('settings_labels.appearance.neutral_theme')"
      :hint="t('settings_labels.appearance.neutral_theme_hint')"
      option="neutralTheme"
      @update="applyTheme"
    />

    <WidgetRecommendedColors class="mb-4"/>

    <section class="theme-settings-group mb-4">
      <h3 class="text-subtitle-2 mb-2">{{ t('settings_labels.appearance.custom_theme') }}</h3>
      <v-btn variant="tonal" color="primary" prepend-icon="mdi-auto-fix" @click="openGenerateTheme">
        {{ t('settings_labels.appearance.generate_theme') }}
      </v-btn>
    </section>

    <section class="theme-settings-group">
      <h3 class="text-subtitle-2 mb-2">{{ t('settings_labels.appearance.manual_theme_colors') }}</h3>
      <settings-switch
        :title="t('settings_labels.appearance.toolbar_gradient')"
        :hint="t('settings_labels.appearance.gradient_hint')"
        option="headerGradient"
      />

      <div v-for="theme in manualThemes" :key="theme.mode" class="mt-4">
        <h4 class="text-body-2 font-weight-medium mb-2">
          <v-icon start size="small" :icon="theme.icon"/>
          {{ t(`settings_labels.appearance.${theme.mode}_theme`) }}
        </h4>
        <div class="d-flex flex-wrap ga-2">
          <v-btn variant="tonal" @click="openToolbarEditor(theme)">
            <span
              class="theme-setting-swatch mr-2"
              :style="{background: SETTINGS.headerGradient === '1' ? SETTINGS[theme.gradient] : SETTINGS[theme.header]}"
              aria-hidden="true"
            />
            {{ t(SETTINGS.headerGradient === '1'
              ? 'settings_labels.appearance.toolbar_gradient'
              : 'settings_labels.appearance.toolbar_color') }}
          </v-btn>
          <v-btn
            v-for="role in (['primary', 'secondary'] as const)"
            :key="role"
            variant="tonal"
            @click="openDialogPalette(theme[role])"
          >
            <span class="theme-setting-swatch mr-2" :style="{background: SETTINGS[theme[role]]}" aria-hidden="true"/>
            {{ t(`settings_labels.appearance.${role}_accent`) }}
          </v-btn>
        </div>
      </div>
    </section>

    <!-- Palette Dialog -->
    <v-dialog v-model="dialogPalette" width="360">
      <v-card rounded="xl" class="pa-0">
        <div class="palette-dialog-picker-wrap">
          <v-color-picker
            v-model="palette"
            mode="hexa"
            elevation="0"
            class="palette-dialog-picker"
          />
        </div>
        <v-divider class="palette-divider"/>
        <div class="d-flex ga-2 pa-4">
          <v-btn
            @click="applyColor"
            rounded="xl"
            color="primary"
            variant="flat"
            class="flex-1"
          >
            <v-icon start>mdi-check</v-icon>
            {{ t('common.apply') }}
          </v-btn>
          <v-btn
            @click="dialogPalette = false"
            variant="outlined"
            rounded="xl"
          >
            {{ t('common.cancel') }}
          </v-btn>
        </div>
      </v-card>
    </v-dialog>

    <!-- Generate Theme Dialog -->
    <v-dialog v-model="dialogGenerateTheme" width="720" scrollable :persistent="generating">
      <v-card rounded="xl">
        <DialogHeader
          icon="palette-swatch"
          :header="t('settings_labels.appearance.generate_theme')"
          closable
          :close-disabled="generating"
          @close="dialogGenerateTheme = false"
        />

        <v-card-text class="pa-4 pa-sm-6">
          <v-alert type="info" variant="tonal" density="compact" rounded="lg" icon="mdi-information-outline" class="generate-theme-hint mb-4">
            <span class="text-caption">{{ t('settings_labels.appearance.generate_theme_hint') }}</span>
          </v-alert>

          <div class="generate-theme-layout">
            <div class="generate-theme-picker mx-auto">
              <v-color-picker
                v-model="generateBaseColor"
                :disabled="generating"
                mode="hex"
                :modes="['hex']"
                elevation="0"
              />
            </div>
            <div class="generate-theme-results">
              <div v-if="validBase" class="generated-previews">
                <div
                  v-for="(colors, mode) in generated"
                  :key="mode"
                  class="generated-preview rounded-lg overflow-hidden"
                  :style="{
                    background: derivePageBackground(colors.primary, mode),
                    color: mode === 'dark' ? '#fff' : '#000',
                  }"
                >
                  <div
                    class="d-flex align-center ga-2 px-3 py-2 text-body-2 font-weight-medium"
                    :style="{
                      background: SETTINGS.headerGradient === '1' ? paletteGradient(colors) : colors.header,
                      color: mode === 'dark' ? '#fff' : '#000',
                    }"
                  >
                    <v-icon size="16" :icon="mode === 'dark' ? 'mdi-weather-night' : 'mdi-weather-sunny'"/>
                    {{ t(`settings_labels.appearance.${mode}_theme`) }}
                    <v-spacer/>
                    <v-icon size="16" icon="mdi-dots-vertical" aria-hidden="true"/>
                  </div>
                  <div class="ma-2 pa-2 rounded-lg generated-preview__surface"
                       :style="{background: deriveSurfaceBackground(colors.primary, mode)}">
                    <div class="d-flex align-center ga-2 mb-2 text-caption font-weight-medium">
                      <v-icon size="16" icon="mdi-image-multiple-outline"/>
                      {{ t('settings_labels.appearance.generate_theme_preview') }}
                    </div>
                    <div class="d-flex flex-wrap ga-1">
                      <span
                        v-for="role in (['primary', 'secondary'] as const)"
                        :key="role"
                        class="d-inline-flex align-center ga-1 rounded-pill px-2 py-1 text-caption"
                        :style="{background: colors[role], color: mode === 'dark' ? '#000' : '#fff'}"
                      >
                        <v-icon size="12" :icon="role === 'primary' ? 'mdi-play' : 'mdi-bookmark-outline'"/>
                        {{ t(`settings_labels.appearance.${role}`) }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <p v-else class="text-error text-body-2" role="status">
                {{ t('settings_labels.appearance.generate_theme_invalid') }}
              </p>
              <p v-if="generationFailed" class="mt-2 text-error text-body-2" role="alert">
                {{ t('settings_labels.appearance.generate_theme_failed') }}
              </p>
            </div>
          </div>

          <div class="d-flex flex-wrap justify-end ga-2 mt-4">
            <v-btn
              v-for="mode in (['light', 'dark', 'both'] as const)"
              :key="mode"
              :disabled="!validBase || generating"
              :variant="mode === 'both' ? 'flat' : 'tonal'"
              color="primary"
              @click="applyGeneratedTheme(mode)"
            >
              {{ t(`settings_labels.appearance.generate_theme_${mode}`) }}
            </v-btn>
          </div>
        </v-card-text>
      </v-card>
    </v-dialog>

    <!-- Gradient Editor -->
    <SettingsHeaderGradient
      v-if="dialogHeaderGradient"
      :themeDark="gradientThemeDark"
      @close="dialogHeaderGradient = false"
      @save="saveHeaderGradient"
    />
  </div>
</template>

<style scoped lang="scss">
.theme-settings-group {
  padding: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 16px;
}

.theme-setting-swatch {
  // Inside a block .v-btn__content a span is inline and ignores width/height.
  display: inline-block;
  vertical-align: middle;
  flex: none;
  width: 16px;
  height: 16px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.3);
  border-radius: 50%;
}

.generate-theme-hint {
  padding-block: 6px;
}

.generate-theme-layout {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 16px;
}

.generate-theme-results {
  min-width: 0;
}

@media (max-width: 690px) {
  .generate-theme-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}

.generate-theme-picker {
  width: fit-content;
  max-width: 100%;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 12px;
  overflow: hidden;

  :deep(.v-color-picker) {
    max-width: 100%;
  }
}

.generated-previews {
  display: grid;
  gap: 16px;
}

.generated-preview {
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
}

.generated-preview__surface {
  border: 1px solid color-mix(in srgb, currentColor 12%, transparent);
}

.palette-dialog-picker-wrap {
  margin: 12px;
  padding: 4px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 18px;
  background: rgb(var(--v-theme-surface));
  box-shadow:
    0 1px 0 rgba(var(--v-theme-primary), 0.04),
    0 8px 22px -16px rgba(0, 0, 0, 0.22);
}

.palette-dialog-picker {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 0;

  :deep(.v-color-picker) {
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  :deep(.v-color-picker__canvas) {
    border-radius: 12px;
    max-width: 280px;
    width: 100%;
    margin: 12px auto 8px;
    overflow: hidden;
  }

  :deep(.v-color-picker__controls) {
    max-width: 280px;
    margin: 0 auto;
    padding: 4px 12px 8px;
  }

  :deep(.v-color-picker__preview) {
    display: flex;
    justify-content: center;
    margin-bottom: 4px;
  }

  :deep(.v-color-picker__input) {
    max-width: 280px;
    margin: 0 auto;
  }
}

.palette-divider {
  margin: 0 16px;
  opacity: 0.55;
}
</style>