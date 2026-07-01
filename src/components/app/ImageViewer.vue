<template>
  <v-dialog
    @update:model-value="onDialogToggle"
    @click:outside="closeViewer"
    :model-value="viewer.active"
    :fullscreen="viewer.fullscreen"
    content-class="dialog-image-viewer"
    :width="viewer.fullscreen ? undefined : 'auto'"
    max-width="100%"
    no-click-animation
  >
    <div
      v-if="viewer.active"
      ref="viewerRootRef"
      :class="{ fullscreen: viewer.fullscreen }"
      class="image-viewer"
      tabindex="-1"
    >
      <v-btn
        @click="closeViewer"
        class="image-viewer__close"
        icon="mdi-close"
        variant="flat"
        color="white"
        size="small"
        :title="t('image.viewer.close')"
        :aria-label="t('image.viewer.close')"
      />

      <div class="image-viewer__toolbar">
        <div class="image-viewer__title">
          <div class="image-viewer__name" :title="currentName">
            {{ currentName }}
          </div>
          <div v-if="viewer.counter" class="image-viewer__counter">
            {{ viewer.counter }}
          </div>
        </div>

        <v-spacer />

        <div class="image-viewer__toolbar-groups">
          <v-btn-group class="image-viewer__group" density="comfortable" variant="tonal" divided>
            <v-btn
              @click="goPrev"
              :disabled="!viewer.hasPrev"
              icon="mdi-chevron-left"
              :title="t('image.viewer.previous')"
            />
            <v-btn
              @click="goNext"
              :disabled="!viewer.hasNextOrMore || viewer.loadingPlaylist"
              icon="mdi-chevron-right"
              :title="t('image.viewer.next')"
            />
          </v-btn-group>

          <v-btn-group class="image-viewer__group" density="comfortable" variant="tonal" divided>
            <v-btn
              @click="zoomOut"
              :disabled="!displaySrc"
              icon="mdi-magnify-minus"
              :title="t('image.viewer.zoom_out')"
            />
            <v-btn
              class="image-viewer__zoom-label"
              @click="resetView"
              :disabled="!displaySrc"
              :title="t('image.viewer.fit')"
            >
              {{ zoomLabel }}
            </v-btn>
            <v-btn
              @click="zoomIn"
              :disabled="!displaySrc"
              icon="mdi-magnify-plus"
              :title="t('image.viewer.zoom_in')"
            />
            <v-btn
              @click="resetView"
              :disabled="!displaySrc"
              icon="mdi-fit-to-screen"
              :title="t('image.viewer.fit')"
            />
          </v-btn-group>

          <v-btn-group class="image-viewer__group" density="comfortable" variant="tonal" divided>
            <v-btn
              @click="rotateLeft"
              :disabled="!displaySrc"
              icon="mdi-rotate-left"
              :title="t('image.viewer.rotate_left')"
            />
            <v-btn
              @click="rotateRight"
              :disabled="!displaySrc"
              icon="mdi-rotate-right"
              :title="t('image.viewer.rotate_right')"
            />
            <v-btn
              @click="toggleFlipHorizontal"
              :disabled="!displaySrc"
              :color="viewer.flipH ? 'primary' : undefined"
              icon="mdi-flip-horizontal"
              :title="t('image.viewer.flip_horizontal')"
            />
            <v-btn
              @click="toggleFlipVertical"
              :disabled="!displaySrc"
              :color="viewer.flipY ? 'primary' : undefined"
              icon="mdi-flip-vertical"
              :title="t('image.viewer.flip_vertical')"
            />
          </v-btn-group>

          <v-btn-group class="image-viewer__group" density="comfortable" variant="tonal" divided>
            <v-btn
              @click="toggleFullscreen"
              :icon="viewer.fullscreen ? 'mdi-fullscreen-exit' : 'mdi-fullscreen'"
              :title="t('image.viewer.fullscreen')"
            />
            <v-btn
              @click="editImage"
              icon="mdi-pencil"
              :title="t('common.edit')"
            />
            <v-btn
              @click="openInSystem"
              :disabled="!viewer.isFileExists"
              icon="mdi-open-in-new"
              :title="t('image.viewer.open_external')"
            />
          </v-btn-group>
        </div>
      </div>

      <div
        ref="stageRef"
        class="image-viewer__stage"
        @wheel.prevent="onWheel"
        @mousedown="onPanStart"
        @dblclick="onDoubleClick"
      >
        <v-btn
          v-if="viewer.hasPrev"
          @click.stop="goPrev"
          class="image-viewer__nav image-viewer__nav--prev"
          icon="mdi-chevron-left"
          variant="flat"
          color="white"
          size="large"
          :title="t('image.viewer.previous')"
          :aria-label="t('image.viewer.previous')"
        />
        <v-btn
          v-if="viewer.hasNextOrMore"
          @click.stop="goNext"
          :disabled="viewer.loadingPlaylist"
          class="image-viewer__nav image-viewer__nav--next"
          icon="mdi-chevron-right"
          variant="flat"
          color="white"
          size="large"
          :title="t('image.viewer.next')"
          :aria-label="t('image.viewer.next')"
        />

        <div
          v-if="viewer.loading && displaySrc"
          class="image-viewer__loading-badge"
        >
          <v-progress-circular
            indeterminate
            color="white"
            size="20"
            width="2"
          />
          <span>{{ t('image.viewer.loading_full') }}</span>
        </div>

        <v-progress-circular
          v-if="viewer.loading && !displaySrc"
          indeterminate
          color="white"
          size="64"
        />

        <img
          v-if="displaySrc"
          :src="displaySrc"
          :style="transformStyle"
          :class="{ 'image-viewer__image--loading': viewer.loading }"
          class="image-viewer__image"
          draggable="false"
          alt=""
        />

        <div v-else-if="loadFailed" class="image-viewer__error">
          <v-alert type="error" variant="tonal">
            {{ t('image.cannot_obtain') }}
          </v-alert>
          <v-btn
            v-if="viewer.isFileExists"
            @click="openInSystem"
            class="mt-4"
            color="primary"
            rounded
          >
            <v-icon start>mdi-open-in-new</v-icon>
            {{ t('image.viewer.open_external') }}
          </v-btn>
        </div>

        <Transition name="image-viewer-fade">
          <div
            v-if="viewer.loadingPlaylist"
            class="image-viewer__playlist-loading"
          >
            <v-progress-circular
              indeterminate
              color="white"
              size="48"
              width="4"
            />
            <span>{{ t('image.viewer.loading_more') }}</span>
          </div>
        </Transition>
      </div>

      <div class="image-viewer__dock">
        <v-btn
          @click="zoomOut"
          :disabled="!displaySrc"
          icon="mdi-minus"
          variant="text"
          color="white"
          size="small"
        />
        <v-btn
          @click="resetView"
          :disabled="!displaySrc"
          class="image-viewer__dock-zoom"
          variant="text"
          color="white"
          size="small"
        >
          {{ zoomLabel }}
        </v-btn>
        <v-btn
          @click="zoomIn"
          :disabled="!displaySrc"
          icon="mdi-plus"
          variant="text"
          color="white"
          size="small"
        />
        <span class="image-viewer__dock-divider" />
        <v-btn
          @click="rotateLeft"
          :disabled="!displaySrc"
          icon="mdi-rotate-left"
          variant="text"
          color="white"
          size="small"
        />
        <v-btn
          @click="rotateRight"
          :disabled="!displaySrc"
          icon="mdi-rotate-right"
          variant="text"
          color="white"
          size="small"
        />
        <v-btn
          @click="toggleFlipHorizontal"
          :disabled="!displaySrc"
          :color="viewer.flipH ? 'primary' : 'white'"
          icon="mdi-flip-horizontal"
          variant="text"
          size="small"
        />
        <v-btn
          @click="toggleFlipVertical"
          :disabled="!displaySrc"
          :color="viewer.flipY ? 'primary' : 'white'"
          icon="mdi-flip-vertical"
          variant="text"
          size="small"
        />
        <span class="image-viewer__dock-divider" />
        <v-btn
          @click="resetView"
          :disabled="!displaySrc"
          icon="mdi-fit-to-screen"
          variant="text"
          color="white"
          size="small"
        />
      </div>

      <div v-if="infoLine" class="image-viewer__info">
        {{ infoLine }}
      </div>
    </div>
  </v-dialog>
