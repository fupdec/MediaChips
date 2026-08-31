<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.tools.sfw_mode')"
      icon="eye-off"
    />

    <settings-switch
      option="sfwMode"
      :title="t('settings_labels.tools.sfw_mode')"
      :hint="t('settings_labels.tools.sfw_mode_hint')"
      icon-text="eye-off"
      icon-color="primary"
    />
  </div>
</template>

<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'

const {t} = useI18n()
</script>
