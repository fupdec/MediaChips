import { useAppStore } from '@/stores/app'
import * as formatUtils from '@/services/formatUtils'

interface HoverOptions {
  width?: number
  height?: number
  isVideo?: boolean
  label?: string
  imageAspectRatio?: number
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

  let x = event.clientX
  let y = event.clientY
  const offset = 30
  const isMedia = data_type === 'media'
  const tagAspectRatio = options.imageAspectRatio && options.imageAspectRatio > 0
    ? options.imageAspectRatio
    : 1
  const { previewWidth, previewHeight } = isMedia
    ? formatUtils.getHoverPreviewDimensions(options.width || 0, options.height || 0, {
      maxSize: 180,
      defaultRatio: options.isVideo ? 16 / 9 : 1,
    })
    : formatUtils.getTagHoverPreviewDimensions('avatar', tagAspectRatio)

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
  store.hover.previewWidth = 180
  store.hover.previewHeight = 180
}
