<template>
  <div class="lan-phone-hints mt-2">
    <div class="text-caption text-medium-emphasis">
      {{ t('settings_labels.general.phone_access_hint') }}
    </div>

    <div class="d-flex flex-wrap align-center ga-2 mt-2">
      <v-btn
        v-if="canInstall && !isElectronHost"
        color="primary"
        rounded
        size="small"
        variant="tonal"
        :loading="installing"
        @click="install"
      >
        <v-icon icon="mdi-cellphone-arrow-down" start/>
        {{ t('settings_labels.general.install_app') }}
      </v-btn>

      <div
        v-else-if="!isInstalled && !isElectronHost"
        class="text-caption text-medium-emphasis"
      >
        {{ t('settings_labels.general.add_to_home_screen_hint') }}
      </div>

      <div
        v-if="isInstalled"
        class="text-caption text-medium-emphasis"
      >
        {{ t('settings_labels.general.app_installed') }}
      </div>

      <ClearAppCacheButton/>
    </div>
  </div>
</template>

<script setup lang="ts">
import {ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {usePwaInstall} from '@/composable/usePwaInstall'
import ClearAppCacheButton from '@/components/app/ClearAppCacheButton.vue'

const {t} = useI18n()
const {canInstall, isInstalled, promptInstall} = usePwaInstall()
const installing = ref(false)
const isElectronHost = Boolean(window.electronAPI)

async function install() {
  installing.value = true
  try {
    await promptInstall()
  } finally {
    installing.value = false
  }
}
</script>
