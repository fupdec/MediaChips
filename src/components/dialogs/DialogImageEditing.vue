<template>
  <v-dialog
    activator="parent"
    v-model="dialog"
    scrollable
    width="800"
    :fullscreen="xs"
    :attach="false"
  >
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn
        v-bind="activatorProps"
        size="small"
        variant="elevated"
        class="pa-2 ma-2"
        prepend-icon="mdi-image-edit-outline"
        :text="t('image.edit_image')"
        color="primary"
      ></v-btn>
    </template>
    <template v-slot:default="{ isActive }">
      <v-card>
        <DialogHeader
          @close="isActive.value = false"
          :header="t('image.editing_image')"
          :buttons="buttons"
          closable
        />

        <v-card-text class="d-flex flex-column pa-4">
          <FilePond
            v-if="image"
            @addfile="handleFile"
            @error="handleFileError"
            :allow-multiple="false"
            :files="uploadedImage"
            accepted-file-types="image/*"
            :label-idle="t('image.drop_or_click_upload')"
            ref="pond"
          />

          <div class="cropper-block">
            <AdvancedCropper
              v-if="src"
              @change="updateSize"
              :src="src"
              :stencil-props="options"
              :auto-zoom="true"
              ref="cropper"
              class="cropper"
            />
            <div v-if="width && height" class="cropper-size">
              <v-icon
                v-if="width < minWidth || height < minHeight"
                color="error"
                class="mr-1"
                size="small"
              >
                mdi-alert
              </v-icon>
              <v-icon v-else color="success" class="mr-1" size="small">
                mdi-check
              </v-icon>
              {{ width }} x {{ height }}
            </div>
          </div>
        </v-card-text>
      </v-card>

      <DialogDeleteConfirm
        v-if="dialogImageDeleting"
        :dialog="dialogImageDeleting"
        @delete="deleteFile"
        @close="dialogImageDeleting = false"
        :text="textDialogDelete"
      />
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useNotificationsStore} from '@/stores/notifications'
import {createImage, deleteLocalFile} from '@/services/fileService'
import {extractColorFromCanvas, isMainTagImagePath} from '@/utils/colorFromImage'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogDeleteConfirm from '@/components/dialogs/DialogDeleteConfirm.vue'

interface FilePondInstance {
  getFiles: () => Array<{ getFileEncodeDataURL?: () => string }>
}

interface CropperInstance {
  getResult: () => { canvas?: HTMLCanvasElement } | null
}


// FilePond импорт
import vueFilePond from 'vue-filepond'
import 'filepond/dist/filepond.min.css'
import FilePondPluginFileEncode from 'filepond-plugin-file-encode'
import FilePondPluginFileValidateType from 'filepond-plugin-file-validate-type'

// Cropper импорт
import {Cropper as AdvancedCropper} from 'vue-advanced-cropper'
import 'vue-advanced-cropper/dist/style.css'

const FilePond = vueFilePond(
  FilePondPluginFileEncode,
  FilePondPluginFileValidateType
)

// Props
const props = defineProps({
  image: {
    type: String,
    default: ''
  },
  options: {
    type: Object,
    default: () => ({})
  },
  imagePath: {
    type: String,
    default: ''
  },
  minWidth: {
    type: Number,
    default: 100
  },
  minHeight: {
    type: Number,
    default: 100
  }
})

// Emits
export interface ImageEditedPayload {
  extractedColor?: string
}

const emit = defineEmits<{
  close: []
  edited: [payload?: ImageEditedPayload]
}>()

// Stores
const notificationsStore = useNotificationsStore()
const {xs} = useDisplay()
const {t} = useI18n()

// Refs
const pond = ref<FilePondInstance | null>(null)
const cropper = ref<CropperInstance | null>(null)
const dialogImageDeleting = ref(false)
const dialog = ref(false)

// Cropper data
const src = ref<string | null>(null)
const width = ref<number | null>(null)
const height = ref<number | null>(null)

