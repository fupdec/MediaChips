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
      :class="{
        fullscreen: viewer.fullscreen,
        'image-viewer--chrome-hidden': chromeHidden,
      }"
      class="image-viewer"
      tabindex="-1"
      @pointermove="bumpChrome"
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
            <v-btn
              @click="toggleSlideshow"
              :disabled="!displaySrc"
              :color="viewer.slideshowActive ? 'primary' : undefined"
              :icon="viewer.slideshowActive ? 'mdi-pause' : 'mdi-play'"
              :title="viewer.slideshowActive
                ? t('image.viewer.slideshow_pause')
                : t('image.viewer.slideshow_play')"
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
              @click="viewer.toggleInfoVisible()"
              :color="viewer.infoVisible ? 'primary' : undefined"
              icon="mdi-information-outline"
              :title="t('image.viewer.toggle_info')"
            />
            <v-btn
              @click="editImage"
              :disabled="viewer.isSourcesMode"
              icon="mdi-pencil"
              :title="t('common.edit')"
            />
            <v-btn
              @click="openInSystem"
              :disabled="viewer.isSourcesMode || !viewer.isFileExists"
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
        @pointerdown="onPointerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
        @pointercancel="onPointerUp"
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
          @click="toggleSlideshow"
          :disabled="!displaySrc"
          :color="viewer.slideshowActive ? 'primary' : 'white'"
          :icon="viewer.slideshowActive ? 'mdi-pause' : 'mdi-play'"
          variant="text"
          size="small"
          :title="viewer.slideshowActive
            ? t('image.viewer.slideshow_pause')
            : t('image.viewer.slideshow_play')"
        />
        <span class="image-viewer__dock-divider" />
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

      <div v-if="viewer.infoVisible && infoLine" class="image-viewer__info">
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

const SLIDESHOW_MS = 4000
const CHROME_HIDE_MS = 2000
const SWIPE_THRESHOLD_PX = 56
const MIN_ZOOM = 0.2
const MAX_ZOOM = 8

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
const chromeVisible = ref(true)

const panState = ref({
  active: false,
  pointerId: -1,
  startX: 0,
  startY: 0,
  originX: 0,
  originY: 0,
})

const pointers = new Map<number, {x: number; y: number}>()
let pinchStartDist = 0
let pinchStartScale = 1
let swipeTracking = false
let swipeStartX = 0
let swipeStartY = 0
let swipeMoved = false

let objectUrl: string | null = null
let ownsObjectUrl = false
let loadToken = 0
let playlistExtendPromise: Promise<boolean> | null = null
let slideshowTimer: ReturnType<typeof setInterval> | null = null
let chromeHideTimer: ReturnType<typeof setTimeout> | null = null

type NeighborEntry = {
  thumb?: string
  full?: string
  owned: string[]
}
const neighborCache = new Map<number, NeighborEntry>()

const currentName = computed(() =>
  viewer.currentSource?.name || viewer.currentImage?.name || '',
)

const zoomLabel = computed(() => `${Math.round(viewer.scale * 100)}%`)

const chromeHidden = computed(() =>
  !chromeVisible.value && !loadFailed.value && !viewer.loadingPlaylist,
)

const transformStyle = computed(() => {
  const transforms = [
    `translate(${viewer.translateX}px, ${viewer.translateY}px)`,
    `rotate(${viewer.rotation}deg)`,
    `scale(${viewer.scale * (viewer.flipH ? -1 : 1)}, ${viewer.scale * (viewer.flipY ? -1 : 1)})`,
  ]

  return {transform: transforms.join(' ')}
})

