export type MediaDragGhostOptions = {
  cardEl?: HTMLElement | null
  title?: string | null
  count?: number
  /** Local filesystem thumb path — loaded via sync IPC when DOM image is CORS-tainted. */
  thumbPath?: string | null
  /** CSS pixels of the front card (before devicePixelRatio). */
  width?: number
  height?: number
}

const DEFAULT_WIDTH = 75
const DEFAULT_HEIGHT = 57
const RADIUS = 7
const STACK_OFFSET = 5
const TITLE_BAR = 14
const CARD_BORDER = 'rgba(255, 255, 255, 0.55)'
const STACK_FILL = ['#a3a3ae'] as const
const STACK_BORDER = 'rgba(255, 255, 255, 0.4)'

function findPreviewImage(cardEl: HTMLElement | null | undefined): HTMLImageElement | null {
  if (!cardEl) return null
  const images = cardEl.querySelectorAll('img')
  for (const img of Array.from(images)) {
    if (img.complete && img.naturalWidth > 0 && img.naturalHeight > 0) {
      return img
    }
  }
  return null
}

/** Returns the image only if it can be drawn to a canvas and exported (not CORS-tainted). */
function getExportablePreviewImage(image: HTMLImageElement | null): HTMLImageElement | null {
  if (!image) return null
  try {
    const probe = document.createElement('canvas')
    probe.width = 8
    probe.height = 8
    const ctx = probe.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(image, 0, 0, 8, 8)
    probe.toDataURL('image/png')
    return image
  } catch {
    return null
  }
}

/** Sync-load a local thumb via Electron IPC into an Image (data: URLs often complete sync). */
function loadThumbImageFromPathSync(thumbPath: string | null | undefined): HTMLImageElement | null {
  if (!thumbPath || typeof window === 'undefined') return null
  const read = window.mediaDragAPI?.readLocalDataUrl
  if (typeof read !== 'function') return null

  let dataUrl: string | null = null
  try {
    dataUrl = read(thumbPath)
  } catch {
    return null
  }
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return null

  const img = new Image()
  img.src = dataUrl
  if (!img.complete || img.naturalWidth <= 0 || img.naturalHeight <= 0) return null
  return img
}

function resolveGhostImage(
  cardEl: HTMLElement | null | undefined,
  thumbPath: string | null | undefined,
): HTMLImageElement | null {
  return getExportablePreviewImage(findPreviewImage(cardEl))
    || loadThumbImageFromPathSync(thumbPath)
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  sourceWidth: number,
  sourceHeight: number,
) {
  if (!sourceWidth || !sourceHeight) return
  const scale = Math.max(w / sourceWidth, h / sourceHeight)
  const sw = w / scale
  const sh = h / scale
  const sx = (sourceWidth - sw) / 2
  const sy = (sourceHeight - sh) / 2
  ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h)
}

function truncateTitle(ctx: CanvasRenderingContext2D, title: string, maxWidth: number): string {
  if (ctx.measureText(title).width <= maxWidth) return title
  const ellipsis = '…'
  let low = 0
  let high = title.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const candidate = `${title.slice(0, mid)}${ellipsis}`
    if (ctx.measureText(candidate).width <= maxWidth) low = mid
    else high = mid - 1
  }
  return low > 0 ? `${title.slice(0, low)}${ellipsis}` : ellipsis
}

function drawStackLayer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
) {
  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.18)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetY = 2
  roundRect(ctx, x, y, w, h, RADIUS)
  ctx.fillStyle = fill
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, RADIUS)
  ctx.strokeStyle = STACK_BORDER
  ctx.lineWidth = 1.25
  ctx.stroke()
  ctx.restore()
}

