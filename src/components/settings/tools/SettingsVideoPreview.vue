<template>
  <div id="video_preview" class="mx-4 pb-2 video-preview-settings">
    <SettingsCategoryDivider
      :title="t('settings_labels.appearance.video_preview')"
      icon="animation-play"
    >
      <template #actions>
        <ButtonDocumentation id="sets.tools.video_preview"/>
      </template>
    </SettingsCategoryDivider>

    <!-- Static -->
    <section class="video-preview-settings__section">
      <div class="video-preview-settings__heading">
        <div class="text-subtitle-2 text-high-emphasis">
          {{ t('settings_labels.appearance.static_preview') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('settings_labels.appearance.static_preview_hint') }}
        </div>
      </div>

      <v-btn-toggle
        :model-value="SETTINGS.videoPreviewStatic"
        @update:model-value="onStaticChange"
        mandatory
        divided
        rounded="lg"
        color="primary"
        class="video-preview-settings__toggle"
      >
        <v-btn value="thumb" class="video-preview-settings__btn">
          <v-icon icon="mdi-image-outline" start/>
          {{ t('settings_labels.appearance.thumb') }}
        </v-btn>
        <v-btn value="grid" class="video-preview-settings__btn">
          <v-icon icon="mdi-view-grid" start/>
          {{ t('settings_labels.appearance.grid_3x3') }}
          <v-chip
            size="x-small"
            color="warning"
            variant="tonal"
            label
            class="ml-2"
          >
            {{ t('settings_labels.appearance.video_preview_cpu_chip') }}
          </v-chip>
        </v-btn>
      </v-btn-toggle>
    </section>

    <!-- Hover -->
    <section class="video-preview-settings__section">
      <div class="video-preview-settings__heading">
        <div class="text-subtitle-2 text-high-emphasis">
          {{ t('settings_labels.appearance.hover_preview') }}
        </div>
        <div class="text-caption text-medium-emphasis">
          {{ t('settings_labels.appearance.hover_preview_hint') }}
        </div>
      </div>

      <v-btn-toggle
        :model-value="SETTINGS.videoPreviewHover"
        @update:model-value="onHoverChange"
        mandatory
        divided
        rounded="lg"
        color="primary"
        class="video-preview-settings__toggle"
      >
        <v-btn value="none" class="video-preview-settings__btn">
          {{ t('common.none') }}
        </v-btn>
        <v-btn value="timeline" class="video-preview-settings__btn">
          <v-icon icon="mdi-led-strip-variant" start/>
          {{ t('settings_labels.appearance.timeline') }}
          <v-chip
            size="x-small"
            color="warning"
            variant="tonal"
            label
            class="ml-2"
          >
            {{ t('settings_labels.appearance.video_preview_cpu_chip') }}
          </v-chip>
        </v-btn>
        <v-btn value="video" class="video-preview-settings__btn">
          <v-icon icon="mdi-television-play" start/>
          {{ t('settings_labels.appearance.video') }}
        </v-btn>
      </v-btn-toggle>
    </section>

    <v-alert
      v-if="showCpuWarning"
      type="warning"
      icon="mdi-alert"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="text-caption mb-4"
    >
      {{ t('settings_labels.appearance.video_preview_cpu_warning') }}
      {{ t('settings_labels.appearance.video_preview_slow_warning') }}
    </v-alert>

    <!-- Video hover options -->
    <section
      v-if="SETTINGS.videoPreviewHover === 'video'"
      class="video-preview-settings__video-group"
    >
      <settings-switch
        option="play_sound_on_video_preview"
        :title="t('settings_labels.appearance.play_sound')"
      >
        <template #thumb>
          <v-icon
            v-if="SETTINGS.play_sound_on_video_preview == '1'"
            size="small"
          >
            mdi-volume-high
          </v-icon>
          <v-icon
            v-else
            size="small"
          >
            mdi-volume-off
          </v-icon>
        </template>
      </settings-switch>

      <div class="video-preview-settings__slider">
        <div class="d-flex align-center justify-space-between mb-1">
          <span class="text-body-2 text-high-emphasis">
            {{ t('settings_labels.appearance.preview_delay') }}
          </span>
          <span class="text-caption text-medium-emphasis">
            {{ previewDelayMs }} ms
          </span>
        </div>
        <v-slider
          :model-value="Number(SETTINGS.delayVideoPreview)"
          @update:model-value="(val) => setOption(String(val), 'delayVideoPreview')"
          min="0"
          max="2000"
          step="100"
          track-size="7"
          density="compact"
          color="primary"
          hide-details
          class="video-preview-settings__slider-control"
        />
      </div>

      <settings-switch
        option="big_video_preview"
        :title="t('settings_labels.appearance.big_preview')"
      />

      <template v-if="SETTINGS.big_video_preview == '1'">
        <div class="video-preview-settings__slider">
          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-body-2 text-high-emphasis">
              {{ t('settings_labels.appearance.big_preview_delay') }}
            </span>
            <span class="text-caption text-medium-emphasis">
              {{ bigPreviewDelayMs }} ms
            </span>
          </div>
          <v-slider
            :model-value="Number(SETTINGS.big_video_preview_delay)"
            @update:model-value="(val) => setOption(String(val), 'big_video_preview_delay')"
            min="0"
            max="9999"
            step="100"
            track-size="7"
            density="compact"
            :color="bigPreviewDelayMs < 1000 ? 'warning' : 'primary'"
            hide-details
            class="video-preview-settings__slider-control"
          />
        </div>

        <v-alert
          v-if="bigPreviewDelayMs < 1000"
          type="warning"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-caption mb-3"
        >
          {{ t('settings_labels.appearance.big_preview_delay_warning') }}
        </v-alert>

        <v-alert
          type="info"
          variant="tonal"
          density="compact"
          rounded="xl"
          class="text-caption"
        >
          {{ t('settings_labels.appearance.big_preview_set_thumb_hint') }}
        </v-alert>
      </template>
    </section>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {useSettingsStore} from '@/stores/settings'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import {setOption} from '@/services/settingsService'

const {t} = useI18n()
const settingsStore = useSettingsStore()
const SETTINGS = computed(() => settingsStore)

const showCpuWarning = computed(() =>
  SETTINGS.value.videoPreviewStatic === 'grid'
  || SETTINGS.value.videoPreviewHover === 'timeline',
)

const previewDelayMs = computed(() => Math.floor(Number(SETTINGS.value.delayVideoPreview) || 0))
const bigPreviewDelayMs = computed(() => Math.floor(Number(SETTINGS.value.big_video_preview_delay) || 0))

const onStaticChange = (val: unknown) => {
  if (val == null) return
  setOption(String(val), 'videoPreviewStatic')
}

const onHoverChange = (val: unknown) => {
  if (val == null) return
  setOption(String(val), 'videoPreviewHover')
}
</script>

<style scoped>
.video-preview-settings__section {
  margin-bottom: 1.25rem;
}

.video-preview-settings__heading {
  margin-bottom: 0.5rem;
}

.video-preview-settings__toggle {
  flex-wrap: wrap;
  max-width: 100%;
}

.video-preview-settings__btn {
  text-transform: none;
  letter-spacing: normal;
}

.video-preview-settings__video-group {
  margin-top: 0.25rem;
  padding: 0.75rem 0 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.video-preview-settings__slider {
  margin: 0.75rem 0 1rem;
  max-width: 28rem;
}

.video-preview-settings__slider-control {
  width: 100%;
}
</style>
