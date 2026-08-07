<script setup lang="ts">
import { computed } from "vue";
import { useSettingsStore } from "@/stores/settings";
import { useTheme } from "vuetify";
import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";

const settingsStore = useSettingsStore();
const theme = useTheme();

const SETTINGS = computed(() => settingsStore);

async function syncDarkModeWithSystem(value: string) {
  const match = window.matchMedia('(prefers-color-scheme: dark)');

  if (value == "1") {
    theme.change(match.matches ? "dark" : "light")
    match.addEventListener("change", e => {
      theme.change(e.matches ? "dark" : "light")
    });
  } else {
    theme.change(SETTINGS.value.darkMode == "1" ? "dark" : "light");
  }
}

async function toggleDarkMode(value: string) {
  theme.global.name.value = value == "1" ? "dark" : "light";
}
</script>

<template>
  <settings-switch
    @update="syncDarkModeWithSystem"
    option="system_dark_mode"
    :title="$t('settings_labels.appearance.sync_dark_mode')"
  >
    <template #thumb>
      <v-icon v-if="SETTINGS.system_dark_mode == '1' && theme.global.current.value.dark"
        size="small">
        mdi-weather-night
      </v-icon>
      <v-icon
        v-else-if="SETTINGS.system_dark_mode == '1' || SETTINGS.system_dark_mode != '1' && !theme.global.current.value.dark"
        size="small">mdi-weather-sunny
      </v-icon>
    </template>
  </settings-switch>

  <settings-switch
    @update="toggleDarkMode"
    option="darkMode"
    :title="$t('settings_labels.appearance.dark_mode')"
    :disabled="SETTINGS.system_dark_mode == '1'"
  >
    <template #thumb>
      <v-icon v-if="SETTINGS.system_dark_mode != '1' && theme.global.current.value.dark"
        size="small">
        mdi-weather-night
      </v-icon>
    </template>
  </settings-switch>

  <settings-switch
    option="bottomBar"
    :title="$t('settings_labels.appearance.nav_bottom')"
  ></settings-switch>

  <settings-switch
    option="showPlaylistsInNavigation"
    :title="$t('settings_labels.appearance.show_playlists')"
  ></settings-switch>

  <settings-switch
    option="showMarkersInNavigation"
    :title="$t('settings_labels.appearance.show_markers')"
  ></settings-switch>
</template>