</template>

<script setup lang="ts">
import {ref, computed, onMounted, onBeforeUnmount} from 'vue'
import {useI18n} from 'vue-i18n'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useItemsStore} from '@/stores/items'
import {useImageViewerStore} from '@/stores/imageViewer'
import {useEventBus} from '@/utils/eventBus'
import {loadThumbDisplayUrl, loadFullImageDisplayUrl, revokeImageObjectUrl} from '@/utils/imageSource'
import {checkFileExists} from '@/services/fileService'
import {getReadableFileSize} from '@/services/formatUtils'
import {openPath} from '@/services/shellService'
import type { MediaItem } from '@/types/stores'

const appStore = useAppStore()
const dialogsStore = useDialogsStore()
const itemsStore = useItemsStore()
const viewer = useImageViewerStore()
const eventBus = useEventBus()
const {t} = useI18n()

const viewerRootRef = ref<HTMLElement | null>(null)
const stageRef = ref<HTMLElement | null>(null)
const displaySrc = ref<string | null>(null)
const loadFailed = ref(false)

const panState = ref({
  active: false,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
})

let objectUrl: string | null = null
let ownsObjectUrl = false
let loadToken = 0
let playlistExtendPromise: Promise<boolean> | null = null

const currentName = computed(() => viewer.currentImage?.name || '')