// FilePond data
const uploadedImageError = ref<unknown>(null)
const uploadedImage = ref<unknown[]>([])

// Buttons
const buttons = computed(() => [
  {
    icon: 'delete',
    text: t('common.delete'),
    color: 'error',
    variant: 'flat',
    action: () => {
      dialogImageDeleting.value = true
    },
  },
  {
    icon: 'content-save',
    text: t('common.save'),
    color: 'success',
    variant: 'flat',
    action: crop,
  },
])

// Computed
const textDialogDelete = computed(() => {
  return t('image.delete_confirm')
})

// Methods
// FilePond methods
const handleFileError = (error: unknown) => {
  uploadedImageError.value = error
  console.error('File upload error:', error)

  notificationsStore.setNotification({
    type: 'error',
    title: t('image.upload_error'),
    text: t('image.upload_failed')
  })
}

const handleFile = () => {
  if (uploadedImageError.value !== null) {
    uploadedImageError.value = null
    return
  }

  if (pond.value && pond.value.getFiles().length > 0) {
    const file = pond.value.getFiles()[0]
    if (file && file.getFileEncodeDataURL) {
      src.value = file.getFileEncodeDataURL()
    }
  }
}

const deleteFile = async () => {
  try {
    // Delete local file
    await deleteLocalFile(props.imagePath)

    // Reset component
    src.value = ''
    dialogImageDeleting.value = false

    // Close dialog and emit event
    closeDialog()
    emit('edited')

    notificationsStore.setNotification({
      type: 'success',
      text: t('image.deleted')
    })

  } catch (error) {
    console.error('Error deleting file:', error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('image.delete_failed')
    })
  }
}

const crop = async () => {
  if (!cropper.value) {
    notificationsStore.setNotification({
      type: 'error',
      text: t('image.cropper_not_initialized')
    })
    return
  }

  try {
    const cropResult = cropper.value.getResult()
    if (!cropResult || !cropResult.canvas) {
      throw new Error(t('image.no_canvas_result'))
    }

    const canvas = cropResult.canvas
    const imgBuffer = canvas.toDataURL().replace(/^data:image\/\w+;base64,/, '')

    const sizes = {
      width: props.minWidth,
      height: props.minHeight
    }

    // Create image from buffer
    const createResult = await createImage(imgBuffer, props.imagePath, sizes);

    if (createResult.status === 202 || !createResult.status) {
      notificationsStore.setNotification({
        type: 'error',
        title: t('image.generation'),
        text: t('image.cannot_crop')
      })
      return
    }

    notificationsStore.setNotification({
      type: 'success',
      text: t('image.cropped_saved')
    })

    const payload: ImageEditedPayload = {}
    if (isMainTagImagePath(props.imagePath)) {
      payload.extractedColor = extractColorFromCanvas(canvas)
    }

    closeDialog()
    emit('edited', payload)

  } catch (error) {
    console.error('Error cropping image:', error)
    const message = error instanceof Error ? error.message : String(error)
    notificationsStore.setNotification({
      type: 'error',
      text: t('image.crop_failed', {message})
    })
  }
}

const updateSize = ({coordinates}: { coordinates?: { width: number; height: number } }) => {
  if (coordinates) {
    width.value = Math.round(coordinates.width)
    height.value = Math.round(coordinates.height)
  }
}

const closeDialog = () => {
  emit('close')
  dialog.value = false
}

// Lifecycle
onMounted(() => {
  src.value = props.image || null
})

// Watchers
watch(() => props.image, (newVal) => {
  src.value = newVal || null
})
</script>

<style scoped>
.cropper-block {
  margin-top: 20px;
  position: relative;
}

.cropper {
  width: 100%;
  height: 400px;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.cropper-size {
  position: absolute;
  bottom: 10px;
  right: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  display: flex;
  align-items: center;
}
</style>