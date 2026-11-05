<script setup lang="ts">
import {useI18n} from 'vue-i18n'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
const {t} = useI18n()
</script>
<template><div class="mx-4">
    <settings-switch
      option="virtualImageGrid"
      :title="t('settings_labels.appearance.virtual_image_grid')"
      :hint="t('settings_labels.appearance.virtual_image_grid_hint')"
    />
</div></template>
