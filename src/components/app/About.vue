<template>
  <div class="mx-4">
    <div class="d-flex">
      <div>
        <div>{{ t('aboutApp.version', {version: appVersion}) }}</div>
        <div>{{ t('aboutApp.contributors') }}</div>
        <v-btn
          @click="dialogs.versions = true"
          class="px-5 mt-2 mr-2"
          color="primary"
          rounded
          variant="flat"
          dark
        >
          <v-icon start>mdi-text</v-icon>
          {{ t('aboutApp.version_history') }}
        </v-btn>
        <v-btn
          @click="openLink('https://mediachips.app/')"
          class="px-5 mt-2 mr-2"
          color="#7059b7"
          rounded
          variant="flat"
          dark
        >
          <v-icon start>mdi-web</v-icon>
          {{ t('aboutApp.website') }}
        </v-btn>
      </div>
      <v-spacer></v-spacer>
      <div class="text-center d-flex flex-column">
        <img :src="logoPath" alt="MediaChips" width="64" height="64"/>
        <span>{{ currentYear }}</span>
      </div>
    </div>

    <template v-if="isElectron">
      <v-divider class="my-4"></v-divider>

      <div class="mb-2 text-body-1 text-high-emphasis">{{ t('auto_update.title') }}</div>

      <div v-if="updaterDisabledReason === 'portable'" class="text-body-2 text-medium-emphasis mb-4">
        {{ t('auto_update.portable_hint') }}
      </div>

      <settings-switch
        v-if="updaterSupported"
        option="checkForUpdatesAtStartup"
        :title="t('auto_update.check_at_startup')"
        class="mb-2"
      />

      <div class="d-flex flex-wrap align-center ga-2 mt-2">
        <v-btn
          v-if="updaterSupported"
          @click="handleCheckUpdates"
          color="primary"
          variant="flat"
          rounded
          :loading="isChecking"
        >
          <v-icon start>mdi-update</v-icon>
          {{ t('auto_update.check_now') }}
        </v-btn>

        <v-btn
          v-if="!updaterSupported"
          @click="openReleases"
          color="primary"
          variant="outlined"
          rounded
        >
          <v-icon start>mdi-download</v-icon>
          {{ t('auto_update.download_from_github') }}
        </v-btn>
      </div>
    </template>

    <v-divider class="my-4"></v-divider>

    <div class="d-flex flex-column">
      <div class="mb-4">
        {{ t('aboutApp.libraries_thanks') }}
      </div>
      <div class="d-flex flex-wrap">
        <span
          v-for="lib in libraries"
          :key="lib.name"
          :title="`${lib.name}@${lib.version}`"
          @click="openLink(lib.url)"
          class="mr-2 link"
        >
          {{ lib.name }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {getProjectDependencies} from '@/utils/projectDependencies'
import {useAppUpdater} from '@/composable/useAppUpdater'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'

const {t} = useI18n()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const {ensureInitialized, check, isSupported, status} = useAppUpdater()

const libraries = getProjectDependencies()
const appVersion = computed(() =>
  String(appStore.appVersion).replace(/(-beta)+$/i, '-beta'),
)
const dialogs = computed(() => dialogsStore)
const currentYear = new Date().getFullYear()
const isChecking = ref(false)
const isElectron = computed(() => appStore.isElectron)
const updaterSupported = computed(() => isSupported.value)
const updaterDisabledReason = computed(() => status.value.reason)

const logoPath = computed(() => {
  try {
    return new URL('/icons/icon.png', import.meta.url).href
  } catch {
    return '/icons/icon.png'
  }
})

const openLink = (link: string) => {
  window.open(link, '_blank', 'noopener,noreferrer')
}

const openReleases = () => {
  openLink(String(status.value.releasesUrl || 'https://github.com/fupdec/MediaChips/releases/latest'))
}

async function handleCheckUpdates() {
  isChecking.value = true
  try {
    await check({manual: true})
  } finally {
    isChecking.value = false
  }
}

onMounted(async () => {
  if (isElectron.value && window.electronAPI?.updater) {
    await ensureInitialized()
  }
})
</script>

<style scoped>
.link {
  margin-right: 5px;
  cursor: pointer;
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.link:hover {
  color: rgb(var(--v-primary-darken-2));
}
</style>
