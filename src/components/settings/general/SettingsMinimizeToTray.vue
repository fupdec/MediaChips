<template>
  <v-switch
    v-model="enabled"
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
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {
  persistMinimizeToTray,
  readMinimizeToTrayFromStore,
} from '@/services/globalAppConfig'

const {t} = useI18n({useScope: 'global'})

const enabled = computed<boolean>({
  get: () => readMinimizeToTrayFromStore(),
  set: (value) => {
    void persistMinimizeToTray(value)
  },
})
</script>

<style scoped>
.settings-switch :deep(.v-label) {
  background-color: transparent !important;
  opacity: 1;
}
</style>
