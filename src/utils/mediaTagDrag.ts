export const MEDIA_TAG_DRAG_MIME = 'application/x-mediachips-media-tag'

export type MediaTagDragPayload = {
  tagId: number
  metaId: number
  sourceMediaId: number
  name?: string
}

let mediaTagDragActive = false
const listeners = new Set<(active: boolean) => void>()

function notifyListeners() {
  for (const listener of listeners) {
    listener(mediaTagDragActive)
  }
}

export function isMediaTagDragActive(): boolean {
  return mediaTagDragActive
}

export function setMediaTagDragActive(active: boolean) {
  if (mediaTagDragActive === active) return
  mediaTagDragActive = active
  notifyListeners()
}

export function onMediaTagDragChange(listener: (active: boolean) => void): () => void {
  listeners.add(listener)
  listener(mediaTagDragActive)
  return () => {
    listeners.delete(listener)
  }
}

export function encodeMediaTagDragPayload(payload: MediaTagDragPayload): string {
  return JSON.stringify({
    tagId: Number(payload.tagId),
    metaId: Number(payload.metaId),
    sourceMediaId: Number(payload.sourceMediaId),
    name: payload.name ? String(payload.name) : undefined,
  })
}

export function parseMediaTagDragPayload(raw: string | null | undefined): MediaTagDragPayload | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const data = JSON.parse(raw) as Partial<MediaTagDragPayload>
    const tagId = Number(data.tagId)
    const metaId = Number(data.metaId)
    const sourceMediaId = Number(data.sourceMediaId)
    if (!Number.isFinite(tagId) || tagId <= 0) return null
    if (!Number.isFinite(metaId) || metaId <= 0) return null
    if (!Number.isFinite(sourceMediaId) || sourceMediaId <= 0) return null
    return {
      tagId,
      metaId,
      sourceMediaId,
      name: data.name ? String(data.name) : undefined,
    }
  } catch {
    return null
  }
}

export function isMediaTagDragEvent(event: Pick<DragEvent, 'dataTransfer'> | null | undefined): boolean {
  const transfer = event?.dataTransfer
  if (!transfer) return false
  const types = Array.from(transfer.types || []).map((type) => String(type).toLowerCase())
  return types.includes(MEDIA_TAG_DRAG_MIME)
}

export function readMediaTagDragPayload(event: Pick<DragEvent, 'dataTransfer'> | null | undefined): MediaTagDragPayload | null {
  const transfer = event?.dataTransfer
  if (!transfer) return null
  return parseMediaTagDragPayload(transfer.getData(MEDIA_TAG_DRAG_MIME) || transfer.getData('text/plain'))
}

export function writeMediaTagDragPayload(event: DragEvent, payload: MediaTagDragPayload): boolean {
  const transfer = event.dataTransfer
  if (!transfer) return false
  const encoded = encodeMediaTagDragPayload(payload)
  transfer.setData(MEDIA_TAG_DRAG_MIME, encoded)
  transfer.setData('text/plain', encoded)
  transfer.effectAllowed = 'copyMove'
  setMediaTagDragActive(true)
  return true
}

export function clearMediaTagDrag() {
  setMediaTagDragActive(false)
}
