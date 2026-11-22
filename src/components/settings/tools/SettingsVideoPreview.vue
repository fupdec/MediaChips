<template>
  <div id="video_preview" class="mx-4 video-preview-settings">
    <SettingsCategoryDivider
      :title="t('settings_labels.appearance.video_preview')"
      icon="animation-play"
    >
      <template #actions>
        <ButtonDocumentation id="sets.tools.video_preview"/>
      </template>
    </SettingsCategoryDivider>

    <div class="video-preview-settings__choices">
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

        <SettingsSegmentedControl
          :model-value="SETTINGS.videoPreviewStatic"
          :label="t('settings_labels.appearance.static_preview')"
          :items="[
            {value: 'thumb', title: t('settings_labels.appearance.thumb'), icon: 'mdi-image-outline'},
            {value: 'grid', title: t('settings_labels.appearance.grid_3x3'), icon: 'mdi-view-grid', badge: t('settings_labels.appearance.video_preview_cpu_chip')},
          ]"
          @update:model-value="onStaticChange"
        />
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
          <div
            v-if="SETTINGS.videoPreviewHover === 'video' || SETTINGS.videoPreviewHover === 'timeline'"
            class="text-caption text-medium-emphasis"
          >
            {{ t('settings_labels.appearance.hover_preview_grid_fallback') }}
          </div>
        </div>

        <SettingsSegmentedControl
          :model-value="SETTINGS.videoPreviewHover"
          :label="t('settings_labels.appearance.hover_preview')"
          :items="[
            {value: 'none', title: t('common.none')},
            {value: 'timeline', title: t('settings_labels.appearance.timeline'), icon: 'mdi-led-strip-variant', badge: t('settings_labels.appearance.video_preview_cpu_chip')},
            {value: 'video', title: t('settings_labels.appearance.video'), icon: 'mdi-television-play'},
          ]"
          @update:model-value="onHoverChange"
        />
      </section>
    </div>

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
      <div class="video-preview-settings__delays">
        <div class="video-preview-settings__delay-column">
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
              <span class="text-caption text-medium-emphasis flex-shrink-0 ml-3">
                {{ previewDelayMs }} ms
              </span>
            </div>
            <PillSlider
              :model-value="Number(SETTINGS.delayVideoPreview)"
              @update:model-value="(val: number) => setOption(String(val), 'delayVideoPreview')"
              min="0"
              max="2000"
              step="100"
              class="video-preview-settings__slider-control"
            />
          </div>
        </div>
        <div class="video-preview-settings__delay-column">
          <settings-switch
            option="big_video_preview"
            :title="t('settings_labels.appearance.big_preview')"
          />

          <div v-if="SETTINGS.big_video_preview == '1'" class="video-preview-settings__slider">
            <div class="d-flex align-center justify-space-between mb-1">
              <span class="text-body-2 text-high-emphasis">
                {{ t('settings_labels.appearance.big_preview_delay') }}
              </span>
              <span class="text-caption text-medium-emphasis flex-shrink-0 ml-3">
                {{ bigPreviewDelayMs }} ms
              </span>
            </div>
            <PillSlider
              :model-value="Number(SETTINGS.big_video_preview_delay)"
              @update:model-value="(val: number) => setOption(String(val), 'big_video_preview_delay')"
              min="0"
              max="9999"
              step="100"
              :color="bigPreviewDelayMs < 1000 ? 'warning' : 'primary'"
              class="video-preview-settings__slider-control"
            />
          </div>
        </div>
      </div>

      <template v-if="SETTINGS.big_video_preview == '1'">
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
import PillSlider from '@/components/ui/PillSlider.vue'
import ButtonDocumentation from '@/components/ui/ButtonDocumentation.vue'
import SettingsSwitch from '@/components/ui/SettingsSwitch.vue'
import SettingsSegmentedControl from '@/components/ui/SettingsSegmentedControl.vue'
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
.video-preview-settings {
  container-type: inline-size;
}

.video-preview-settings__choices,
.video-preview-settings__delays {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 20px 28px;
  margin-bottom: 20px;
}

.video-preview-settings__section,
.video-preview-settings__delay-column {
  min-width: 0;
}

.video-preview-settings__section {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.video-preview-settings__section > .settings-segmented {
  margin-top: auto;
}

@container (min-width: 680px) {
  .video-preview-settings__choices,
  .video-preview-settings__delays {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.video-preview-settings__heading {
  margin-bottom: 0.5rem;
}

.video-preview-settings__video-group {
  margin-top: 0.25rem;
  padding: 0.75rem 0 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.video-preview-settings__slider {
  margin: 0.75rem 0 0;
  min-width: 0;
}

.video-preview-settings__delays {
  margin-bottom: 0;
}

.video-preview-settings__delays + .v-alert {
  margin-top: 12px;
}

.video-preview-settings__slider-control {
  width: 100%;
}
</style>
