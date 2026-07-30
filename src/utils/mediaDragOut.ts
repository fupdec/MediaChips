import type { MediaItem } from '@shared/entities/media'

type MediaLookup = {
  getItemById?: (id: number) => MediaItem | undefined
  itemsOnPage?: MediaItem[]
  entities?: MediaItem[]
}

/** Renderer-side mirror of preload outbound flag (macOS startDrag returns early). */
let outboundDragActive = false
const outboundListeners = new Set<(active: boolean) => void>()

function notifyOutboundListeners() {
  for (const listener of outboundListeners) {
    listener(outboundDragActive)
  }
}

export function isOutboundMediaDragActive(): boolean {
  return outboundDragActive || Boolean(window.mediaDragAPI?.isOutboundDrag?.())
}

export function setOutboundMediaDragActive(active: boolean) {
  if (outboundDragActive === active) return
  outboundDragActive = active
  notifyOutboundListeners()
}

export function onOutboundMediaDragChange(listener: (active: boolean) => void): () => void {
  outboundListeners.add(listener)
  listener(outboundDragActive)
  return () => {
    outboundListeners.delete(listener)
  }
}

function armOutboundDragClear() {
  const clear = () => {
    setOutboundMediaDragActive(false)
    window.mediaDragAPI?.endOutboundDrag?.()
    window.removeEventListener('mouseup', clear, true)
    window.removeEventListener('mousedown', clear, true)
    document.removeEventListener('dragend', clear, true)
    document.removeEventListener('drop', clear, true)
  }

  // Do not clear on blur: hovering Finder mid-drag blurs the window and would
  // re-enable the drop-in overlay when the cursor returns to the app.
  window.addEventListener('mouseup', clear, true)
  window.addEventListener('mousedown', clear, true)
  document.addEventListener('dragend', clear, true)
  document.addEventListener('drop', clear, true)
}

function pathFromMedia(item: MediaItem | null | undefined): string | null {
  const path = typeof item?.path === 'string' ? item.path.trim() : ''
  return path.length > 0 ? path : null
}

/**
 * Paths to drag out of the app. If the dragged card is in the current selection,
 * include every selected media path; otherwise only the card itself.
 */
export function collectMediaDragPaths(
  item: MediaItem,
  selection: number[],
  lookup: MediaLookup,
): string[] {
  const ownPath = pathFromMedia(item)
  if (!ownPath) return []

  const selectedIds = Array.isArray(selection) ? selection : []
  const useSelection = selectedIds.length > 0 && selectedIds.includes(item.id)
  if (!useSelection) return [ownPath]

  const paths: string[] = []
  const seen = new Set<string>()

  for (const id of selectedIds) {
    const selected =
      lookup.getItemById?.(id)
      ?? lookup.itemsOnPage?.find((entry) => entry.id === id)
      ?? lookup.entities?.find((entry) => entry.id === id)

    const path = pathFromMedia(selected)
    if (!path || seen.has(path)) continue
    seen.add(path)
    paths.push(path)
  }

  return paths.length > 0 ? paths : [ownPath]
}

export function canNativeMediaDragOut(): boolean {
  return typeof window !== 'undefined' && typeof window.mediaDragAPI?.startDrag === 'function'
}

export function startNativeMediaDragOut(
  paths: string[],
  options?: {
    iconDataUrl?: string | null
    thumbPath?: string | null
    title?: string | null
    count?: number
  },
): boolean {
  if (!canNativeMediaDragOut() || paths.length === 0) return false

  setOutboundMediaDragActive(true)
  window.mediaDragAPI?.beginOutboundDrag?.()
  armOutboundDragClear()

  try {
    const payload: {
      paths: string[]
      iconDataUrl?: string
      thumbPath?: string
      title?: string
      count?: number
    } = { paths }

    if (options?.iconDataUrl) payload.iconDataUrl = options.iconDataUrl
    if (options?.thumbPath) payload.thumbPath = options.thumbPath
    if (options?.title) payload.title = options.title
    if (typeof options?.count === 'number') payload.count = options.count

    window.mediaDragAPI!.startDrag(payload)
  } catch {
    setOutboundMediaDragActive(false)
    window.mediaDragAPI?.endOutboundDrag?.()
    return false
  }

  return true
}
