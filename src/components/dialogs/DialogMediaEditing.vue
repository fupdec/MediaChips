<template>
  <v-dialog
    v-model="dialogsStore.mediaEditing.show"
    :fullscreen="xs"
    :width="xl ? 1400 : 1000"
    scrollable
  >
    <v-card>
      <DialogHeader
        @close="dialogsStore.mediaEditing.show = false"
        :header="t('common.editing')"
        :subheader="fileName"
        :subheader-copy-text="fileName"
        :buttons="buttons"
        icon="pencil"
        closable
      />

      <v-card-text class="pa-2 pa-sm-4">
        <EditPinnedMetaValues
          v-if="media"
          :key="media.id"
          layout="hero"
          @close="dialogsStore.mediaEditing.show = false"
          :media="media"
          ref="editingComponent"
        >
          <template #media>
            <EditDialogMediaPanel
              v-if="isImageMedia"
              mode="media"
              :image-src="thumb ?? undefined"
              :image-path="imgPath ?? undefined"
              :cropper-options="cropperOps"
              :min-width="500"
              @edited="onImageEdited"
            />
            <v-sheet
              v-else-if="isAudioMedia"
              color="grey-darken-3"
              rounded="lg"
              class="d-flex align-center justify-center"
              min-height="240"
            >
              <v-icon size="72" color="grey">mdi-music</v-icon>
            </v-sheet>
            <v-sheet
              v-else-if="isTextMedia"
              color="grey-darken-3"
              rounded="lg"
              class="d-flex align-center justify-center"
              min-height="240"
            >
              <v-icon size="72" color="grey">mdi-file-document-outline</v-icon>
            </v-sheet>
            <EditDialogMediaPanel
              v-else-if="isVideoMedia"
              mode="media"
              is-video-media
              :media="media"
              :is-file-exists="isFileExists"
              :image-src="thumb ?? undefined"
              :image-path="imgPath ?? undefined"
              :cropper-options="cropperOps"
              :min-width="500"
              @edited="onImageEdited"
            />
            <EditDialogMediaPanel
              v-else
              mode="media"
              :image-src="thumb ?? undefined"
              :image-path="imgPath ?? undefined"
              :cropper-options="cropperOps"
              :min-width="500"
              @edited="onImageEdited"
            />
          </template>
        </EditPinnedMetaValues>
      </v-card-text>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from 'vue'