function drawCardFace(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  image: HTMLImageElement | null,
  title: string,
) {
  const mediaH = Math.max(16, h - TITLE_BAR)

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.28)'
  ctx.shadowBlur = 8
  ctx.shadowOffsetY = 3

  // Clip the entire card (including title bar) so bottom corners stay rounded.
  roundRect(ctx, x, y, w, h, RADIUS)
  ctx.fillStyle = '#1c1c1f'
  ctx.fill()
  ctx.clip()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  if (image) {
    // Prefer high-quality resampling when available (sharper thumbs at small size).
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    drawCoverImage(ctx, image, x, y, w, mediaH, image.naturalWidth, image.naturalHeight)
  } else {
    const gradient = ctx.createLinearGradient(x, y, x + w, y + mediaH)
    gradient.addColorStop(0, '#3f3f46')
    gradient.addColorStop(1, '#27272a')
    ctx.fillStyle = gradient
    ctx.fillRect(x, y, w, mediaH)
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.font = '600 22px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('▶', x + w / 2, y + mediaH / 2)
    ctx.textAlign = 'left'
  }

  ctx.fillStyle = '#25252a'
  ctx.fillRect(x, y + mediaH, w, h - mediaH)

  ctx.fillStyle = 'rgba(255,255,255,0.92)'
  ctx.font = '600 6.5px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  ctx.textBaseline = 'middle'
  const padding = 5
  const label = truncateTitle(ctx, title || 'Media', w - padding * 2)
  ctx.fillText(label, x + padding, y + mediaH + (h - mediaH) / 2)

  ctx.restore()

  // Border after restore so it follows the rounded path.
  ctx.save()
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, RADIUS)
  ctx.strokeStyle = CARD_BORDER
  ctx.lineWidth = 1.25
  ctx.stroke()
  ctx.restore()
}

function drawCountBadge(
  ctx: CanvasRenderingContext2D,
  count: number,
  cardX: number,
  cardY: number,
  cardW: number,
) {
  const label = count > 99 ? '99+' : String(count)
  ctx.font = '700 7px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
  const textW = ctx.measureText(label).width
  const padX = 5
  const badgeH = 14
  const badgeW = Math.max(14, textW + padX * 2)
  const x = cardX + cardW - badgeW + 4
  const y = cardY - 4

  ctx.save()
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)'
  ctx.shadowBlur = 4
  ctx.shadowOffsetY = 1
  roundRect(ctx, x, y, badgeW, badgeH, badgeH / 2)
  ctx.fillStyle = '#3b82f6'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.fillStyle = '#fff'
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  ctx.fillText(label, x + badgeW / 2, y + badgeH / 2 + 0.5)
  ctx.textAlign = 'left'
  ctx.restore()
}

/**
 * Build a PNG data-URL ghost for Electron startDrag.
 * Must stay synchronous (called from dragstart).
 */
export function buildMediaDragGhostDataUrl(options: MediaDragGhostOptions = {}): string | null {
  if (typeof document === 'undefined') return null

  const width = Math.max(48, options.width ?? DEFAULT_WIDTH)
  const height = Math.max(36, options.height ?? DEFAULT_HEIGHT)
  const count = Math.max(1, Math.floor(options.count ?? 1))
  const stackLayers = count > 1 ? 1 : 0
  const title = String(options.title ?? '').trim() || 'Media'
  const image = resolveGhostImage(options.cardEl, options.thumbPath)

  // Always render at least @2x for a sharper drag icon at the smaller size.
  const dpr = typeof window !== 'undefined' ? Math.max(2, Math.min(3, window.devicePixelRatio || 2)) : 2
  const pad = 8
  const canvasW = width + stackLayers * STACK_OFFSET + pad * 2
  const canvasH = height + stackLayers * STACK_OFFSET + pad * 2 + (count > 1 ? 6 : 0)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(canvasW * dpr)
  canvas.height = Math.round(canvasH * dpr)

  const ctx = canvas.getContext('2d')
  if (!ctx || typeof ctx.fillRect !== 'function') return null
  ctx.scale(dpr, dpr)

  const frontX = pad
  const frontY = pad + (count > 1 ? 2 : 0)

  for (let i = stackLayers; i >= 1; i -= 1) {
    drawStackLayer(
      ctx,
      frontX + i * STACK_OFFSET,
      frontY + i * STACK_OFFSET,
      width,
      height,
      STACK_FILL[0],
    )
  }

  drawCardFace(ctx, frontX, frontY, width, height, image, title)

  if (count > 1) {
    drawCountBadge(ctx, count, frontX, frontY, width)
  }

  try {
    const dataUrl = canvas.toDataURL('image/png')
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/png')) return null
    return dataUrl
  } catch {
    return null
  }
}
