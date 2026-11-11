<template>
  <EditDialogShell
    :show="dialogsStore.mediaEditing.show"
    :subheader="fileName"
    :buttons="buttons"
    :persistent="keepDialogOpen"
    v-model:unsaved-confirm="unsavedConfirm"
    @visibility-change="onDialogVisibilityChange"
    @request-close="requestClose"
    @discard="forceClose"
  >
        <DialogOriginalOperations v-if="media" v-model="originalsOpen" :media-ids="[media.id]" @changed="mediaCopies?.refresh()" />
        <EditPinnedMetaValues
          v-if="media"
          :key="media.id"
          layout="hero"
          v-model:hide-media-panel="mediaPanelHidden"
          @close="requestClose"
          @dirty-change="formDirty = $event"
          :media="media"
          ref="editingComponent"
        >
          <template #after-overview>
            <MediaCopies v-if="media" ref="mediaCopies" :media-id="media.id" class="mt-2">
              <template #source><MediaCatalogSourceInfo :media="media" /></template>
            </MediaCopies>
          </template>
          <template v-if="!isAudioMedia && !isTextMedia && (isVideoMedia || thumb)" #rail-media>
            <EditDialogMediaPanel
              rail
              mode="media"
              :is-video-media="isVideoMedia"
              :media="media"
              :is-file-exists="isFileExists"
              :image-src="thumb ?? undefined"
              :image-path="imgPath ?? undefined"
              :cropper-options="cropperOps"
              :min-width="500"
              @edited="onImageEdited"
            />
          </template>
          <template #rail>
            <EditDialogHistoryAction entity-type="media" :entity-id="Number(media?.id)" placement="rail" :disabled="formDirty" @restored="requestClose" />
            <EditDialogQuickAction icon="mdi-file-cog-outline" :label="t('originals.title')" placement="rail" @click="originalsOpen = true" />
          </template>
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
              @update-big-preview="onBigPreviewChange"
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
            <div class="edit-dialog-media-actions">
              <EditDialogHistoryAction entity-type="media" :entity-id="Number(media?.id)" placement="media" :disabled="formDirty" @restored="requestClose" />
              <EditDialogQuickAction icon="mdi-file-cog-outline" :label="t('originals.title')" placement="media" @click="originalsOpen = true" />
            </div>
          </template>
        </EditPinnedMetaValues>
  </EditDialogShell>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, watch, defineAsyncComponent} from 'vue'
import type {MediaItem} from '@/types/stores'
import type {MediaType} from '@/types/media'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useContextMenu} from '@/stores/contextMenu'
import {isAdultUiAvailable} from '@/services/adultFeatures'
import {isTmdbUiAvailable} from '@/services/tmdbFeatures'
import {typedApi} from '@/services/typedApi'
import {loadImageDisplayUrl} from '@/utils/imageSource'
import {buildLocalFileUrl, checkFileExists as checkPathExists} from '@/services/fileService'
import {resolveMediaThumbDisplayUrl} from '@/utils/thumbSource'
import {invalidateVideoThumbCaches} from '@/utils/thumbDisplayCache'
import EditPinnedMetaValues from "@/components/items/EditPinnedMetaValues.vue"
import MediaCopies from '@/components/items/MediaCopies.vue'
import MediaCatalogSourceInfo from '@/components/items/MediaCatalogSourceInfo.vue'
import EditDialogMediaPanel from "@/components/items/EditDialogMediaPanel.vue"
import EditDialogShell from '@/components/dialogs/editing/EditDialogShell.vue'
import EditDialogHistoryAction from '@/components/dialogs/editing/EditDialogHistoryAction.vue'
import EditDialogQuickAction from '@/components/dialogs/editing/EditDialogQuickAction.vue'
import {useEditDialogGuard, type EditDialogHeaderButton} from '@/composable/useEditDialog'
import {useItemsListSync} from '@/composable/itemsListSync'
import path from 'path-browserify'
import {
  getCurrentMediaType,
  getMediaDeleteAssetFolder,
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
const DialogOriginalOperations = defineAsyncComponent(() => import('@/components/dialogs/DialogOriginalOperations.vue'))
const originalsOpen = ref(false)
const mediaCopies = ref<InstanceType<typeof MediaCopies>>()

interface EditComponentInstance {
  save?: () => Promise<boolean>
  isDirty?: () => boolean
}

const props = defineProps<{
  dialog?: boolean
  media?: MediaItem | null
  mediaType?: MediaType | null
}>()

const listSync = useItemsListSync()
const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const contextMenuStore = useContextMenu()
const {t} = useI18n()
const thumb = ref<string | null>(null)
const imgPath = ref<string | null>(null)
const isFileExists = ref(true)
const bigPreviewOpen = ref(false)
const buttons = ref<EditDialogHeaderButton[]>([])
const mediaPanelHidden = ref(false)
const editingComponent = ref<EditComponentInstance | null>(null)
const {formDirty, unsavedConfirm, forceClose, requestClose, onVisibilityChange: onDialogVisibilityChange} = useEditDialogGuard({
  isOpen: () => dialogsStore.mediaEditing.show,
  setOpen: (show) => { dialogsStore.mediaEditing.show = show },
  editingComponent,
  save: () => save(),
})
const cropperOps = ref({
  aspectRatio: 16 / 9,
})

const media = computed(() => props.media ?? dialogsStore.mediaEditing.media)

// Big preview teleports above the dialog; keep the dialog from treating
// those clicks as "outside" (which unmounts the preview and kills the menu).
const keepDialogOpen = computed(() => bigPreviewOpen.value || contextMenuStore.show)

function onBigPreviewChange(value: boolean) {
  bigPreviewOpen.value = value
}

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
  }]

  if (isAdultUiAvailable() && isVideoMedia.value) {
    buttons.value.push({
      icon: 'search-web',
      text: t('actions.scrape_scene'),
      color: 'info',
      outlined: false,
      action: openSceneScraper,
    })
  }

  if (isTmdbUiAvailable() && isVideoMedia.value) {
    buttons.value.push({
      icon: 'movie-search-outline',
      text: t('actions.tmdb_scrape'),
      color: 'primary',
      outlined: true,
      action: openTmdbScraper,
    })
  }

  buttons.value.push({
    icon: "content-save",
    text: t('common.save'),
    color: "success",
    outlined: false,
    action: save,
  })
}