import type {MediaItem} from '@/types/stores'
import type {MediaType} from '@/types/media'
import {useI18n} from 'vue-i18n'
import {useDisplay} from 'vuetify'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {typedApi} from '@/services/typedApi'
import {loadImageDisplayUrl} from '@/utils/imageSource'
import {buildLocalFileUrl, checkFileExists as checkPathExists} from '@/services/fileService'
import {isThumbUnavailable, resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import EditPinnedMetaValues from "@/components/items/EditPinnedMetaValues.vue"
import EditDialogMediaPanel from "@/components/items/EditDialogMediaPanel.vue"
import {useEventBus} from "@/utils/eventBus"
import path from 'path-browserify'
import {
  getCurrentMediaType,
  getMediaDeleteAssetFolder,
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'

const DialogHeader = defineAsyncComponent(() => import("@/components/elements/DialogHeader.vue"))

interface DialogHeaderButton {
  icon?: string
  text?: string
  color?: string
  outlined?: boolean
  action?: () => void | Promise<void>
}

interface EditComponentInstance {
  save?: () => Promise<boolean>
}

const props = defineProps<{
  dialog?: boolean
  media?: MediaItem | null
  mediaType?: MediaType | null
}>()

const {xs, xl} = useDisplay()
const eventBus = useEventBus()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const {t} = useI18n()
const thumb = ref<string | null>(null)
const imgPath = ref<string | null>(null)
const isFileExists = ref(true)
const buttons = ref<DialogHeaderButton[]>([])
const editingComponent = ref<EditComponentInstance | null>(null)
const cropperOps = ref({
  aspectRatio: 16 / 9,
})

const media = computed(() => props.media ?? dialogsStore.mediaEditing.media)

const fileName = computed(() => {
  const filePath = media.value?.path || ''
  return filePath.split('/').pop() || ''
})

const currentMediaType = computed(() =>
  getCurrentMediaType(
    appStore.mediaTypes,
    media.value?.mediaTypeId || itemsStore.environment?.media_type_id
  )
)

const isAudioMedia = computed(() => isAudioMediaType(currentMediaType.value))
const isImageMedia = computed(() => isImageMediaType(currentMediaType.value))
const isTextMedia = computed(() => isTextMediaType(currentMediaType.value))
const isVideoMedia = computed(() => isVideoMediaType(currentMediaType.value))

function initButtons() {
  buttons.value = [{
    icon: "delete",
    text: t('common.delete'),
    color: "error",
    outlined: false,
    action: deleteMedia,
  }, {
    icon: "content-save",
    text: t('common.save'),
    color: "success",
    outlined: false,
    action: save,
  }]
}

async function getImage() {
  const currentMedia = media.value
  if (!currentMedia?.id) return

  const mediaType = getCurrentMediaType(
    appStore.mediaTypes,
    currentMedia.mediaTypeId || itemsStore.environment?.media_type_id
  )

  if (isImageMediaType(mediaType)) {
    imgPath.value = path.join(appStore.mediaPath, 'images/thumbs', `${currentMedia.id}.jpg`)
    thumb.value = await loadImageDisplayUrl(currentMedia, appStore.mediaPath, {cacheBust: true})

    if (thumb.value?.includes('unavailable.png') && currentMedia.path) {
      thumb.value = await loadImageDisplayUrl(currentMedia, appStore.mediaPath, {
        preferFull: true,
        cacheBust: true,
      })
    }

    const width = Number(currentMedia.width) || 1
    const height = Number(currentMedia.height) || 1
    cropperOps.value = {aspectRatio: width / height}
    return
  }

  if (isAudioMediaType(mediaType) || isTextMediaType(mediaType)) {
    imgPath.value = null
    thumb.value = null
    return
  }

  const mediaTypeFolder = getMediaDeleteAssetFolder(mediaType) || 'videos'
  imgPath.value = path.join(appStore.mediaPath, mediaTypeFolder, 'thumbs', `${currentMedia.id}.jpg`)

  if (isVideoMediaType(mediaType)) {
    invalidateVideoThumbCaches(currentMedia.id)
    thumb.value = buildLocalFileUrl(imgPath.value, false, true)
    cropperOps.value = {aspectRatio: 16 / 9}
    return
  }

  let thumbUrl = resolveMediaThumbDisplayUrl(appStore.mediaPath, mediaTypeFolder, currentMedia.id)
  thumb.value = thumbUrl
  cropperOps.value = {aspectRatio: 16 / 9}
}

async function onImageEdited() {
  await getImage()
  const mediaId = media.value?.id
  if (mediaId != null) {
    itemsStore.refreshThumb(mediaId, {regenerate: true})
  }
  eventBus.emit('getItemsFromDb', {
    ids: [mediaId],
    type: 'media'
  })
}

async function save() {
  if (!editingComponent.value?.save) {
    console.error('Component or method not available')
    return
  }

  const saved = await editingComponent.value.save()
  if (!saved) return

  const mediaId = media.value?.id
  if (mediaId != null) {
    eventBus.emit('getItemsFromDb', {
      ids: [mediaId],
      type: 'media',
    })
    itemsStore.refreshThumb(mediaId, {regenerate: true})
  }

  if (itemsStore.type === 'media') {
    eventBus.emit('getTags')
  }

  dialogsStore.mediaEditing.show = false
}

function deleteMedia() {
  const currentMedia = media.value
  if (!currentMedia || !dialogsStore?.confirm) return

  dialogsStore.confirm.show = true
  dialogsStore.confirm.checkBoxText = t('actions.also_delete_files')
  dialogsStore.confirm.text = t('media.delete_from_app_confirm')
  dialogsStore.confirm.action = async () => {
    const is_checked = dialogsStore.confirm.checkBox
    await typedApi.deleteMediaOne({
      type: getMediaDeleteAssetFolder(currentMediaType.value),
      id: currentMedia.id,
      with_file: is_checked,
      path: currentMedia.path,
    })

    eventBus.emit('removeEntitiesFromState', {
      detail: {
        ids: [currentMedia.id],
        type: 'media',
      }
    })

    close()
  }
}

function close() {
  dialogsStore.mediaEditing.show = false
}

onMounted(() => {
  initButtons()
  void getImage()
})

watch(() => media.value?.id, (mediaId, previousId) => {
  if (mediaId == null || mediaId === previousId) return
  void getImage()
})

watch(
  () => itemsStore.thumbRefreshKeys[Number(media.value?.id)],
  (version) => {
    if (version == null) return
    void getImage()
  },
)

watch(
  () => media.value?.path ?? null,
  (filePath) => {
    if (!filePath) {
      isFileExists.value = false
      return
    }

    void checkPathExists(filePath).then((exists) => {
      if (media.value?.path === filePath) {
        isFileExists.value = exists
      }
    })
  },
  {immediate: true},
)
</script>
