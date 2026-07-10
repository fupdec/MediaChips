<template>
  <v-snackbar
    v-model="show"
    :timeout="snackbarTimeout"
    vertical
    variant="flat"
    rounded="lg"
    :color="snackbarColor"
  >
    <div class="text-body-2">{{ message }}</div>

    <div
      v-if="showReleaseNotesPreview"
      class="text-caption text-medium-emphasis mt-2 release-notes-preview"
    >
      {{ releaseNotesPreview }}
    </div>

    <v-progress-linear
      v-if="status.state === 'downloading'"
      :model-value="Number(status.percent || 0)"
      color="success"
      class="mt-3"
      rounded
      height="6"
    />

    <template v-slot:actions>
      <v-btn
        v-if="showViewChangelog"
        @click="handleViewChangelog"
        color="primary"
        variant="tonal"
        class="px-4 mr-2"
      >
        <v-icon icon="mdi-text-box-outline" start></v-icon>
        {{ t('auto_update.view_changelog') }}
      </v-btn>

      <v-btn
        v-if="showSkipVersion"
        @click="handleSkipVersion"
        variant="text"
        class="px-4 mr-2"
      >
        <v-icon icon="mdi-close-circle-outline" start></v-icon>
        {{ t('auto_update.skip_version') }}
      </v-btn>

      <v-btn
        v-if="status.state === 'available' && !status.manualInstall"
        @click="handleDownload"
        color="success"
        variant="flat"
        class="px-4"
        :loading="isDownloading"
      >
        <v-icon icon="mdi-download" start></v-icon>
        {{ t('auto_update.download') }}
      </v-btn>

      <v-btn
        v-if="status.state === 'available-manual' || showManualInstall"
        @click="handleInstall"
        color="success"
        variant="flat"
        class="px-4"
      >
        <v-icon icon="mdi-download" start></v-icon>
        {{ t('auto_update.download_dmg') }}
      </v-btn>

      <v-btn
        v-if="status.state === 'downloaded' && !status.manualInstall"
        @click="handleInstall"
        color="success"
        variant="flat"
        class="px-4"
      >
        <v-icon icon="mdi-restart" start></v-icon>
        {{ t('auto_update.install_now') }}
      </v-btn>

      <v-btn
        v-if="status.state === 'error'"
        @click="handleRetry"
        color="primary"
        variant="flat"
        class="px-4 mr-2"
      >
        <v-icon icon="mdi-refresh" start></v-icon>
        {{ t('auto_update.retry') }}
      </v-btn>

      <v-btn
        v-if="showFallbackDownload"
        @click="openReleases"
        color="success"
        variant="flat"
        class="px-4 mr-2"
      >
        <v-icon icon="mdi-open-in-new" start></v-icon>
        {{ t('common.download') }}
      </v-btn>

      <v-btn
        v-if="showDismiss"
        @click="handleDismiss"
        variant="text"
        class="px-4"
      >
        <v-icon icon="mdi-close" start></v-icon>
        {{ dismissLabel }}
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script setup lang="ts">
import {computed, onMounted, ref, watch} from 'vue'
import {useAppStore} from '@/stores/app'
import {useI18n} from 'vue-i18n'
import {useAppUpdater} from '@/composable/useAppUpdater'
import {openChangelogDialog} from '@/composable/useWhatsNew'
import {getChangelogEntry} from '@/services/changelog'

const appStore = useAppStore()
const {t} = useI18n()
const {
  status,
  lastCheckManual,
  ensureInitialized,
  check,
  download,
  install,
  dismiss,
  skipOfferedVersion,
} = useAppUpdater()

const show = ref(false)
const isDownloading = ref(false)
const releasesUrl = 'https://github.com/fupdec/MediaChips/releases/latest'

const message = computed(() => {
  switch (status.value.state) {
    case 'checking':
      return t('auto_update.checking')
    case 'available':
      return t('auto_update.available', {
        current: status.value.currentVersion,
        next: status.value.nextVersion,
      })
    case 'available-manual':
      return t('auto_update.available_manual', {
        current: status.value.currentVersion,
        next: status.value.nextVersion,
      })
    case 'downloading':
      return t('auto_update.downloading', {
        percent: Math.round(Number(status.value.percent || 0)),
      })
    case 'downloaded':
      return t('auto_update.ready_to_install', {
        version: status.value.nextVersion,
      })
    case 'downloaded-manual':
      return t('auto_update.ready_to_install_manual', {
        version: status.value.nextVersion,
      })
    case 'up-to-date':
      return t('auto_update.up_to_date', {
        version: status.value.currentVersion,
      })
    case 'error':
      if (isSignatureError.value) {
        return t('auto_update.mac_unsigned_error')
      }
      return t('auto_update.error', {
        message: status.value.message || t('auto_update.error_unknown'),
      })
    case 'disabled':
      if (status.value.reason === 'dev') {
        return t('auto_update.dev_hint')
      }
      if (status.value.reason === 'portable') {
        return t('auto_update.portable_hint')
      }
      return t('auto_update.disabled_hint')
    default:
      return ''
  }
})

