<template>
  <SettingsHealthTask id="settings-clear-generated-images" status="error" compact>
    <div>
      <SettingsHealthSectionHeader
        :title="t('settings_labels.database.clear_generated_images')"
        icon="delete-sweep"
        :hint="t('settings_labels.database.clear_generated_images_hint')"
        status="error"
        :status-label="t('settings_labels.database.health_guide_optional')"
        compact
      />

      <v-alert
        v-if="sizesError"
        type="error"
        variant="tonal"
        density="compact"
        rounded="xl"
        class="mb-3"
      >
        <span class="text-caption">{{ sizesError }}</span>
      </v-alert>

      <div class="clear-gen__summary mb-3">
        <div class="clear-gen__total text-caption text-medium-emphasis">
          <v-icon icon="mdi-harddisk" size="14" class="mr-1"/>
          <template v-if="sizesLoading">{{ t('common.loading') }}</template>
          <template v-else-if="totalSize != null">
            {{ t('settings_labels.database.clear_generated_images_total', {
              size: getReadableFileSize(totalSize),
            }) }}
          </template>
          <template v-else>
            {{ t('settings_labels.database.folder_size_unknown') }}
          </template>
        </div>
        <v-btn
          color="secondary"
          rounded
          variant="tonal"
          size="small"
          class="pr-3"
          :loading="sizesLoading"
          :disabled="sizesLoading"
          @click="loadFolderSizes"
        >
          <v-icon icon="mdi-refresh" start size="18"/>
          {{ t('settings_labels.database.calculate_sizes') }}
        </v-btn>
      </div>

      <div class="clear-gen__list">
        <div
          v-for="folder in folders"
          :key="folder.id"
          class="clear-gen__row"
        >
          <div class="clear-gen__icon" aria-hidden="true">
            <v-icon size="18">{{ folder.icon }}</v-icon>
          </div>

          <div class="clear-gen__meta">
            <div class="clear-gen__title-row">
              <div class="clear-gen__title">{{ t(folder.labelKey) }}</div>
              <div class="clear-gen__size text-caption text-medium-emphasis">
                <template v-if="sizesLoading">{{ t('common.loading') }}</template>
                <template v-else-if="folderSizes[folder.id] == null">
                  {{ t('settings_labels.database.folder_size_unknown') }}
                </template>
                <template v-else>
                  {{ getReadableFileSize(folderSizes[folder.id]!) }}
                </template>
              </div>
            </div>
            <div
              v-if="shareOf(folder.id) != null"
              class="clear-gen__bar"
              aria-hidden="true"
            >
              <div
                class="clear-gen__bar-fill"
                :style="{ width: `${shareOf(folder.id)}%` }"
              />
            </div>
          </div>

          <v-btn
            color="error"
            rounded
            variant="tonal"
            size="small"
            class="pr-3 clear-gen__action"
            :disabled="sizesLoading"
            @click="confirmClear(folder)"
          >
            <v-icon icon="mdi-delete-outline" start size="18"/>
            {{ t('common.delete') }}
          </v-btn>
        </div>
      </div>

      <DialogConfirm
        v-if="pendingFolder"
        variant="delete"
        :dialog="Boolean(pendingFolder)"
        :text="t('settings_labels.database.clear_generated_images_confirm')"
        @close="pendingFolder = null"
        @delete="clearPending"
      />
    </div>
  </SettingsHealthTask>
</template>

<script setup lang="ts">
import {computed, onMounted, ref} from 'vue'
import {useI18n} from 'vue-i18n'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'
import SettingsHealthSectionHeader from '@/components/settings/database/SettingsHealthSectionHeader.vue'
import SettingsHealthTask from '@/components/settings/database/SettingsHealthTask.vue'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {getReadableFileSize} from '@/services/formatUtils'
import {
  GENERATED_MEDIA_FOLDER_KEYS,
  type GeneratedMediaFolderKey,
} from '@shared/generatedMediaFolders'

interface GeneratedFolderConfig {
  id: GeneratedMediaFolderKey
  labelKey: string
  icon: string
}

const {t} = useI18n()
const dialogsStore = useDialogsStore()

const folders: GeneratedFolderConfig[] = [
  {
    id: 'thumbs',
    labelKey: 'settings_labels.database.video_thumbnails',
    icon: 'mdi-movie-open-outline',
  },
  {
    id: 'grids',
    labelKey: 'settings_labels.database.grids',
    icon: 'mdi-view-grid-outline',
  },
  {
    id: 'marks',
    labelKey: 'settings_labels.database.marks',
    icon: 'mdi-bookmark-outline',
  },
  {
    id: 'faces',
    labelKey: 'settings_labels.database.faces',
    icon: 'mdi-face-recognition',
  },
  {
    id: 'image-thumbs',
    labelKey: 'settings_labels.database.image_thumbnails',
    icon: 'mdi-image-outline',
  },
]

const folderSizes = ref<Partial<Record<GeneratedMediaFolderKey, number>>>({})
const sizesLoading = ref(false)
const sizesError = ref('')
const pendingFolder = ref<GeneratedFolderConfig | null>(null)

const totalSize = computed(() => {
  const values = Object.values(folderSizes.value).filter((value): value is number => typeof value === 'number')
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0)
})

function shareOf(id: GeneratedMediaFolderKey): number | null {
  const total = totalSize.value
  const size = folderSizes.value[id]
  if (total == null || total <= 0 || size == null) return null
  return Math.max(0, Math.min(100, (size / total) * 100))
}

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

function confirmClear(folder: GeneratedFolderConfig) {
  pendingFolder.value = folder
}

async function clearPending() {
  const folder = pendingFolder.value
  pendingFolder.value = null
  if (!folder) return

  dialogsStore.process.show = true
  try {
    await typedApi.clearGeneratedData({imageType: folder.id})
    await loadFolderSizes()
  } catch (error) {
    console.error('Failed to clear generated images:', error)
  } finally {
    dialogsStore.process.show = false
  }
}

onMounted(loadFolderSizes)
</script>

<style scoped lang="scss">
.clear-gen__summary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.clear-gen__total {
  display: inline-flex;
  align-items: center;
}

.clear-gen__list {
  display: grid;
  gap: 8px;
}

.clear-gen__row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  background: rgba(var(--v-theme-surface), 0.55);
}

.clear-gen__icon {
  flex: 0 0 34px;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(var(--v-theme-error));
  background: rgba(var(--v-theme-error), 0.1);
}

.clear-gen__meta {
  flex: 1 1 auto;
  min-width: 0;
}

.clear-gen__title-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.clear-gen__title {
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.3;
}

.clear-gen__size {
  flex: 0 0 auto;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}

.clear-gen__bar {
  margin-top: 8px;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(var(--v-theme-on-surface), 0.08);
}

.clear-gen__bar-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(
    90deg,
    rgba(var(--v-theme-error), 0.55),
    rgba(var(--v-theme-error), 0.9)
  );
  transition: width 0.35s ease;
}

.clear-gen__action {
  flex: 0 0 auto;
}

@media (max-width: 600px) {
  .clear-gen__row {
    flex-wrap: wrap;
  }

  .clear-gen__action {
    margin-left: auto;
  }
}
</style>
