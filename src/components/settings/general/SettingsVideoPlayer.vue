<script setup lang="ts">
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import {useSettingsStore} from '@/stores/settings'
import {useAppStore} from '@/stores/app'
import {useI18n} from 'vue-i18n'
import {fetchTranscodeCacheStats} from '@/services/transcodeService'
import {typedApi} from '@/services/typedApi'
import {getReadableFileSize} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {computed, onMounted, ref} from 'vue'
import {setOption} from '@/services/settingsService'

const SETTINGS = useSettingsStore()
const appStore = useAppStore()
const {t} = useI18n()
const clearingCache = ref(false)
const cacheBytes = ref(0)

const cacheUsageLabel = computed(() =>
  t('settings_labels.video_player.transcode_cache_usage', {
    size: getReadableFileSize(cacheBytes.value),
  }),
)

const loadCacheStats = async () => {
  try {
    const stats = await fetchTranscodeCacheStats()
    cacheBytes.value = stats?.bytes || 0
  } catch {
    cacheBytes.value = 0
  }
}

const clearTranscodeCache = async () => {
  clearingCache.value = true

  try {
    const response = await typedApi.clearTranscodeCache()
    cacheBytes.value = 0
    setNotification({
      type: 'success',
      title: t('settings_labels.video_player.title'),
      text: t('settings_labels.video_player.clear_transcode_cache_done', {
        count: response.data?.removed || 0,
        size: getReadableFileSize(response.data?.bytes || 0),
      }),
    })
  } catch (error) {
    setNotification({
      type: 'error',
      title: t('common.error'),
      text: error instanceof Error ? error.message : String(error),
    })
  } finally {
    clearingCache.value = false
    await loadCacheStats()
  }
}

onMounted(loadCacheStats)
</script>

<template>
  <div class="mx-4 video-player-settings">
    <SettingsCategoryDivider :title="$t('settings_labels.video_player.title')" icon="play-circle">
      <template #actions>
        <button-documentation id="player.formats"></button-documentation>
      </template>
    </SettingsCategoryDivider>

    <settings-switch
      option="isPlayVideoInSystemPlayer"
      :title="$t('settings_labels.video_player.open_system_player')"
      :hint="$t('settings_labels.video_player.open_system_player_hint')"
    />

    <settings-switch
      v-if="appStore.isElectron"
      option="open_player_in_separate_window"
      :title="$t('settings_labels.video_player.open_separate_window')"
      :hint="$t('settings_labels.video_player.open_separate_window_hint')"
      :disabled="SETTINGS.isPlayVideoInSystemPlayer === '1'"
    />

    <settings-switch
      option="restorePlaybackTime"
      :title="$t('settings_labels.video_player.restore_playback_time')"
      :hint="$t('settings_labels.video_player.restore_playback_time_hint')"
      :disabled="SETTINGS.isPlayVideoInSystemPlayer === '1'"
    />

    <settings-switch
      option="count_number_of_views"
      :title="t('settings_labels.general.count_views')"
      :hint="t('settings_labels.general.count_views_hint')"
    />

    <settings-switch
      option="transcodeUnsupportedFormats"
      :title="$t('settings_labels.video_player.transcode_unsupported')"
      :hint="$t('settings_labels.video_player.transcode_unsupported_hint')"
      :disabled="SETTINGS.isPlayVideoInSystemPlayer === '1'"
    />

    <div class="conversion-settings">
      <v-select
        :model-value="SETTINGS.conversionQuality"
        :items="[
          {title: t('conversionSettings.economy'), value: 'economy'},
          {title: t('conversionSettings.balanced'), value: 'balanced'},
          {title: t('conversionSettings.high'), value: 'quality'},
        ]"
        :label="t('conversionSettings.quality')"
        :hint="t('conversionSettings.quality_hint')"
        persistent-hint
        density="comfortable"
        variant="outlined"
        rounded="lg"
        @update:model-value="(value) => setOption(String(value), 'conversionQuality')"
      />

      <v-select
        :model-value="SETTINGS.conversionResolution"
        :items="[
          {title: t('conversionSettings.original'), value: 'original'},
          {title: t('conversionSettings.max_4k'), value: '2160'},
          {title: t('conversionSettings.max_1080'), value: '1080'},
          {title: t('conversionSettings.max_720'), value: '720'},
          {title: t('conversionSettings.max_480'), value: '480'},
        ]"
        :label="t('conversionSettings.resolution')"
        :hint="t('conversionSettings.resolution_hint')"
        persistent-hint
        density="comfortable"
        variant="outlined"
        rounded="lg"
        @update:model-value="(value) => setOption(String(value), 'conversionResolution')"
      />
    </div>

    <section id="settings-transcode-cache" class="transcode-cache">
      <div class="transcode-cache-actions">
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-broom"
          class="transcode-cache-actions__button"
          :loading="clearingCache"
          :disabled="SETTINGS.isPlayVideoInSystemPlayer === '1'"
          @click="clearTranscodeCache"
        >
          {{ $t('settings_labels.video_player.clear_transcode_cache') }}
        </v-btn>
        <div class="transcode-cache-actions__details">
          <div class="text-caption text-medium-emphasis font-weight-medium">
            {{ cacheUsageLabel }}
          </div>
          <div class="text-caption text-medium-emphasis">
            {{ $t('settings_labels.video_player.clear_transcode_cache_hint') }}
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.video-player-settings {
  container-type: inline-size;
}

.conversion-settings {
  display: grid;
  align-items: start;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px;
  margin-top: 24px;
  padding-top: 24px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), .08);
}

.conversion-settings > .v-select {
  min-width: 0;
}

.conversion-settings :deep(.v-field) {
  background: rgba(var(--v-theme-surface), .45);
}

.conversion-settings :deep(.v-input__details) {
  padding-top: 8px;
  line-height: 1.5;
}

.transcode-cache {
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(var(--v-theme-on-surface), .08);
}


.transcode-cache-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 20px;
}

.transcode-cache-actions__button {
  max-width: 100%;
  height: auto !important;
  min-height: 40px;
  padding-block: 10px;
}

.transcode-cache-actions__button :deep(.v-btn__content) {
  white-space: normal;
}

.transcode-cache-actions__details {
  flex: 1 1 240px;
}

@container (min-width: 640px) {
  .conversion-settings {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 24px;
  }
}
</style>
