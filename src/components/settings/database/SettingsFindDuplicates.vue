<template>
  <section id="settings-find-duplicates" class="duplicates-section">
    <SettingsGroupLabel
      :title="t('settings_labels.database.find_duplicates')"
      icon="content-duplicate"
      accent
    />

    <p class="duplicates-section__hint">{{ t('duplicateSimilarity.sectionHint') }}</p>

    <section class="duplicates-panel duplicates-search">
      <div class="duplicates-panel__heading">
        <span class="duplicates-panel__icon"><v-icon size="20">mdi-magnify</v-icon></span>
        <div>
          <h3>{{ t('duplicateSimilarity.searchTitle') }}</h3>
          <p>{{ t('duplicateSimilarity.searchHint') }}</p>
        </div>
      </div>
      <div class="duplicates-search__controls">
        <v-select v-model="mediaTypeId" :items="mediaTypeItems" item-title="title" item-value="value"
          :label="t('settings_labels.database.find_duplicates_media_type')"
          variant="outlined" density="compact" rounded="lg" hide-details />
        <v-select v-model="duplicatesBy" :items="modeItems" item-title="title" item-value="value"
          :label="t('settings_labels.database.find_duplicates_mode')"
          variant="outlined" density="compact" rounded="lg" hide-details />
        <div class="duplicates-search__actions">
        <v-btn color="primary" rounded="lg" variant="flat" height="40" append-icon="mdi-arrow-right" :disabled="!mediaTypeId || !duplicatesBy" @click="openReview">
          {{ t('settings_labels.database.find_duplicates_open') }}
        </v-btn>
        <ButtonDocumentation id="settings.duplicates" dense/>
        </div>
      </div>
    </section>

    <section class="duplicates-panel duplicates-advanced">
      <div class="duplicates-panel__heading">
        <span class="duplicates-panel__icon" aria-hidden="true"><v-icon size="20">mdi-tune-variant</v-icon></span>
        <h3>{{ t('duplicateSimilarity.advancedTitle') }}</h3>
      </div>
      <SettingsDuplicateSimilarity ref="similaritySettings" />
    </section>

    <section class="duplicates-panel">
      <div class="duplicates-panel__heading">
        <span class="duplicates-panel__icon"><v-icon size="20">mdi-shield-check-outline</v-icon></span>
        <div>
          <h3>{{ t('duplicateSimilarity.verificationTitle') }}</h3>
          <p>{{ t('duplicateSimilarity.verificationHint') }}</p>
        </div>
      </div>
      <SettingsSwitch option="copyVerificationSha256" :title="t('copies.full_verification')"
        :hint="t('duplicateSimilarity.shaHint')" data-testid="copy-sha256-setting" class="duplicates-setting" />
    </section>

    <section class="duplicates-panel">
      <div class="duplicates-panel__heading">
        <span class="duplicates-panel__icon"><v-icon size="20">mdi-sync</v-icon></span>
        <div>
          <h3>{{ t('duplicateSimilarity.discoveryTitle') }}</h3>
          <p>{{ t('duplicateSimilarity.discoveryHint') }}</p>
        </div>
      </div>
      <div class="duplicates-automation">
        <SettingsSwitch option="copyDiscoveryOnImport" :title="t('duplicateSimilarity.onImport')"
        :hint="t('duplicateSimilarity.onImportHint')" data-testid="copy-auto-import" class="duplicates-setting" />
        <SettingsSwitch option="copyDiscoveryOnFolderUpdate" :title="t('duplicateSimilarity.onFolder')"
        :hint="t('duplicateSimilarity.onFolderHint')" data-testid="copy-auto-folders" class="duplicates-setting" />
        <SettingsSwitch option="copyDiscoveryOnReconnect" :title="t('duplicateSimilarity.onReconnect')"
        :hint="t('duplicateSimilarity.onReconnectHint')" data-testid="copy-auto-reconnect" class="duplicates-setting" />
      </div>
    </section>

    <section class="duplicates-panel duplicates-folders">
      <div class="duplicates-panel__heading">
        <span class="duplicates-panel__icon"><v-icon size="20">mdi-folder-search-outline</v-icon></span>
        <div>
          <h3>{{ t('duplicateSimilarity.foldersTitle') }}</h3>
          <p>{{ t('duplicateSimilarity.foldersHint') }}</p>
        </div>
      </div>
      <MediaCopyDiscovery :show-heading="false" :show-results="false" collapse-history />
    </section>
  </section>
