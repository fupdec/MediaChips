import { defineStore } from 'pinia'
import { useItemsStore } from '@/stores/items'
import type { MediaItem } from '@/types/stores'

export type ImageViewerSource = {
  src: string
  name?: string
  width?: number
  height?: number
}

export const useImageViewerStore = defineStore('imageViewer', {
  state: () => ({
    active: false,
    imageIds: [] as number[],
    sources: [] as ImageViewerSource[],
    fallbackImage: null as MediaItem | null,
    previewSrc: null as string | null,
    index: 0,
    fullscreen: false,
    scale: 1,
    translateX: 0,
    translateY: 0,
    rotation: 0,
    flipH: false,
    flipY: false,
    loading: false,
    loadingPlaylist: false,
    src: null as string | null,
    isFileExists: true,
  }),

  getters: {
    isSourcesMode(state): boolean {
      return state.sources.length > 0
    },
    currentSource(state): ImageViewerSource | null {
      return state.sources[state.index] ?? null
    },
    currentImage(state): MediaItem | null {
      if (state.sources.length) return null

      const id = state.imageIds[state.index]
      if (id == null) return state.fallbackImage

      const itemsStore = useItemsStore()
      const image = itemsStore.resolveMediaById(id)

      if (image) return image
      if (state.fallbackImage?.id === id) return state.fallbackImage

      return null
    },
    hasPrev(state): boolean {
      return state.index > 0
    },
    hasNext(state): boolean {
      const total = state.sources.length || state.imageIds.length
      return state.index < total - 1
    },
    hasNextOrMore(state): boolean {
      if (state.sources.length) {
        return state.index < state.sources.length - 1
      }
      if (state.index < state.imageIds.length - 1) return true

      const itemsStore = useItemsStore()
      return itemsStore.canLoadMoreForViewer
    },
    counter(state): string {
      if (state.sources.length) {
        return `${state.index + 1} / ${state.sources.length}`
      }
      if (!state.imageIds.length) return ''

      const itemsStore = useItemsStore()
      const total = itemsStore.canLoadMoreForViewer
        ? itemsStore.totalFiltered
        : state.imageIds.length

      return `${state.index + 1} / ${total}`
    },
  },

  actions: {
    open({
      imageIds,
      index = 0,
      fallbackImage = null,
      previewSrc = null,
    }: {
      imageIds: number[]
      index?: number
      fallbackImage?: MediaItem | null
      previewSrc?: string | null
    }) {
      this.sources = []
      this.imageIds = imageIds
      this.fallbackImage = fallbackImage
      this.previewSrc = previewSrc
      this.index = Math.min(Math.max(index, 0), Math.max(imageIds.length - 1, 0))
      this.active = true
      this.isFileExists = true
      this.resetTransform()
    },

    openSources({
      sources,
      index = 0,
    }: {
      sources: ImageViewerSource[]
      index?: number
    }) {
      if (!sources.length) return

      this.imageIds = []
      this.fallbackImage = null
      this.previewSrc = null
      this.sources = sources
      this.index = Math.min(Math.max(index, 0), sources.length - 1)
      this.active = true
      this.isFileExists = true
      this.resetTransform()
    },

    setPlaylist(imageIds: number[], index: number) {
      if (!imageIds?.length || this.sources.length) return

      this.imageIds = imageIds
      this.index = Math.min(Math.max(index, 0), Math.max(imageIds.length - 1, 0))
    },

    close() {
      this.active = false
      this.fullscreen = false
      this.imageIds = []
      this.sources = []
      this.fallbackImage = null
      this.previewSrc = null
      this.index = 0
      this.loading = false
      this.loadingPlaylist = false
      this.src = null
      this.isFileExists = true
      this.resetTransform()
    },

    resetTransform() {
      this.scale = 1
      this.translateX = 0
      this.translateY = 0
      this.rotation = 0
      this.flipH = false
      this.flipY = false
    },

    rotateLeft() {
      this.rotation = (this.rotation - 90 + 360) % 360
    },

    rotateRight() {
      this.rotation = (this.rotation + 90) % 360
    },

    toggleFlipHorizontal() {
      this.flipH = !this.flipH
    },

    toggleFlipVertical() {
      this.flipY = !this.flipY
    },

    setSrc(src: string | null) {
      this.src = src
    },

    setLoading(loading: boolean) {
      this.loading = loading
    },

    setLoadingPlaylist(loading: boolean) {
      this.loadingPlaylist = loading
    },

    setFileExists(exists: boolean) {
      this.isFileExists = exists
    },

    next() {
      if (!this.hasNext) return false
      this.index += 1
      this.resetTransform()
      return true
    },

    prev() {
      if (!this.hasPrev) return false
      this.index -= 1
      this.resetTransform()
      return true
    },

    zoomIn() {
      this.scale = Math.min(this.scale * 1.25, 8)
    },

    zoomOut() {
      this.scale = Math.max(this.scale / 1.25, 0.2)
    },

    toggleFullscreen() {
      this.fullscreen = !this.fullscreen
    },
  },
})

export default useImageViewerStore