const infoLine = computed(() => {
  const source = viewer.currentSource
  if (source) {
    const parts = []
    if (source.width && source.height) {
      parts.push(`${source.width}×${source.height}`)
    }
    return parts.join(' · ')
  }

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

const bumpChrome = () => {
  chromeVisible.value = true
  if (chromeHideTimer) clearTimeout(chromeHideTimer)
  chromeHideTimer = setTimeout(() => {
    if (loadFailed.value) return
    chromeVisible.value = false
  }, CHROME_HIDE_MS)
}

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

const clearNeighborCache = () => {
  for (const entry of neighborCache.values()) {
    for (const url of entry.owned) revokeImageObjectUrl(url)
  }
  neighborCache.clear()
}

const rememberNeighborUrl = (entry: NeighborEntry, src: string | null | undefined, kind: 'thumb' | 'full') => {
  if (!src || src.includes('unavailable.png')) return
  entry[kind] = src
  if (src.startsWith('blob:')) entry.owned.push(src)
}

const prefetchNeighbors = () => {
  if (!viewer.active || viewer.isSourcesMode) return

  const indices = [viewer.index - 1, viewer.index + 1]
    .filter((i) => i >= 0 && i < viewer.imageIds.length)

  for (const i of indices) {
    const id = viewer.imageIds[i]
    if (id == null || neighborCache.has(id)) continue

    const media = itemsStore.resolveMediaById(id) || (
      viewer.fallbackImage?.id === id ? viewer.fallbackImage : null
    )
    if (!media) continue

    const entry: NeighborEntry = {owned: []}
    neighborCache.set(id, entry)

    void (async () => {
      try {
        const thumb = await loadThumbDisplayUrl(media, appStore.mediaPath)
        rememberNeighborUrl(entry, thumb, 'thumb')
      } catch (error) {
        console.error('Failed to prefetch neighbor thumb:', error)
      }

      try {
        const full = await loadFullImageDisplayUrl(media)
        rememberNeighborUrl(entry, full, 'full')
      } catch (error) {
        console.error('Failed to prefetch neighbor full image:', error)
      }
    })()
  }

  // Drop entries that are no longer near the current index.
  const keepIds = new Set(
    [viewer.index - 1, viewer.index, viewer.index + 1]
      .filter((i) => i >= 0 && i < viewer.imageIds.length)
      .map((i) => viewer.imageIds[i]),
  )
  for (const [id, entry] of neighborCache) {
    if (keepIds.has(id)) continue
    for (const url of entry.owned) revokeImageObjectUrl(url)
    neighborCache.delete(id)
  }
}

const loadCurrentImage = async () => {
  const token = ++loadToken
  loadFailed.value = false

  if (viewer.isSourcesMode) {
    const source = viewer.currentSource
    clearObjectUrl()
    if (!source?.src) {
      loadFailed.value = true
      viewer.setLoading(false)
      return
    }
    setDisplaySrc(source.src, {owned: false})
    viewer.setFileExists(true)
    viewer.setLoading(false)
    return
  }

  const image = viewer.currentImage

  if (!image) {
    clearObjectUrl()
    return
  }

  viewer.setLoading(true)
  clearObjectUrl()

  const previewSrc = viewer.previewSrc
  viewer.previewSrc = null

  const cachedNeighbor = image.id != null ? neighborCache.get(image.id) : undefined

  if (previewSrc) {
    setDisplaySrc(previewSrc, {owned: false})
    viewer.setLoading(false)
  } else if (cachedNeighbor?.full) {
    setDisplaySrc(cachedNeighbor.full, {owned: false})
    viewer.setLoading(false)
  } else if (cachedNeighbor?.thumb) {
    setDisplaySrc(cachedNeighbor.thumb, {owned: false})
    viewer.setLoading(false)
  }

  const existsPromise = image.path ? checkFileExists(image.path) : Promise.resolve(false)

  if (!previewSrc && !cachedNeighbor?.full && !cachedNeighbor?.thumb) {
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
    if (cachedNeighbor?.full && displaySrc.value === cachedNeighbor.full) {
      // Already showing prefetched full resolution.
    } else {
      const fullSrc = adoptLoadedSrc(await loadFullImageDisplayUrl(image), token)
      if (fullSrc) {
        setDisplaySrc(fullSrc, {owned: true})
      }
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

      prefetchNeighbors()
    }
  }
}

const stopSlideshowTimer = () => {
  if (slideshowTimer) {
    clearInterval(slideshowTimer)
    slideshowTimer = null
  }
}

const stopSlideshow = () => {
  stopSlideshowTimer()
  viewer.setSlideshowActive(false)
}

const tickSlideshow = async () => {
  if (!viewer.active || !viewer.slideshowActive) return
  if (viewer.loading || viewer.loadingPlaylist) return

  if (!viewer.hasNextOrMore) {
    stopSlideshow()
    return
  }

  await goNext()

  if (!viewer.hasNextOrMore && !itemsStore.canLoadMoreForViewer) {
    stopSlideshow()
  }
}

const startSlideshow = () => {
  stopSlideshowTimer()
  viewer.setSlideshowActive(true)
  bumpChrome()
  slideshowTimer = setInterval(() => {
    void tickSlideshow()
  }, SLIDESHOW_MS)
}

const toggleSlideshow = () => {
  if (viewer.slideshowActive) stopSlideshow()
  else startSlideshow()
}

const closeViewer = () => {
  if (!viewer.active) return

  loadToken += 1
  loadFailed.value = false
  playlistExtendPromise = null
  viewer.setLoadingPlaylist(false)
  stopSlideshow()
  if (chromeHideTimer) clearTimeout(chromeHideTimer)
  chromeHideTimer = null
  chromeVisible.value = true
  clearNeighborCache()
  clearObjectUrl()
  viewer.close()
}

const onDialogToggle = (value: boolean) => {
  if (!value) closeViewer()
}

const syncPlaylistFromStore = (anchorId?: number) => {
  if (viewer.isSourcesMode) return
  const image = viewer.currentImage ?? viewer.fallbackImage
  if (!image) return

  const ids = itemsStore.buildImageViewerPlaylistIds(image)
  const anchor = anchorId ?? image.id
  const index = Math.max(0, ids.indexOf(anchor))
  viewer.setPlaylist(ids, index)
}

const ensurePlaylistExtended = async (): Promise<boolean> => {
  if (viewer.isSourcesMode) return false
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
  if (!viewer.active || viewer.isSourcesMode) return
  if (viewer.index !== viewer.imageIds.length - 1) return
  if (!itemsStore.canLoadMoreForViewer) return
  void ensurePlaylistExtended()
}

const goPrev = async () => {
  if (viewer.prev()) {
    await loadCurrentImage()
    bumpChrome()
  }
}

const goNext = async () => {
  if (viewer.next()) {
    await loadCurrentImage()
    maybePrefetchPlaylist()
    bumpChrome()
    return
  }

  const extended = await ensurePlaylistExtended()
  if (extended && viewer.next()) {
    await loadCurrentImage()
    maybePrefetchPlaylist()
    bumpChrome()
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

const clampScale = (value: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))

const applyZoomAtClientPoint = (clientX: number, clientY: number, nextScale: number) => {
  const stage = stageRef.value
  if (!stage || nextScale === viewer.scale) return

  const rect = stage.getBoundingClientRect()
  const pointerX = clientX - rect.left - rect.width / 2
  const pointerY = clientY - rect.top - rect.height / 2
  const ratio = nextScale / viewer.scale

  viewer.translateX = pointerX - ratio * (pointerX - viewer.translateX)
  viewer.translateY = pointerY - ratio * (pointerY - viewer.translateY)
  viewer.scale = nextScale
}

const applyZoomAtPointer = (event: WheelEvent, nextScale: number) => {
  applyZoomAtClientPoint(event.clientX, event.clientY, nextScale)
}

const onWheel = (event: WheelEvent) => {
  if (!displaySrc.value) return
  bumpChrome()

  const pinchZoom = event.ctrlKey
  const lineWheel = event.deltaMode === WheelEvent.DOM_DELTA_LINE
  const coarseWheel = event.deltaMode === WheelEvent.DOM_DELTA_PIXEL
    && Math.abs(event.deltaY) >= 48
    && Math.abs(event.deltaX) < 2

  const shouldZoom = pinchZoom || lineWheel || coarseWheel

  if (!shouldZoom) {
    if (viewer.scale <= 1) return
    viewer.translateX -= event.deltaX
    viewer.translateY -= event.deltaY
    return
  }

  const sensitivity = pinchZoom ? 0.015 : lineWheel ? 0.14 : 0.01
  const nextScale = clampScale(viewer.scale * Math.exp(-event.deltaY * sensitivity))
  applyZoomAtPointer(event, nextScale)
}

const onPointerDown = (event: PointerEvent) => {
  if (!displaySrc.value) return
  bumpChrome()

  pointers.set(event.pointerId, {x: event.clientX, y: event.clientY})
  stageRef.value?.setPointerCapture?.(event.pointerId)

  if (pointers.size === 1) {
    swipeMoved = false
    if (viewer.scale <= 1.05) {
      swipeTracking = true
      swipeStartX = event.clientX
      swipeStartY = event.clientY
    } else if (event.pointerType === 'mouse' ? event.button === 0 : true) {
      panState.value = {
        active: true,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        originX: viewer.translateX,
        originY: viewer.translateY,
      }
    }
  }

  if (pointers.size === 2) {
    swipeTracking = false
    panState.value.active = false
    const pts = [...pointers.values()]
    pinchStartDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    pinchStartScale = viewer.scale
  }
}

const onPointerMove = (event: PointerEvent) => {
  if (!pointers.has(event.pointerId)) return
  pointers.set(event.pointerId, {x: event.clientX, y: event.clientY})
  bumpChrome()

  if (pointers.size === 2 && pinchStartDist > 0) {
    const pts = [...pointers.values()]
    const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    const midX = (pts[0].x + pts[1].x) / 2
    const midY = (pts[0].y + pts[1].y) / 2
    const nextScale = clampScale(pinchStartScale * (dist / pinchStartDist))
    applyZoomAtClientPoint(midX, midY, nextScale)
    return
  }

  if (panState.value.active && panState.value.pointerId === event.pointerId && viewer.scale > 1) {
    viewer.translateX = panState.value.originX + (event.clientX - panState.value.startX)
    viewer.translateY = panState.value.originY + (event.clientY - panState.value.startY)
    return
  }

  if (swipeTracking) {
    const dx = event.clientX - swipeStartX
    const dy = event.clientY - swipeStartY
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) swipeMoved = true
  }
}

const onPointerUp = (event: PointerEvent) => {
  if (swipeTracking && pointers.size === 1 && viewer.scale <= 1.05 && swipeMoved) {
    const dx = event.clientX - swipeStartX
    const dy = event.clientY - swipeStartY
    if (Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0) void goNext()
      else void goPrev()
    }
  }

  pointers.delete(event.pointerId)

  if (panState.value.pointerId === event.pointerId) {
    panState.value.active = false
    panState.value.pointerId = -1
  }

  if (pointers.size < 2) {
    pinchStartDist = 0
  }

  if (pointers.size === 0) {
    swipeTracking = false
    swipeMoved = false
  }

  try {
    stageRef.value?.releasePointerCapture?.(event.pointerId)
  } catch {
    // ignore release errors when capture was never set
  }
}

const onDoubleClick = (event: MouseEvent) => {
  if (!displaySrc.value) return

  if (viewer.scale <= 1.01) {
    applyZoomAtClientPoint(event.clientX, event.clientY, 2)
    return
  }

  viewer.resetTransform()
}

const editImage = () => {
  if (viewer.isSourcesMode) return
  const image = viewer.currentImage
  if (!image) return

  dialogsStore.editMedia(image)
}

const openInSystem = () => {
  if (viewer.isSourcesMode) return
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
    case ' ':
    case 'Spacebar':
      event.preventDefault()
      toggleSlideshow()
      break
    case 'i':
    case 'I':
      event.preventDefault()
      viewer.toggleInfoVisible()
      bumpChrome()
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
  sources?: Array<{src: string; name?: string; width?: number; height?: number}>
}

const openFromEvent = (payload: unknown) => {
  const {
    imageIds,
    index = 0,
    fallbackImage = null,
    previewSrc = null,
    sources,
  } = payload as ViewImagePayload

  stopSlideshow()
  clearNeighborCache()
  bumpChrome()

  if (sources?.length) {
    viewer.openSources({sources, index})
    void loadCurrentImage()
    return
  }

  if (!imageIds?.length) return

  viewer.open({imageIds, index, fallbackImage, previewSrc})

  if (fallbackImage && imageIds.length <= 1) {
    queueMicrotask(() => {
      syncPlaylistFromStore(fallbackImage.id)
      maybePrefetchPlaylist()
      prefetchNeighbors()
    })
  } else {
    maybePrefetchPlaylist()
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
  eventBus.off('viewImage', viewImageHandler)
  stopSlideshow()
  if (chromeHideTimer) clearTimeout(chromeHideTimer)
  clearNeighborCache()
  clearObjectUrl()
})
</script>
