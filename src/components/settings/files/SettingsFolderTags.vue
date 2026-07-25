<template>
  <div class="mx-4">
    <SettingsCategoryDivider
      :title="t('settings_labels.tools.folder_tags')"
      icon="folder-multiple-outline"
    />

    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      rounded="xl"
      class="mb-4"
    >
      <span class="text-caption">
        {{ t('settings_labels.tools.folder_tags_hint') }}
      </span>
    </v-alert>

    <div class="d-flex flex-wrap align-center ga-3 mb-2">
      <v-btn
        color="primary"
        rounded
        variant="flat"
        prepend-icon="mdi-folder-multiple-outline"
        @click="managerOpen = true"
      >
        {{ t('settings_labels.tools.folder_tags_manage_btn') }}
      </v-btn>
      <span
        v-if="!loading"
        class="text-caption text-medium-emphasis"
      >
        {{ t('settings_labels.tools.folder_tags_count', {count: folderCount}) }}
      </span>
    </div>

    <DialogFolderTagsManager v-model="managerOpen" />
  </div>
</template>

<script setup lang="ts">
import {onMounted, ref, watch} from 'vue'
import {useI18n} from 'vue-i18n'
import SettingsCategoryDivider from '@/components/ui/SettingsCategoryDivider.vue'
import DialogFolderTagsManager from '@/components/dialogs/DialogFolderTagsManager.vue'
import {typedApi} from '@/services/typedApi'

const {t} = useI18n()
const managerOpen = ref(false)
const loading = ref(false)
const folderCount = ref(0)

async function refreshCount() {
  loading.value = true
  try {
    const res = await typedApi.listFolderTags()
    folderCount.value = (res.data || []).length
  } catch (error) {
    console.error(error)
    folderCount.value = 0
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  void refreshCount()
})

watch(managerOpen, (open, wasOpen) => {
  if (!open && wasOpen) void refreshCount()
})
</script>
