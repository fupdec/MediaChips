import { useAppStore } from '@/stores/app'
import * as formatUtils from '@/services/formatUtils'

interface HoverOptions {
  width?: number
  height?: number
  isVideo?: boolean
  label?: string
  imageAspectRatio?: number
}

export const HOVER_CARD_WIDTH = 300
/** @deprecated use HOVER_CARD_WIDTH */
export const TAG_HOVER_CARD_WIDTH = HOVER_CARD_WIDTH

export function showHoverImage(
  event: MouseEvent,
  metaId: number | null,
  tagId: number | null,
  data_type: string,
  options: HoverOptions = {},
) {
  if (event.buttons !== 0) return

  const store = useAppStore()

  let x = event.clientX
  let y = event.clientY
  const offset = 30
  const isMedia = data_type === 'media'
  const tagAspectRatio = options.imageAspectRatio && options.imageAspectRatio > 0
    ? options.imageAspectRatio
    : 1
  const { previewWidth, previewHeight } = isMedia
    ? {
      previewWidth: HOVER_CARD_WIDTH,
      previewHeight: 120,
    }
    : formatUtils.getTagHoverPreviewDimensions('avatar', tagAspectRatio, HOVER_CARD_WIDTH)

  const appHeight = window.innerHeight
  const appWidth = window.innerWidth

  if (appWidth < x + previewWidth + offset) x -= previewWidth + offset
  if (appHeight < y + previewHeight + offset) y -= previewHeight + offset

  const hover = store.hover
  hover.delay = Date.now()

  clearTimeout(hover.timeout as ReturnType<typeof setTimeout>)

  hover.timeout = window.setTimeout(() => {
    hover.x = x
    hover.y = y
    hover.previewWidth = previewWidth
    hover.previewHeight = previewHeight
    hover.show = true
    hover.tagId = tagId
    hover.metaId = metaId
    hover.data_type = data_type || 'meta'
    hover.label = options.label?.trim() || null
    hover.imageAspectRatio = isMedia ? null : tagAspectRatio
    hover.mediaWidth = isMedia ? (options.width ?? null) : null
    hover.mediaHeight = isMedia ? (options.height ?? null) : null
    hover.isVideo = isMedia ? Boolean(options.isVideo) : false
  }, 500)

  window.setTimeout(() => {
    if (Date.now() - hover.delay > 4500) hover.show = false
  }, 5000)
}

export function hideHoverImage() {
  const store = useAppStore()
  clearTimeout(store.hover.timeout as ReturnType<typeof setTimeout>)
  store.hover.show = false
  store.hover.label = null
  store.hover.imageAspectRatio = null
  store.hover.mediaWidth = null
  store.hover.mediaHeight = null
  store.hover.isVideo = false
  store.hover.previewWidth = 180
  store.hover.previewHeight = 180
}
