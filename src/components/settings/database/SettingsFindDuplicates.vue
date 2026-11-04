<template>
  <SettingsHealthTask id="settings-find-duplicates" status="idle">
  <div class="pb-1">
    <SettingsHealthSectionHeader
      :title="t('settings_labels.database.find_duplicates')"
      icon="content-duplicate"
      :hint="t('settings_labels.database.find_duplicates_hint')"
      status="idle"
    />

    <SettingsSwitch
      option="copyVerificationSha256"
      :title="t('copies.full_verification')"
      :hint="t('copies.full_verification_hint')"
      class="mb-4"
      data-testid="copy-sha256-setting"
    />

    <SettingsSwitch option="copyDiscoveryOnReconnect" :title="t('copyDiscovery.auto_reconnect')" :hint="t('copyDiscovery.auto_reconnect_hint')" data-testid="copy-auto-reconnect" />
    <SettingsSwitch option="copyDiscoveryOnImport" :title="t('copyDiscovery.auto_import')" :hint="t('copyDiscovery.auto_import_hint')" data-testid="copy-auto-import" />
    <SettingsSwitch option="copyDiscoveryOnFolderUpdate" :title="t('copyDiscovery.auto_folders')" :hint="t('copyDiscovery.auto_folders_hint')" data-testid="copy-auto-folders" />
    <MediaCopyDiscovery :show-results="false" collapse-history />

    <v-select
      v-model="mediaTypeId"
      :items="mediaTypeItems"
      item-title="title"
      item-value="value"
      :label="t('settings_labels.database.find_duplicates_media_type')"
      variant="outlined"
      density="compact"
      rounded="lg"
      hide-details
      class="mb-3"
      style="max-width: 360px;"
    />

    <v-select
      v-model="duplicatesBy"
      :items="modeItems"
      item-title="title"
      item-value="value"
      :label="t('settings_labels.database.find_duplicates_mode')"
      variant="outlined"
      density="compact"
      rounded="lg"
      hide-details
      class="mb-4"
      style="max-width: 360px;"
    />

    <v-btn
      color="primary"
      rounded
      variant="flat"
      class="pr-4"
      :disabled="!mediaTypeId || !duplicatesBy"
      @click="openReview"
    >
      <v-icon
        icon="mdi-view-grid-outline"
        start
      />
      {{ t('settings_labels.database.find_duplicates_open') }}
    </v-btn>
  </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import MediaCopyDiscovery from '@/components/items/MediaCopyDiscovery.vue'
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {
  getDefaultMediaTypeId,
  getCurrentMediaType,
} from '@/utils/mediaType'
import {getDuplicateMenuModes, getDuplicatesGroupKey} from '@/utils/mediaSortFilter'

const {t} = useI18n()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()

const mediaTypeId = ref<number | null>(getDefaultMediaTypeId(appStore.mediaTypes))
const duplicatesBy = ref('filesize')

const mediaTypeItems = computed(() =>
  (appStore.mediaTypes || []).map((item) => ({
    value: Number(item.id),
    title: item.name || `#${item.id}`,
  })),
)

const selectedMediaType = computed(() =>
  getCurrentMediaType(appStore.mediaTypes, mediaTypeId.value),
)

const modeItems = computed(() =>
  getDuplicateMenuModes(selectedMediaType.value).map((mode) => ({
    value: mode.value,
    title: t(mode.labelKey),
  })),
)

watch(
  [selectedMediaType, modeItems],
  () => {
    const allowed = new Set(modeItems.value.map((item) => item.value))
    const preferred = getDuplicatesGroupKey(selectedMediaType.value, duplicatesBy.value)
    if (!allowed.has(duplicatesBy.value)) {
      duplicatesBy.value = allowed.has(preferred)
        ? preferred
        : (modeItems.value[0]?.value || 'filesize')
    }
  },
  {immediate: true},
)

function openReview() {
  if (!mediaTypeId.value || !duplicatesBy.value) return
  dialogsStore.openDuplicateReview({
    mediaTypeId: Number(mediaTypeId.value),
    duplicatesBy: duplicatesBy.value,
  })
}
</script>