function openSceneScraper() {
  if (!media.value) return
  dialogsStore.sceneScraper.media = {...media.value}
  dialogsStore.sceneScraper.show = true
}

function openTmdbScraper() {
  if (!media.value) return
  dialogsStore.tmdbScraper.media = {...media.value}
  dialogsStore.tmdbScraper.show = true
}

async function getImage() {
  const currentMedia = media.value
  if (!currentMedia?.id) return

  const mediaType = getCurrentMediaType(
    appStore.mediaTypes,
    currentMedia.mediaTypeId || itemsStore.environment?.media_type_id
  )

  if (isImageMediaType(mediaType)) {
    // Crop/save still writes the library thumb; the edit panel shows the original file.
    imgPath.value = path.join(appStore.mediaPath, 'images/thumbs', `${currentMedia.id}.jpg`)
    if (currentMedia.path) {
      thumb.value = await loadImageDisplayUrl(currentMedia, appStore.mediaPath, {
        preferFull: true,
        cacheBust: true,
      })
    } else {
      thumb.value = await loadImageDisplayUrl(currentMedia, appStore.mediaPath, {cacheBust: true})
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
    const bust = itemsStore.thumbRefreshKeys[Number(currentMedia.id)] || Date.now()
    thumb.value = buildLocalFileUrl(imgPath.value, false, bust)
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
  listSync.getItemsFromDb({
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
    listSync.getItemsFromDb({
      ids: [mediaId],
      type: 'media',
    })
    // Image metadata save does not change the library thumb; avoid a needless regenerate.
    if (!isImageMedia.value) {
      itemsStore.refreshThumb(mediaId, {regenerate: true})
    }
  }

  // Tags catalog + wall-card tags/values are already synced inside editingComponent.save().
  forceClose()
}

function deleteMedia() {
  const currentMedia = media.value
  if (!currentMedia || !dialogsStore?.confirm) return

  dialogsStore.confirm.checkBox = false
  dialogsStore.confirm.checkBox2 = false
  dialogsStore.confirm.checkBox2RequiresPrimary = true
  dialogsStore.confirm.checkBoxText = t('actions.delete_permanently')
  dialogsStore.confirm.checkBox2Text = t('actions.also_delete_files')
  dialogsStore.confirm.text = t('media.move_to_trash_confirm')
  dialogsStore.confirm.show = true
  dialogsStore.confirm.action = async () => {
    const permanent = Boolean(dialogsStore.confirm.checkBox)
    const withFile = Boolean(dialogsStore.confirm.checkBox2)
    await typedApi.deleteMediaOne({
      type: getMediaDeleteAssetFolder(currentMediaType.value),
      id: currentMedia.id,
      permanent,
      with_file: withFile,
      path: currentMedia.path,
    })

    listSync.removeEntitiesFromState({
      detail: {
        ids: [currentMedia.id],
        type: 'media',
      }
    })

    forceClose()
  }
}

onMounted(() => {
  initButtons()
  void getImage()
})

watch(() => media.value?.id, (mediaId, previousId) => {
  if (mediaId == null || mediaId === previousId) return
  bigPreviewOpen.value = false
  formDirty.value = false
  void getImage()
})

watch(() => dialogsStore.mediaEditing.show, (show) => {
  if (!show) {
    bigPreviewOpen.value = false
    formDirty.value = false
  }
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

