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

    <div class="mt-2 text-body-2">
      <v-icon icon="mdi-harddisk" class="mr-1"/>
      {{ folderSize }}
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
import {ref, computed, onMounted} from 'vue'
import {useI18n} from 'vue-i18n'
import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'

/* props */
const props = defineProps({
  imageType: {
    type: String,
    required: true,
  },
  button: {
    type: String,
    required: true,
  },
})

/* store */
const dialogsStore = useDialogsStore()
const {t} = useI18n()

/* state */
const dialogDelete = ref(false)
const folderSize = ref('0 MB')

const confirmText = computed(() => t('settings_labels.database.clear_generated_images_confirm'))

/* methods */

const getFolderSize = async () => {
  const {data} = await typedApi.getFolderSize({folder: props.imageType})

  const sizeMb = data.size / 1024 / 1024
  folderSize.value = `${sizeMb.toFixed(2)} MB`
}

const clearData = async () => {
  dialogsStore.process.show = true
  dialogsStore.process.show = false

  await typedApi.clearGeneratedData({
    imageType: props.imageType,
  })

  await getFolderSize()
  dialogsStore.process.show = false
}

onMounted(getFolderSize)
</script>
