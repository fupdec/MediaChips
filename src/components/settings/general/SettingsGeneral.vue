<template>
  <div class="mx-4">
    <v-alert
      :type="SETTINGS.allowLanAccess === '1' ? 'info' : 'warning'"
      variant="tonal"
      density="compact"
      class="text-body-2 mb-3"
      rounded="xl"
    >
      <div>
        {{
          SETTINGS.allowLanAccess === '1'
            ? t('settings_labels.general.browser_access')
            : t('settings_labels.general.browser_access_disabled')
        }}
      </div>

      <v-btn
        v-if="SETTINGS.allowLanAccess === '1'"
        @click="copy"
        color="info"
        :title="t('settings_labels.general.copy_link')"
        rounded="xl"
        size="small"
        variant="outlined"
        class="mt-1"
      >
        <v-icon start size="small">mdi-content-copy</v-icon>
        <span>{{ t('settings_labels.general.copy_link') }}:</span>
        <b>{{ frontendUrl }}</b>
      </v-btn>
    </v-alert>

    <settings-switch
      option="allowLanAccess"
      :title="t('settings_labels.general.allow_lan_access')"
      :hint="lanAccessHint"
      :disabled="lanAccessEnvLocked"
      @update="refreshNetworkConfig"
    />

    <!-- EXACT TYPING SWITCH -->
    <settings-switch
      option="typingFiltersDefault"
      :hide-details="false"
    >
      <template #label>
        <div class="d-flex flex-column ml-4">
          <div class="text-body-1 text-high-emphasis">{{ t('settings_labels.general.exact_filtering') }}</div>
          <div class="text-caption text-medium-emphasis filtering-sample mt-1">
            <span v-if="SETTINGS.typingFiltersDefault == '1'">
              {{ t('settings_labels.general.typing') }}: <b>favo</b> / {{ t('settings_labels.general.result') }}: <b>favo</b>rite video
            </span>
            <span v-else>
              {{ t('settings_labels.general.typing') }}: <b>fade</b> / {{ t('settings_labels.general.result') }}: <b>fa</b>vorite vi<b>de</b>o
            </span>
          </div>
        </div>
      </template>
    </settings-switch>

    <!-- COUNT VIEWS SWITCH -->
    <settings-switch
      option="count_number_of_views"
      :title="t('settings_labels.general.count_views')"
      :hint="t('settings_labels.general.count_views_hint')"
    ></settings-switch>

    <!-- MINIMIZE TO TRAY SWITCH (Windows only, stored in config.json) -->
    <v-switch
      v-if="showTraySetting"
      v-model="minimizeToTray"
      color="primary"
      class="mt-0 settings-switch"
      inset
    >
      <template #label>
        <div class="d-flex flex-column ml-4">
          <div class="text-body-1 text-high-emphasis">
            {{ t('settings_labels.general.minimize_to_tray') }}
          </div>
          <div class="text-caption text-medium-emphasis mt-1">
            {{ t('settings_labels.general.minimize_to_tray_hint') }}
          </div>
        </div>
      </template>
    </v-switch>
  </div>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {refreshServerConfig, updateConfig} from '@/services/configService'
import {useAppPlatform} from '@/composable/useAppPlatform'
import {syncMinimizeToTray} from '@/services/electronBridge'

import SettingsSwitch from "@/components/ui/SettingsSwitch.vue";

const {t} = useI18n({useScope: 'global'})

const appStore = useAppStore()
const settingsStore = useSettingsStore()
const lanAccessEnvLocked = ref(false)

const {isElectron, isWin} = useAppPlatform()
const showTraySetting = computed(() => isElectron && isWin)

const minimizeToTray = computed<boolean>({
  get: () => appStore.config.minimizeToTray === '1',
  set: (enabled) => {
    const value = enabled ? '1' : '0'
    appStore.config = {...appStore.config, minimizeToTray: value}
    void updateConfig({minimizeToTray: value})
    void syncMinimizeToTray(enabled)
  },
})

const SETTINGS = computed(() => settingsStore)
const frontendUrl = computed(() => appStore.localhost)
const lanAccessHint = computed(() =>
  lanAccessEnvLocked.value
    ? t('settings_labels.general.allow_lan_access_env_locked')
    : t('settings_labels.general.allow_lan_access_hint'),
)

const copy = async () => {
  try {
    await navigator.clipboard.writeText(frontendUrl.value)
  } catch (err) {
    console.error('Failed to copy link:', err)
  }
}

async function refreshNetworkConfig() {
  try {
    const config = await refreshServerConfig()
    lanAccessEnvLocked.value = config?.allowLanAccessEnvLocked === true
  } catch (error) {
    console.error('Failed to refresh server config after LAN toggle:', error)
  }
}

void refreshNetworkConfig()
</script>

<style lang="scss" scoped>
.filtering-sample {
  b {
    color: rgb(var(--v-theme-primary));
  }
}
</style>