</template>

<script setup lang="ts">
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import SettingsDuplicateSimilarity from './SettingsDuplicateSimilarity.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import MediaCopyDiscovery from '@/components/items/MediaCopyDiscovery.vue'
import {computed, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsGroupLabel from '@/components/settings/SettingsGroupLabel.vue'
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
const duplicatesBy = ref('similarity')
const similaritySettings = ref<InstanceType<typeof SettingsDuplicateSimilarity> | null>(null)

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
  [{value: 'similarity', title: t('duplicateSimilarity.title')}, ...getDuplicateMenuModes(selectedMediaType.value).map((mode) => ({
    value: mode.value,
    title: t(mode.labelKey),
  }))],
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

async function openReview() {
  if (!await similaritySettings.value?.save()) return
  if (!mediaTypeId.value || !duplicatesBy.value) return
  dialogsStore.openDuplicateReview({
    mediaTypeId: Number(mediaTypeId.value),
    duplicatesBy: duplicatesBy.value,
  })
}
</script>

<style scoped>
.duplicates-section { display: grid; gap: var(--settings-block-gap, 16px); }
.duplicates-section > :deep(.settings-group-label) { margin: 0; }
.duplicates-section__hint { margin: 0; font-size: .8125rem; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .65); }
.duplicates-panel { padding: var(--settings-card-padding, 20px); border: 1px solid rgba(var(--v-theme-on-surface), .09); border-radius: 18px; background: rgb(var(--v-theme-surface)); }
.duplicates-panel__heading { display: flex; align-items: flex-start; gap: 12px; margin-bottom: var(--settings-heading-gap, 12px); }
.duplicates-panel__icon { display: grid; place-items: center; width: 36px; height: 36px; flex-shrink: 0; border-radius: 11px; color: rgb(var(--v-theme-primary)); background: rgba(var(--v-theme-primary), .08); }
.duplicates-panel__heading h3 { font-size: .9375rem; font-weight: 600; line-height: 1.5; }
.duplicates-panel__heading p { margin: 3px 0 0; font-size: .8125rem; line-height: 1.5; color: rgba(var(--v-theme-on-surface), .6); }
.duplicates-search__controls { display: grid; grid-template-columns: 1fr 1.15fr; gap: 12px; align-items: center; }
.duplicates-search__actions { grid-column: 1 / -1; display: flex; align-items: center; justify-content: flex-end; gap: 4px; }
.duplicates-advanced .duplicates-panel__heading { align-items: center; }
.duplicates-setting :deep(.v-selection-control) { align-items: flex-start; }
.duplicates-setting :deep(.v-label) { margin-left: 8px !important; }
.duplicates-setting :deep(.v-input__details) { display: none; }
.duplicates-automation > :not(:last-child) { padding-bottom: 14px; margin-bottom: 14px; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .06); }
.duplicates-folders :deep(.copy-discovery),
.duplicates-folders :deep(.copy-discovery > :last-child) { margin-block: 0; }
.duplicates-folders :deep(.v-textarea textarea) { font-family: monospace; font-size: .8125rem; line-height: 1.6; }
.duplicates-folders :deep(.copy-discovery__job) { border-color: rgba(var(--v-theme-on-surface), .07); }
@media (max-width: 600px) {
  .duplicates-search__controls { grid-template-columns: minmax(0, 1fr); }
  .duplicates-search__actions > .v-btn:not(.button-documentation--dense) { flex: 1; }
}
</style>
