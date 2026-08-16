import { useAppStore } from '@/stores/app'
import * as formatUtils from '@/services/formatUtils'
import { getMainScrollEl } from '@/utils/mainScroll'

let cardMetaScrollCleanup: (() => void) | null = null

function clearCardMetaScrollGuard() {
  cardMetaScrollCleanup?.()
  cardMetaScrollCleanup = null
}

function armCardMetaScrollGuard() {
  clearCardMetaScrollGuard()
  const scrollEl = getMainScrollEl()
  if (!(scrollEl instanceof HTMLElement)) return
  const onScroll = () => {
    hideHoverImage()
  }
  scrollEl.addEventListener('scroll', onScroll, {passive: true})
  cardMetaScrollCleanup = () => {
    scrollEl.removeEventListener('scroll', onScroll)
  }
}

interface HoverOptions {
  width?: number
  height?: number
  isVideo?: boolean
  label?: string
  imageAspectRatio?: number
}

export type HoverAnchorMode = 'cursor' | 'card'

export type CardRectLike = {
  top: number
  left: number
  width: number
  height: number
  right?: number
  bottom?: number
}

interface CardHoverMetaOptions extends HoverOptions {
  delayMs?: number
  /** Preferred plate width; falls back to card-anchored estimate. */
  plateWidth?: number
}

export const HOVER_CARD_WIDTH = 300
/** Wider plate for grid card meta (title + pinned fields). */
export const CARD_META_PLATE_WIDTH = 360
export const CARD_META_PLATE_MAX_WIDTH = 420
/** Gap between cursor and hover card. */
export const HOVER_CARD_GAP = 14
/** Gap between grid card and meta plate. */
export const CARD_META_PLATE_GAP = 12
/** Minimum distance from viewport edges. */
export const HOVER_CARD_MARGIN = 8
/** Conservative initial height for tag cards before real measure. */
export const TAG_HOVER_ESTIMATED_HEIGHT = 168
/** Initial estimate before MediaHoverCard measures itself. */
export const CARD_META_PLATE_ESTIMATED_HEIGHT = 220
/** Default delay before showing the card-anchored meta plate. */
export const CARD_META_PLATE_DELAY_MS = 400
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