const zoomLabel = computed(() => `${Math.round(viewer.scale * 100)}%`)

const transformStyle = computed(() => {
  const transforms = [
    `translate(${viewer.translateX}px, ${viewer.translateY}px)`,
    `rotate(${viewer.rotation}deg)`,
    `scale(${viewer.scale * (viewer.flipH ? -1 : 1)}, ${viewer.scale * (viewer.flipY ? -1 : 1)})`,
  ]

  return {transform: transforms.join(' ')}
})

const infoLine = computed(() => {
  const image = viewer.currentImage
  if (!image) return ''

  const parts = []

  if (image.width && image.height) {
    parts.push(`${image.width}×${image.height}`)
  }

  if (image.filesize) {
    parts.push(getReadableFileSize(Number(image.filesize)))
  }

  if (image.path) {
    parts.push(image.path)
  }

  return parts.join(' · ')
})

const clearObjectUrl = () => {
  if (ownsObjectUrl) {
    revokeImageObjectUrl(objectUrl)
  }
  objectUrl = null
  ownsObjectUrl = false
  displaySrc.value = null
}

const setDisplaySrc = (src: string | null, {owned = false}: { owned?: boolean } = {}) => {
  if (owned && objectUrl && objectUrl !== src) {
    revokeImageObjectUrl(objectUrl)
  }

  objectUrl = owned && src?.startsWith('blob:') ? src : null
  ownsObjectUrl = owned && Boolean(objectUrl)
  displaySrc.value = src
  if (src) loadFailed.value = false
}

const adoptLoadedSrc = (src: string | null | undefined, token: number): string | null => {
  if (!src) return null
  if (token !== loadToken) {
    if (src.startsWith('blob:')) revokeImageObjectUrl(src)
    return null
  }
  return src
}

