<template>
  <v-dialog
    :activator="detached ? undefined : 'parent'"
    v-model="dialog"
    scrollable
    width="880"
    :fullscreen="xs"
  >
    <template v-slot:activator="{ props: activatorProps }">
      <v-btn
        v-if="compact"
        v-bind="activatorProps"
        :class="activatorClass"
        :size="size"
        :variant="variant"
        color="primary"
        icon
        rounded="lg"
        :aria-label="t('image.edit_image')"
        v-tooltip:[tooltipLocation]="t('image.edit_image')"
      >
        <v-icon :size="iconSize">mdi-image-edit-outline</v-icon>
      </v-btn>
      <v-btn
        v-else
        v-bind="activatorProps"
        size="small"
        variant="flat"
        color="primary"
        rounded="xl"
        :class="activatorClass || 'pa-2 ma-2'"
        prepend-icon="mdi-image-edit-outline"
        :text="t('image.edit_image')"
      />
    </template>
    <template v-slot:default="{ isActive }">
      <v-card rounded="xl">
        <DialogHeader
          icon="image-edit-outline"
          @close="isActive.value = false"
          :header="t('image.editing_image')"
          :buttons="buttons"
          closable
        />

        <v-card-text class="d-flex flex-column pa-4">
          <FilePond
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
              v-if="src && dialog"
              :key="src"
              @change="updateSize"
              @ready="cropperReady = true"
              :src="src"
              :stencil-props="options"
              :auto-zoom="true"
              ref="cropper"
              class="cropper"
            />
            <div v-else-if="dialog" class="cropper-empty text-medium-emphasis text-center pa-8">
              {{ t('image.drop_or_click_upload') }}
            </div>
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

          <div
            v-if="src"
            class="cropper-tools"
            role="toolbar"
            :aria-label="t('image.cropper.tools')"
          >
            <div v-for="(group, groupIndex) in toolGroups" :key="groupIndex" class="cropper-tools__group">
              <v-btn
                v-for="tool in group"
                :key="tool.id"
                icon
                size="small"
                variant="text"
                density="comfortable"
                :disabled="!cropperReady"
                :aria-label="tool.label"
                v-tooltip:top="tool.label"
                @click="tool.action"
              >
                <v-icon size="20">{{ tool.icon }}</v-icon>
              </v-btn>
            </div>
          </div>
        </v-card-text>
      </v-card>

      <DialogConfirm
        v-if="dialogImageDeleting"
        variant="delete"
        :dialog="dialogImageDeleting"
        @delete="deleteFile"
        @close="dialogImageDeleting = false"
        :text="textDialogDelete"
      />
    </template>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount, watch, nextTick, type PropType} from 'vue'
import {useDisplay} from 'vuetify'
import {useI18n} from 'vue-i18n'
import {useNotificationsStore} from '@/stores/notifications'
import {typedApi} from '@/services/typedApi'
import {createImage, deleteLocalFile} from '@/services/fileService'
import {extractColorFromCanvas, isMainTagImagePath, parseLocalFilePathFromApiUrl} from '@/utils/colorFromImage'
import {revokeImageObjectUrl} from '@/utils/imageSource'
import DialogHeader from '@/components/elements/DialogHeader.vue'
import DialogConfirm from '@/components/dialogs/DialogConfirm.vue'

interface FilePondInstance {
  getFiles: () => Array<{ getFileEncodeDataURL?: () => string }>
}

interface CropperRect {
  width: number
  height: number
  left: number
  top: number
}

interface CropperTransformContext {
  coordinates: CropperRect
  imageSize: { width: number; height: number }
}

type CropperTransform = (context: CropperTransformContext) => Partial<CropperRect>

interface CropperInstance {
  getResult: () => { canvas?: HTMLCanvasElement } | null
  setCoordinates: (transform: CropperTransform | CropperTransform[]) => void
  zoom: (factor: number) => void
  rotate: (angle: number) => void
  flip: (horizontal: boolean, vertical: boolean) => void
  reset: () => Promise<void> | void
}

interface CropperTool {
  id: string
  icon: string
  label: string
  action: () => void
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
  },
  detached: {
    type: Boolean,
    default: false,
  },
  activatorClass: {
    type: String,
    default: '',
  },
  compact: {
    type: Boolean,
    default: false,
  },
  variant: {
    type: String as PropType<'flat' | 'text' | 'elevated' | 'outlined' | 'plain' | 'tonal'>,
    default: 'tonal',
  },
  size: {
    type: String,
    default: 'small',
  },
  iconSize: {
    type: Number,
    default: 18,
  },
  tooltipLocation: {
    type: String as PropType<'top' | 'bottom' | 'start' | 'end'>,
    default: 'top',
  },
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
const cropperReady = ref(false)

// Cropper data
const src = ref<string | null>(null)
const cropperObjectUrl = ref<string | null>(null)
const width = ref<number | null>(null)
const height = ref<number | null>(null)

const revokeCropperObjectUrl = () => {
  revokeImageObjectUrl(cropperObjectUrl.value)
  cropperObjectUrl.value = null
}