export type CardAnchoredPositionInput = {
  cardRect: CardRectLike
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

/**
 * Place a meta plate beside a grid card: prefer right, then left, then below/above.
 * Top-align with the card when possible; clamp into the viewport.
 */
export function clampCardAnchoredPosition(
  input: CardAnchoredPositionInput,
): HoverPositionResult {
  const gap = input.gap ?? CARD_META_PLATE_GAP
  const margin = input.margin ?? HOVER_CARD_MARGIN
  const viewportWidth = Math.max(0, input.viewportWidth)
  const viewportHeight = Math.max(0, input.viewportHeight)
  const card = input.cardRect

  const maxWidth = Math.max(0, viewportWidth - margin * 2)
  const maxHeight = Math.max(0, viewportHeight - margin * 2)
  const width = Math.min(Math.max(0, input.width), maxWidth || input.width)
  const height = Math.min(Math.max(0, input.height), maxHeight || input.height)

  const cardRight = card.right ?? (card.left + card.width)
  const cardBottom = card.bottom ?? (card.top + card.height)
  const spaceRight = viewportWidth - margin - cardRight
  const spaceLeft = card.left - margin

  let x: number
  if (spaceRight >= width + gap || spaceRight >= spaceLeft) {
    x = cardRight + gap
    if (x + width > viewportWidth - margin) {
      x = card.left - width - gap
    }
  } else {
    x = card.left - width - gap
  }

  let y = card.top
  if (y + height > viewportHeight - margin) {
    y = Math.max(margin, viewportHeight - margin - height)
  }
  // If still overlapping vertically poorly, try below / above the card.
  if (y + height > viewportHeight - margin || y < margin) {
    const below = cardBottom + gap
    const above = card.top - height - gap
    if (below + height <= viewportHeight - margin) {
      y = below
      x = Math.min(
        Math.max(margin, card.left),
        Math.max(margin, viewportWidth - width - margin),
      )
    } else if (above >= margin) {
      y = above
      x = Math.min(
        Math.max(margin, card.left),
        Math.max(margin, viewportWidth - width - margin),
      )
    }
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

export function resolveCardMetaPlateWidth(cardWidth: number): number {
  const preferred = Math.round(cardWidth * 1.35)
  return Math.min(
    CARD_META_PLATE_MAX_WIDTH,
    Math.max(HOVER_CARD_WIDTH, preferred || CARD_META_PLATE_WIDTH),
  )
}

function snapshotCardRect(rect: CardRectLike): CardRectLike {
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    right: rect.right ?? (rect.left + rect.width),
    bottom: rect.bottom ?? (rect.top + rect.height),
  }
}

function applyHoverPosition(
  hover: ReturnType<typeof useAppStore>['hover'],
  width: number,
  height: number,
) {
  const positioned = hover.anchorMode === 'card' && hover.anchorRect
    ? clampCardAnchoredPosition({
      cardRect: hover.anchorRect,
      width,
      height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })
    : clampHoverPosition({
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
        formatUtils.getTagHoverPreviewDimensions('main', tagAspectRatio, HOVER_CARD_WIDTH).previewHeight,
      ),
    }

  hover.delay = Date.now()
  hover.anchorMode = 'cursor'
  hover.anchorRect = null
  hover.anchorX = event.clientX
  hover.anchorY = event.clientY

  clearTimeout(hover.timeout as ReturnType<typeof setTimeout>)
  clearCardMetaScrollGuard()

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

/**
 * Show MediaHoverCard anchored to a grid media card (outside the virtual row).
 * Stays open until hideHoverImage — no short auto-dismiss timer.
 */
export function showCardHoverMetaPlate(
  cardEl: HTMLElement,
  mediaTypeId: number,
  mediaId: number,
  options: CardHoverMetaOptions = {},
) {
  const store = useAppStore()
  const hover = store.hover
  const rect = snapshotCardRect(cardEl.getBoundingClientRect())
  const plateWidth = options.plateWidth ?? resolveCardMetaPlateWidth(rect.width)
  const delayMs = Math.max(0, options.delayMs ?? CARD_META_PLATE_DELAY_MS)

  hover.delay = Date.now()
  hover.anchorMode = 'card'
  hover.anchorRect = rect
  hover.anchorX = rect.left + rect.width / 2
  hover.anchorY = rect.top + rect.height / 2

  clearTimeout(hover.timeout as ReturnType<typeof setTimeout>)

  hover.timeout = window.setTimeout(() => {
    // Card may have been virtualized away.
    if (!cardEl.isConnected) return
    hover.anchorRect = snapshotCardRect(cardEl.getBoundingClientRect())
    hover.show = true
    hover.tagId = mediaId
    hover.metaId = mediaTypeId
    hover.data_type = 'media'
    hover.label = options.label?.trim() || null
    hover.imageAspectRatio = null
    hover.mediaWidth = options.width ?? null
    hover.mediaHeight = options.height ?? null
    hover.isVideo = Boolean(options.isVideo)
    applyHoverPosition(hover, plateWidth, CARD_META_PLATE_ESTIMATED_HEIGHT)
    armCardMetaScrollGuard()
  }, delayMs)
}

export function hideHoverImage() {
  const store = useAppStore()
  clearTimeout(store.hover.timeout as ReturnType<typeof setTimeout>)
  clearCardMetaScrollGuard()
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
  store.hover.anchorMode = 'cursor'
  store.hover.anchorRect = null
  store.hover.x = 0
  store.hover.y = 0
  store.hover.data_type = null
  store.hover.tagId = null
  store.hover.metaId = null
}