const loadCurrentImage = async () => {
  const token = ++loadToken
  const image = viewer.currentImage
  loadFailed.value = false

  if (!image) {
    clearObjectUrl()
    return
  }

  viewer.setLoading(true)
  clearObjectUrl()

  const previewSrc = viewer.previewSrc
  viewer.previewSrc = null

  if (previewSrc) {
    setDisplaySrc(previewSrc, {owned: false})
    viewer.setLoading(false)
  }

  const existsPromise = image.path ? checkFileExists(image.path) : Promise.resolve(false)

  if (!previewSrc) {
    try {
      const thumbSrc = adoptLoadedSrc(
        await loadThumbDisplayUrl(image, appStore.mediaPath),
        token,
      )
      if (thumbSrc) {
        setDisplaySrc(thumbSrc, {owned: true})
        viewer.setLoading(false)
      }
    } catch (error) {
      console.error('Failed to load image thumbnail for viewer:', error)
    }
  }

  try {
    const fullSrc = adoptLoadedSrc(await loadFullImageDisplayUrl(image), token)
    if (fullSrc) {
      setDisplaySrc(fullSrc, {owned: true})
    }
  } catch (error) {
    console.error('Failed to load full image for viewer:', error)
  } finally {
    if (token === loadToken) {
      viewer.setFileExists(await existsPromise)
      viewer.setLoading(false)

      if (!displaySrc.value && viewer.active) {
        loadFailed.value = true
      }
    }
  }
}

const closeViewer = () => {
  if (!viewer.active) return

  loadToken += 1
  loadFailed.value = false
  playlistExtendPromise = null
  viewer.setLoadingPlaylist(false)
  clearObjectUrl()
  viewer.close()
}

const onDialogToggle = (value: boolean) => {
  if (!value) closeViewer()
}

const syncPlaylistFromStore = (anchorId?: number) => {
  const image = viewer.currentImage ?? viewer.fallbackImage
  if (!image) return

  const ids = itemsStore.buildImageViewerPlaylistIds(image)
  const anchor = anchorId ?? image.id
  const index = Math.max(0, ids.indexOf(anchor))
  viewer.setPlaylist(ids, index)
}

const ensurePlaylistExtended = async (): Promise<boolean> => {
  if (viewer.index < viewer.imageIds.length - 1) return true
  if (!itemsStore.canLoadMoreForViewer) return false
  if (playlistExtendPromise) return playlistExtendPromise

  playlistExtendPromise = (async () => {
    viewer.setLoadingPlaylist(true)
    try {
      const beforeLen = viewer.imageIds.length
      const loaded = await itemsStore.loadMoreForViewer()
      if (!loaded) return false

      const anchorId = viewer.currentImage?.id ?? viewer.fallbackImage?.id
      syncPlaylistFromStore(anchorId)
      return viewer.imageIds.length > beforeLen
    } finally {
      viewer.setLoadingPlaylist(false)
      playlistExtendPromise = null
    }
  })()

  return playlistExtendPromise
}

const maybePrefetchPlaylist = () => {
  if (!viewer.active) return
  if (viewer.index !== viewer.imageIds.length - 1) return
  if (!itemsStore.canLoadMoreForViewer) return
  void ensurePlaylistExtended()
}

const goPrev = async () => {
  if (viewer.prev()) await loadCurrentImage()
}

const goNext = async () => {
  if (viewer.next()) {
    await loadCurrentImage()
    maybePrefetchPlaylist()
    return
  }

  const extended = await ensurePlaylistExtended()
  if (extended && viewer.next()) {
    await loadCurrentImage()
    maybePrefetchPlaylist()
  }
}

const zoomIn = () => viewer.zoomIn()
const zoomOut = () => viewer.zoomOut()
const resetView = () => viewer.resetTransform()
const toggleFullscreen = () => viewer.toggleFullscreen()
const rotateLeft = () => viewer.rotateLeft()
const rotateRight = () => viewer.rotateRight()
const toggleFlipHorizontal = () => viewer.toggleFlipHorizontal()
const toggleFlipVertical = () => viewer.toggleFlipVertical()

const MIN_ZOOM = 0.2
const MAX_ZOOM = 8

