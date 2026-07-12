<template>
  <div class="d-flex flex-column text-center">
    <v-btn
      color="error"
      rounded
      @click="dialogDelete = true"
    >
      <v-icon icon="mdi-delete" start/>
      {{ button }}
    </v-btn>

    <div class="mt-2 text-body-2 text-medium-emphasis">
      <v-icon icon="mdi-harddisk" class="mr-1"/>
      <span v-if="sizeLoading">{{ t('common.loading') }}</span>
      <span v-else>{{ formattedFolderSize }}</span>
    </div>

    <DialogDeleteConfirm
      v-if="dialogDelete"
      :dialog="dialogDelete"
      :text="confirmText"
      @close="dialogDelete = false"
      @delete="clearData"
    />
  </div>
</template>

<script setup lang="ts">
import {ref, computed} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'
import {getReadableFileSize} from '@/services/formatUtils'
import type {GeneratedMediaFolderKey} from '@shared/generatedMediaFolders'

const props = defineProps({
  imageType: {
    type: String as () => GeneratedMediaFolderKey,
    required: true,
  },
  button: {
    type: String,
    required: true,
  },
  folderSize: {
    type: Number,
    default: undefined,
  },
  sizeLoading: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits<{
  cleared: []
}>()

const dialogsStore = useDialogsStore()
const {t} = useI18n()

const dialogDelete = ref(false)

const confirmText = computed(() => t('settings_labels.database.clear_generated_images_confirm'))

const formattedFolderSize = computed(() => {
  if (props.folderSize == null) {
    return t('settings_labels.database.folder_size_unknown')
  }

  return getReadableFileSize(props.folderSize)
})

const clearData = async () => {
  dialogDelete.value = false
  dialogsStore.process.show = true

  try {
    await typedApi.clearGeneratedData({
      imageType: props.imageType,
    })
    emit('cleared')
  } catch (error) {
    console.error('Failed to clear generated images:', error)
  } finally {
    dialogsStore.process.show = false
  }
}
</script>
