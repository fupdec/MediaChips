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
/** Gap between cursor and hover card. */
export const HOVER_CARD_GAP = 14
/** Minimum distance from viewport edges. */
export const HOVER_CARD_MARGIN = 8
/** Conservative initial height for tag cards before real measure. */
export const TAG_HOVER_ESTIMATED_HEIGHT = 168
/** @deprecated use HOVER_CARD_WIDTH */
export const TAG_HOVER_CARD_WIDTH = HOVER_CARD_WIDTH

export type HoverPositionInput = {
  anchorX: number
  anchorY: number
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  gap?: number
  margin?: number
}

export type HoverPositionResult = {
  x: number
  y: number
  width: number
  height: number
  maxHeight: number
}

/**
 * Place a hover card near the cursor, flipping when needed, then clamping
 * so the card always stays fully inside the viewport.
 */
export function clampHoverPosition(input: HoverPositionInput): HoverPositionResult {
  const gap = input.gap ?? HOVER_CARD_GAP
  const margin = input.margin ?? HOVER_CARD_MARGIN
  const viewportWidth = Math.max(0, input.viewportWidth)
  const viewportHeight = Math.max(0, input.viewportHeight)

  const maxWidth = Math.max(0, viewportWidth - margin * 2)
  const maxHeight = Math.max(0, viewportHeight - margin * 2)
  const width = Math.min(Math.max(0, input.width), maxWidth || input.width)
  const height = Math.min(Math.max(0, input.height), maxHeight || input.height)

  let x = input.anchorX + gap
  let y = input.anchorY + gap

  if (x + width > viewportWidth - margin) {
    x = input.anchorX - width - gap
  }
  if (y + height > viewportHeight - margin) {
    y = input.anchorY - height - gap
  }

  if (maxWidth <= 0) {
    x = margin
  } else {
    x = Math.min(Math.max(margin, x), viewportWidth - width - margin)
  }

  if (maxHeight <= 0) {
    y = margin
  } else {
    y = Math.min(Math.max(margin, y), viewportHeight - height - margin)
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
    maxHeight: Math.round(maxHeight),
  }
}

function applyHoverPosition(
  hover: ReturnType<typeof useAppStore>['hover'],
  width: number,
  height: number,
) {
  const positioned = clampHoverPosition({
    anchorX: hover.anchorX,
    anchorY: hover.anchorY,
    width,
    height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })

  hover.x = positioned.x
  hover.y = positioned.y
  hover.previewWidth = positioned.width
  hover.previewHeight = positioned.height
  hover.maxHeight = positioned.maxHeight
}

/** Recompute card top/left after measured size changes or window resize. */
export function updateHoverPosition(width?: number, height?: number) {
  const store = useAppStore()
  const hover = store.hover
  if (!hover.show) return

  applyHoverPosition(
    hover,
    width ?? hover.previewWidth ?? HOVER_CARD_WIDTH,
    height ?? hover.previewHeight ?? TAG_HOVER_ESTIMATED_HEIGHT,
  )
}

export function showHoverImage(
  event: MouseEvent,
  metaId: number | null,
  tagId: number | null,
  data_type: string,
  options: HoverOptions = {},
) {
  if (event.buttons !== 0) return

  const store = useAppStore()
  const hover = store.hover
  const isMedia = data_type === 'media'
  const tagAspectRatio = options.imageAspectRatio && options.imageAspectRatio > 0
    ? options.imageAspectRatio
    : 1

  const estimated = isMedia
    ? {
      previewWidth: HOVER_CARD_WIDTH,
      previewHeight: 180,
    }
    : {
      previewWidth: HOVER_CARD_WIDTH,
      previewHeight: Math.max(
        TAG_HOVER_ESTIMATED_HEIGHT,
        formatUtils.getTagHoverPreviewDimensions('avatar', tagAspectRatio, HOVER_CARD_WIDTH).previewHeight,
      ),
    }

  hover.delay = Date.now()
  hover.anchorX = event.clientX
  hover.anchorY = event.clientY

  clearTimeout(hover.timeout as ReturnType<typeof setTimeout>)

  hover.timeout = window.setTimeout(() => {
    hover.show = true
    hover.tagId = tagId
    hover.metaId = metaId
    hover.data_type = data_type || 'meta'
    hover.label = options.label?.trim() || null
    hover.imageAspectRatio = isMedia ? null : tagAspectRatio
    hover.mediaWidth = isMedia ? (options.width ?? null) : null
    hover.mediaHeight = isMedia ? (options.height ?? null) : null
    hover.isVideo = isMedia ? Boolean(options.isVideo) : false
    applyHoverPosition(hover, estimated.previewWidth, estimated.previewHeight)
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
  store.hover.maxHeight = 0
  store.hover.anchorX = 0
  store.hover.anchorY = 0
  store.hover.x = 0
  store.hover.y = 0
}
