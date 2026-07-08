<template>
  <div class="mx-4">
    <settings-category-divider
      :title="$t('settings_labels.database.clear_generated_images')"
      icon="delete-sweep"
    ></settings-category-divider>

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-6"
    >
      <span class="text-caption">
        {{ $t('settings_labels.database.clear_generated_images_hint') }}
      </span>
    </v-alert>

    <div class="d-flex flex-wrap ga-2 mb-4">
      <SettingsClearGeneratedImagesButton
        :button="$t('settings_labels.database.timelines')"
        image-type="timelines"
      />

      <SettingsClearGeneratedImagesButton
        :button="$t('settings_labels.database.grids')"
        image-type="grids"
      />

      <SettingsClearGeneratedImagesButton
        :button="$t('settings_labels.database.marks')"
        image-type="marks"
      />

      <SettingsClearGeneratedImagesButton
        :button="$t('settings_labels.database.image_thumbnails')"
        image-type="image-thumbs"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import SettingsClearGeneratedImagesButton from
    '@/components/settings/database/SettingsClearGeneratedImagesButton.vue'
import SettingsCategoryDivider from "@/components/ui/SettingsCategoryDivider.vue";
</script>
