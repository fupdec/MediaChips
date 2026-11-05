<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
const {t} = useI18n()
const settingsStore = useSettingsStore()
const SETTINGS = computed(() => settingsStore)
</script>
<template><div class="mx-4">
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

</div></template>
<style scoped>
.filtering-sample b { color: rgb(var(--v-theme-primary)); }
</style>
