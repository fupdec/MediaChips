<template>
  <SettingsHealthTask id="settings-clear-generated-images" status="idle">
    <div class="pb-1">
      <SettingsHealthSectionHeader
        :title="t('settings_labels.database.clear_generated_images')"
        icon="delete-sweep"
        :hint="t('settings_labels.database.clear_generated_images_hint')"
        status="idle"
      />

      <div class="d-flex flex-wrap ga-2 mb-4">
        <v-btn
          color="secondary"
          rounded
          variant="outlined"
          class="pr-4"
          :loading="sizesLoading"
          :disabled="sizesLoading"
          @click="loadFolderSizes"
        >
          <v-icon icon="mdi-harddisk" start/>
          {{ t('settings_labels.database.calculate_sizes') }}
        </v-btn>
      </div>

      <v-alert
        v-if="sizesError"
        type="error"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-4"
      >
        <span class="text-caption">{{ sizesError }}</span>
      </v-alert>

      <div class="d-flex flex-wrap ga-2 mb-1">
        <SettingsClearGeneratedImagesButton
          v-for="folder in folders"
          :key="folder.id"
          :button="t(folder.labelKey)"
          :image-type="folder.id"
          :folder-size="folderSizes[folder.id]"
          :size-loading="sizesLoading"
          @cleared="loadFolderSizes"
        />
      </div>
    </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsClearGeneratedImagesButton from
  '@/components/settings/database/SettingsClearGeneratedImagesButton.vue'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import {typedApi} from '@/services/typedApi'
import {
  GENERATED_MEDIA_FOLDER_KEYS,
  type GeneratedMediaFolderKey,
} from '@shared/generatedMediaFolders'

interface GeneratedFolderConfig {
  id: GeneratedMediaFolderKey
  labelKey: string
}

const {t} = useI18n()

const folders: GeneratedFolderConfig[] = [
  {id: 'thumbs', labelKey: 'settings_labels.database.video_thumbnails'},
  {id: 'grids', labelKey: 'settings_labels.database.grids'},
  {id: 'marks', labelKey: 'settings_labels.database.marks'},
  {id: 'faces', labelKey: 'settings_labels.database.faces'},
  {id: 'image-thumbs', labelKey: 'settings_labels.database.image_thumbnails'},
]

const folderSizes = ref<Partial<Record<GeneratedMediaFolderKey, number>>>({})
const sizesLoading = ref(false)
const sizesError = ref('')

const loadFolderSizes = async () => {
  sizesLoading.value = true
  sizesError.value = ''

  try {
    const entries = await Promise.all(
      GENERATED_MEDIA_FOLDER_KEYS.map(async (folder) => {
        const {data} = await typedApi.getFolderSize({folder})
        return [folder, data.size] as const
      }),
    )

    folderSizes.value = Object.fromEntries(entries)
  } catch (error) {
    sizesError.value = error instanceof Error
      ? error.message
      : t('settings_labels.database.folder_size_load_failed')
    console.error('Failed to load generated image folder sizes:', error)
  } finally {
    sizesLoading.value = false
  }
}

onMounted(loadFolderSizes)
</script>
