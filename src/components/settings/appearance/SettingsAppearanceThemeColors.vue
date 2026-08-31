<script setup lang="ts">
import {ref} from "vue";
import {useI18n} from "vue-i18n";
import {useSettingsStore} from "@/stores/settings";
import SettingsHeaderGradient from "@/components/settings/appearance/SettingsHeaderGradient.vue";
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue";
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";
import {useAppTheme} from "@/composable/useAppTheme";
import {setOption} from '@/services/settingsService'
import {derivePaletteFromBase} from '@/utils/themeColorDerivation'

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

function openDialogHeaderGradientLight() {
  gradientThemeDark.value = false;
  dialogHeaderGradient.value = true;
}

function openDialogHeaderGradientDark() {
  gradientThemeDark.value = true;
  dialogHeaderGradient.value = true;
}

function saveHeaderGradient(values: { themeDark?: boolean; gradient: string }) {
  const key: HeaderGradientKey = values.themeDark ? "headerGradientDark" : "headerGradientLight";
  SETTINGS[key] = values.gradient;
  applyTheme();
  setOption(values.gradient, key);
}

function getFirstGradientColor(gradient: string): string {
  try {
    const match = gradient.match(/#[0-9a-fA-F]{3,8}/)
    return match ? match[0] : '#777777'
  } catch {
    return '#777777'
  }
}

function openGenerateTheme() {
  generateBaseColor.value = SETTINGS.appColorLightPrimary;
  dialogGenerateTheme.value = true;
}

function applyGeneratedTheme(mode: 'light' | 'dark' | 'both') {
  const base = normalizeColor(generateBaseColor.value);

  if (mode === 'light' || mode === 'both') {
    const light = derivePaletteFromBase(base, 'light');
    SETTINGS.appColorLightHeader = light.header;
    SETTINGS.appColorLightPrimary = light.primary;
    SETTINGS.appColorLightSecondary = light.secondary;
    setOption(light.header, 'appColorLightHeader');
    setOption(light.primary, 'appColorLightPrimary');
    setOption(light.secondary, 'appColorLightSecondary');
  }

  if (mode === 'dark' || mode === 'both') {
    const dark = derivePaletteFromBase(base, 'dark');
    SETTINGS.appColorDarkHeader = dark.header;
    SETTINGS.appColorDarkPrimary = dark.primary;
    SETTINGS.appColorDarkSecondary = dark.secondary;
    setOption(dark.header, 'appColorDarkHeader');
    setOption(dark.primary, 'appColorDarkPrimary');
    setOption(dark.secondary, 'appColorDarkSecondary');
  }

  dialogGenerateTheme.value = false;
  applyTheme();
}
</script>

<template>
  <div>
    <SettingsCategoryDivider :title="t('settings_labels.appearance.colors')" icon="brush-variant"></SettingsCategoryDivider>

    <settings-switch
      :title="t('settings_labels.appearance.gradient')"
      :hint="t('settings_labels.appearance.gradient_hint')"
      option="headerGradient"
    ></settings-switch>

    <!-- Generate theme from single color -->
    <div class="d-flex align-center flex-wrap mb-4 mt-2">
      <v-btn
        @click="openGenerateTheme"
        variant="tonal"
        rounded
        color="primary"
        class="mb-2"
      >
        <v-icon start>mdi-auto-fix</v-icon>
        {{ t('settings_labels.appearance.generate_theme') }}
      </v-btn>
    </div>

    <!-- Light Theme -->
    <div class="d-flex flex-wrap align-center mb-4">
      <div class="mr-6 mb-2">
        <v-icon start>mdi-weather-sunny</v-icon>
        <span class="text-body-2 text-high-emphasis">{{ t('settings_labels.appearance.light_theme') }}</span>
      </div>

      <v-btn
        v-if="SETTINGS.headerGradient === '1'"
        @click="openDialogHeaderGradientLight"
        :color="getFirstGradientColor(SETTINGS.headerGradientLight)"
        class="mr-2 mb-2"
        rounded
        variant="flat"
        theme="light"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.toolbar') }}
      </v-btn>

      <v-btn
        v-else
        @click="openDialogPalette('appColorLightHeader')"
        :color="SETTINGS.appColorLightHeader"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.toolbar') }}
      </v-btn>

      <v-btn
        @click="openDialogPalette('appColorLightPrimary')"
        :color="SETTINGS.appColorLightPrimary"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.primary') }}
      </v-btn>

      <v-btn
        @click="openDialogPalette('appColorLightSecondary')"
        :color="SETTINGS.appColorLightSecondary"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.secondary') }}
      </v-btn>
    </div>

    <!-- Dark Theme -->
    <div class="d-flex flex-wrap align-center">
      <div class="mr-6 mb-2">
        <v-icon start>mdi-weather-night</v-icon>
        <span class="text-body-2 text-high-emphasis">{{ t('settings_labels.appearance.dark_theme') }}</span>
      </div>

      <v-btn
        v-if="SETTINGS.headerGradient === '1'"
        @click="openDialogHeaderGradientDark"
        :color="getFirstGradientColor(SETTINGS.headerGradientDark)"
        class="mr-2 mb-2"
        variant="flat"
        theme="dark"
        rounded
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.toolbar') }}
      </v-btn>

      <v-btn
        v-else
        @click="openDialogPalette('appColorDarkHeader')"
        :color="SETTINGS.appColorDarkHeader"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.toolbar') }}
      </v-btn>

      <v-btn
        @click="openDialogPalette('appColorDarkPrimary')"
        :color="SETTINGS.appColorDarkPrimary"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.primary') }}
      </v-btn>

      <v-btn
        @click="openDialogPalette('appColorDarkSecondary')"
        :color="SETTINGS.appColorDarkSecondary"
        class="mr-2 mb-2"
        rounded
        variant="tonal"
      >
        <v-icon start>mdi-brush-variant</v-icon>
        {{ t('settings_labels.appearance.secondary') }}
      </v-btn>
    </div>

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
    <v-dialog v-model="dialogGenerateTheme" width="390">
      <v-card rounded="xl" class="pa-0">
        <v-card-title class="d-flex align-center pa-4 pb-0 text-body-1 font-weight-medium">
          <v-icon start class="mr-2 text-primary">mdi-palette-swatch</v-icon>
          {{ t('settings_labels.appearance.generate_theme') }}
        </v-card-title>

        <v-card-text class="pa-4 pb-0">
          <p class="text-caption text-medium-emphasis mb-3">
            {{ t('settings_labels.appearance.generate_theme_hint') }}
          </p>
        </v-card-text>

        <div class="palette-dialog-picker-wrap mx-4">
          <v-color-picker
            v-model="generateBaseColor"
            mode="hex"
            elevation="0"
            class="palette-dialog-picker"
          />
        </div>

        <div class="d-flex flex-wrap ga-2 pa-4 pt-2">
          <v-btn
            @click="applyGeneratedTheme('light')"
            color="primary"
            variant="tonal"
            rounded="xl"
            size="small"
          >
            <v-icon start size="small">mdi-weather-sunny</v-icon>
            {{ t('settings_labels.appearance.generate_theme_light') }}
          </v-btn>

          <v-btn
            @click="applyGeneratedTheme('dark')"
            color="primary"
            variant="tonal"
            rounded="xl"
            size="small"
          >
            <v-icon start size="small">mdi-weather-night</v-icon>
            {{ t('settings_labels.appearance.generate_theme_dark') }}
          </v-btn>

          <v-btn
            @click="applyGeneratedTheme('both')"
            color="primary"
            variant="flat"
            rounded="xl"
            size="small"
          >
            <v-icon start size="small">mdi-auto-fix</v-icon>
            {{ t('settings_labels.appearance.generate_theme_both') }}
          </v-btn>
        </div>

        <v-divider class="palette-divider"/>
        <v-card-actions class="pa-4 pt-3">
          <v-btn
            @click="dialogGenerateTheme = false"
            variant="outlined"
            rounded="xl"
          >
            {{ t('common.cancel') }}
          </v-btn>
        </v-card-actions>
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