const clampScale = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const applyZoomAtPointer = (event: WheelEvent, nextScale: number) => {
  const stage = stageRef.value
  if (!stage || nextScale === viewer.scale) return

  const rect = stage.getBoundingClientRect()
  const pointerX = event.clientX - rect.left - rect.width / 2
  const pointerY = event.clientY - rect.top - rect.height / 2
  const ratio = nextScale / viewer.scale

  viewer.translateX = pointerX - ratio * (pointerX - viewer.translateX)
  viewer.translateY = pointerY - ratio * (pointerY - viewer.translateY)
  viewer.scale = nextScale
}

const onWheel = (event: WheelEvent) => {
  if (!displaySrc.value) return

  const pinchZoom = event.ctrlKey
  const lineWheel = event.deltaMode === WheelEvent.DOM_DELTA_LINE
  const coarseWheel = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
    && Math.abs(event.deltaY) >= 48
    && Math.abs(event.deltaX) < 2

  const shouldZoom = pinchZoom || lineWheel || coarseWheel

  if (!shouldZoom) {
    viewer.translateX -= event.deltaX
    viewer.translateY -= event.deltaY
    return
  }

  const sensitivity = pinchZoom ? 0.015 : lineWheel ? 0.14 : 0.01
  const nextScale = clampScale(viewer.scale * Math.exp(-event.deltaY * sensitivity))
  applyZoomAtPointer(event, nextScale)
}

const onPanStart = (event: MouseEvent) => {
  if (event.button !== 0 || !displaySrc.value) return

  panState.value = {
    active: true,
    startX: event.clientX,
    startY: event.clientY,
    originX: viewer.translateX,
    originY: viewer.translateY,
  }

  window.addEventListener('mousemove', onPanMove)
  window.addEventListener('mouseup', onPanEnd)
}

const onPanMove = (event: MouseEvent) => {
  if (!panState.value.active) return

  viewer.translateX = panState.value.originX + (event.clientX - panState.value.startX)
  viewer.translateY = panState.value.originY + (event.clientY - panState.value.startY)
}

const onPanEnd = () => {
  panState.value.active = false
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
}

const onDoubleClick = () => {
  if (!displaySrc.value) return

  if (viewer.scale === 1) {
    viewer.scale = 2
    return
  }

  viewer.resetTransform()
}

const editImage = () => {
  const image = viewer.currentImage
  if (!image) return

  dialogsStore.editMedia(image)
}

const openInSystem = () => {
  const image = viewer.currentImage
  if (!image?.path || !viewer.isFileExists) return
  openPath(image.path)
}

const onKeyDown = (event: KeyboardEvent) => {
  if (!viewer.active) return

  switch (event.key) {
    case 'Escape':
      closeViewer()
      break
    case 'ArrowLeft':
      event.preventDefault()
      goPrev()
      break
    case 'ArrowRight':
      event.preventDefault()
      goNext()
      break
    case '+':
    case '=':
      event.preventDefault()
      zoomIn()
      break
    case '-':
    case '_':
      event.preventDefault()
      zoomOut()
      break
    case 'f':
    case 'F':
      event.preventDefault()
      toggleFullscreen()
      break
    case '0':
      event.preventDefault()
      resetView()
      break
    case 'r':
    case 'R':
      event.preventDefault()
      rotateRight()
      break
    default:
      break
  }
}

interface ViewImagePayload {
  imageIds?: number[]
  index?: number
  fallbackImage?: MediaItem | null
  previewSrc?: string | null
}

const openFromEvent = (payload: unknown) => {
  const {imageIds, index = 0, fallbackImage = null, previewSrc = null} = payload as ViewImagePayload
  if (!imageIds?.length) return

  viewer.open({imageIds, index, fallbackImage, previewSrc})

  if (fallbackImage) {
    queueMicrotask(() => {
      syncPlaylistFromStore(fallbackImage.id)
      maybePrefetchPlaylist()
    })
  }

  void loadCurrentImage()
}

const viewImageHandler = (payload: unknown) => openFromEvent(payload)

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  eventBus.on('viewImage', viewImageHandler)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('mousemove', onPanMove)
  window.removeEventListener('mouseup', onPanEnd)
  eventBus.off('viewImage', viewImageHandler)
  clearObjectUrl()
})
</script>
