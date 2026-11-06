<template>
  <div class="mx-4">
    <SettingsGroupPanel>
      <settings-switch
        option="startupHealthNotifications"
        :title="t('settings_labels.general.startup_health_notifications')"
        :hint="t('settings_labels.general.startup_health_notifications_hint')"
      />

      <SettingsMinimizeToTray v-if="showTraySetting"/>
    </SettingsGroupPanel>
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import {isDesktopElectronUi} from '@/utils/electronUi'
import SettingsMinimizeToTray from './SettingsMinimizeToTray.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsGroupPanel from '@/components/ui/SettingsGroupPanel.vue'
const {t} = useI18n()
const showTraySetting = isDesktopElectronUi()
</script>