const resolveCropperSrc = async (image: string): Promise<string | null> => {
  if (!image) return null
  if (image.startsWith('data:') || image.startsWith('blob:')) return image

  const filePath = props.imagePath || parseLocalFilePathFromApiUrl(image)
  if (!filePath) return image

  try {
    const response = await typedApi.getFileBlob({url: filePath})
    revokeCropperObjectUrl()
    cropperObjectUrl.value = URL.createObjectURL(response.data)
    return cropperObjectUrl.value
  } catch (error) {
    console.error('Failed to load cropper image:', error)
    return image
  }
}

const syncCropperSrc = async () => {
  src.value = await resolveCropperSrc(props.image)
}

// FilePond data
const uploadedImageError = ref<unknown>(null)
const uploadedImage = ref<unknown[]>([])

// Buttons
const buttons = computed(() => {
  const actions = []

  if (props.image) {
    actions.push({
      icon: 'delete',
      text: t('common.delete'),
      color: 'error',
      variant: 'flat',
      action: () => {
        dialogImageDeleting.value = true
      },
    })
  }

  actions.push({
    icon: 'content-save',
    text: t('common.save'),
    color: 'success',
    variant: 'flat',
    action: crop,
  })

  return actions
})

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
      revokeCropperObjectUrl()
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

// Crop area tools. The cropper keeps the stencil's aspect ratio and stays
// inside the image on its own, so the transforms only describe the wanted size/position.
const centerTransform: CropperTransform = ({coordinates, imageSize}) => ({
  left: (imageSize.width - coordinates.width) / 2,
  top: (imageSize.height - coordinates.height) / 2,
})

const applyTransforms = (...transforms: CropperTransform[]) => {
  cropper.value?.setCoordinates(transforms)
}

const maximizeArea = () => applyTransforms(
  ({imageSize}) => ({width: imageSize.width, height: imageSize.height}),
  centerTransform,
)

const fitWidth = () => applyTransforms(
  ({coordinates, imageSize}) => ({
    width: imageSize.width,
    height: imageSize.width * coordinates.height / coordinates.width,
  }),
  centerTransform,
)

const fitHeight = () => applyTransforms(
  ({coordinates, imageSize}) => ({
    width: imageSize.height * coordinates.width / coordinates.height,
    height: imageSize.height,
  }),
  centerTransform,
)

const centerArea = () => applyTransforms(centerTransform)

const resetCropper = () => {
  void cropper.value?.reset()
}

const toolGroups = computed<CropperTool[][]>(() => [
  [
    {id: 'maximize', icon: 'mdi-arrow-expand-all', label: t('image.cropper.maximize'), action: maximizeArea},
    {id: 'fit-width', icon: 'mdi-arrow-expand-horizontal', label: t('image.cropper.fit_width'), action: fitWidth},
    {id: 'fit-height', icon: 'mdi-arrow-expand-vertical', label: t('image.cropper.fit_height'), action: fitHeight},
    {id: 'center', icon: 'mdi-image-filter-center-focus', label: t('image.cropper.center'), action: centerArea},
  ],
  [
    {id: 'zoom-in', icon: 'mdi-magnify-plus-outline', label: t('image.cropper.zoom_in'), action: () => cropper.value?.zoom(1.25)},
    {id: 'zoom-out', icon: 'mdi-magnify-minus-outline', label: t('image.cropper.zoom_out'), action: () => cropper.value?.zoom(0.8)},
  ],
  [
    {id: 'rotate-left', icon: 'mdi-rotate-left', label: t('image.cropper.rotate_left'), action: () => cropper.value?.rotate(-90)},
    {id: 'rotate-right', icon: 'mdi-rotate-right', label: t('image.cropper.rotate_right'), action: () => cropper.value?.rotate(90)},
    {id: 'flip-horizontal', icon: 'mdi-flip-horizontal', label: t('image.cropper.flip_horizontal'), action: () => cropper.value?.flip(true, false)},
    {id: 'flip-vertical', icon: 'mdi-flip-vertical', label: t('image.cropper.flip_vertical'), action: () => cropper.value?.flip(false, true)},
  ],
  [
    {id: 'reset', icon: 'mdi-restore', label: t('image.cropper.reset'), action: resetCropper},
  ],
])

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
  void syncCropperSrc()
})

onBeforeUnmount(() => {
  revokeCropperObjectUrl()
})

// Watchers
watch(() => props.image, () => {
  if (dialog.value) {
    void syncCropperSrc()
  }
})

watch(src, () => {
  cropperReady.value = false
})

watch(dialog, async (isOpen) => {
  if (!isOpen) {
    cropperReady.value = false
    revokeCropperObjectUrl()
    return
  }

  await syncCropperSrc()
  await nextTick()
})
</script>

<style scoped>
.cropper-block {
  margin-top: 20px;
  position: relative;
}

.cropper {
  width: 100%;
  height: clamp(260px, 52vh, 560px);
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.cropper-tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 8px 12px;
  margin-top: 12px;
}

.cropper-tools__group {
  display: flex;
  align-items: center;
  gap: 2px;
}

.cropper-tools__group + .cropper-tools__group {
  padding-inline-start: 12px;
  border-inline-start: 1px solid rgba(var(--v-theme-on-surface), 0.12);
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