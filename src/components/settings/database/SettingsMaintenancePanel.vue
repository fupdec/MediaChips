<template>
  <div id="settings-maintenance">
    <SettingsBackfillTask :config="FINGERPRINT_BACKFILL"/>
    <v-divider class="mx-4 mb-2"/>
    <SettingsBackfillTask :config="VIDEO_CODEC_BACKFILL"/>

    <v-divider class="mx-4 mb-2"/>
    <SettingsFindMissingMedia/>

    <v-divider class="mx-4 mb-2"/>
    <SettingsGenerateVideoImages/>

    <v-divider class="mx-4 mb-2"/>
    <SettingsDetectFaces/>

    <v-divider class="mx-4 mb-2"/>
    <SettingsGenerateImageThumbs/>

    <v-divider class="mx-4 mb-2"/>
    <SettingsClearGeneratedImages/>
  </div>
</template>

<script setup lang="ts">
import {defineAsyncComponent} from 'vue'
import SettingsBackfillTask from '@/components/settings/database/SettingsBackfillTask.vue'
import {
  FINGERPRINT_BACKFILL,
  VIDEO_CODEC_BACKFILL,
} from '@/composable/useSettingsBackfillStream'

const SettingsFindMissingMedia = defineAsyncComponent(() =>
  import('@/components/settings/database/SettingsFindMissingMedia.vue'),
)
const SettingsGenerateVideoImages = defineAsyncComponent(() =>
  import('@/components/settings/database/SettingsGenerateVideoImages.vue'),
)
const SettingsDetectFaces = defineAsyncComponent(() =>
  import('@/components/settings/database/SettingsDetectFaces.vue'),
)
const SettingsGenerateImageThumbs = defineAsyncComponent(() =>
  import('@/components/settings/database/SettingsGenerateImageThumbs.vue'),
)
const SettingsClearGeneratedImages = defineAsyncComponent(() =>
  import('@/components/settings/database/SettingsClearGeneratedImages.vue'),
)
</script>