const snackbarColor = computed(() => {
  if (status.value.state === 'error' && !isSignatureError.value) return 'error'
  if (['downloaded', 'downloaded-manual'].includes(status.value.state)) return 'success'
  return undefined
})

const isSignatureError = computed(() => {
  const message = String(status.value.message || '')
  return /code signature/i.test(message) || /не удалось удовлетворить требован/i.test(message)
})

const showManualInstall = computed(() => (
  status.value.state === 'downloaded-manual' ||
  (status.value.state === 'error' && isSignatureError.value)
))

const snackbarTimeout = computed(() => {
  if (['checking', 'downloading', 'available', 'available-manual', 'downloaded', 'downloaded-manual', 'error'].includes(status.value.state)) {
    return -1
  }
  return 4000
})

const showDismiss = computed(() => (
  ['available', 'available-manual', 'downloaded', 'downloaded-manual', 'error', 'up-to-date', 'disabled'].includes(status.value.state)
))

const dismissLabel = computed(() => (
  status.value.state === 'up-to-date' ? t('common.close') : t('auto_update.later')
))

const showSkipVersion = computed(() => (
  ['available', 'available-manual'].includes(status.value.state)
  && Boolean(status.value.nextVersion)
))

const showViewChangelog = computed(() => {
  if (!['available', 'available-manual', 'downloaded', 'downloaded-manual'].includes(status.value.state)) {
    return false
  }

  const version = status.value.nextVersion
  if (!version) {
    return false
  }

  return Boolean(getChangelogEntry(version) || String(status.value.releaseNotes || '').trim())
})

const releaseNotesPreview = computed(() => {
  const version = status.value.nextVersion
  if (!version) {
    return ''
  }

  const bundled = getChangelogEntry(version)
  if (bundled?.name) {
    return bundled.name
  }

  const notes = String(status.value.releaseNotes || '').trim()
  if (!notes) {
    return ''
  }

  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0)
    ?.replace(/^[-*]\s*/, '')
    ?.replace(/\*\*/g, '')
    ?.replace(/ — .+$/, '')
    || ''
})

const showReleaseNotesPreview = computed(() => (
  showViewChangelog.value && Boolean(releaseNotesPreview.value)
))

const showFallbackDownload = computed(() => (
  status.value.state === 'disabled' ||
  (status.value.state === 'error' && !isSignatureError.value)
))

watch(status, (value) => {
  if (!lastCheckManual.value) {
    if (['available', 'available-manual', 'downloading', 'downloaded', 'downloaded-manual', 'error'].includes(value.state)) {
      show.value = true
    }
    return
  }

  if (['checking', 'available', 'available-manual', 'downloading', 'downloaded', 'downloaded-manual', 'error', 'up-to-date', 'disabled'].includes(value.state)) {
    show.value = true
  }
}, {deep: true})

async function handleDownload() {
  isDownloading.value = true
  try {
    await download()
  } finally {
    isDownloading.value = false
  }
}

function handleInstall() {
  install()
}

function handleRetry() {
  check({manual: true})
}

function handleDismiss() {
  show.value = false
  dismiss()
}

function handleViewChangelog() {
  const version = status.value.nextVersion
  if (!version) {
    return
  }

  openChangelogDialog({
    version,
    markdown: status.value.releaseNotes,
    title: t('auto_update.changelog_for', { version: version.startsWith('v') ? version : `v${version}` }),
  })
}

async function handleSkipVersion() {
  await skipOfferedVersion()
  show.value = false
}

function openReleases() {
  window.open(String(status.value.releasesUrl || releasesUrl), '_blank', 'noopener,noreferrer')
}

onMounted(() => {
  if (appStore.isElectron && window.electronAPI?.updater) {
    ensureInitialized()
  }
})
</script>

<style scoped>
.release-notes-preview {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
