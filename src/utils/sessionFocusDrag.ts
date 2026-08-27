import {
  normalizeSessionFocusTag,
  type SessionFocusTag,
} from '@/stores/sessionFocus'
import {
  MEDIA_TAG_DRAG_MIME,
  encodeMediaTagDragPayload,
  parseMediaTagDragPayload,
  setMediaTagDragActive,
  type MediaTagDragPayload,
} from '@/utils/mediaTagDrag'

export const SESSION_FOCUS_TAGS_DRAG_MIME = 'application/x-mediachips-session-focus-tags'

export function sessionFocusTagFromMediaPayload(payload: MediaTagDragPayload): SessionFocusTag | null {
  return normalizeSessionFocusTag({
    tagId: payload.tagId,
    metaId: payload.metaId,
    name: payload.name || '',
    icon: payload.icon,
    color: payload.color,
  })
}

export function encodeSessionFocusTagsPayload(tags: SessionFocusTag[]): string {
  return JSON.stringify(tags.map((tag) => ({
    tagId: tag.tagId,
    metaId: tag.metaId,
    name: tag.name,
    icon: tag.icon ?? null,
    color: tag.color ?? null,
  })))
}

export function parseSessionFocusTagsPayload(raw: string | null | undefined): SessionFocusTag[] {
  if (!raw || typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const list = Array.isArray(parsed) ? parsed : [parsed]
    return list
      .map((entry) => normalizeSessionFocusTag(entry as Partial<SessionFocusTag>))
      .filter((tag): tag is SessionFocusTag => Boolean(tag))
  } catch {
    return []
  }
}

export function isSessionFocusTagsDragEvent(
  event: Pick<DragEvent, 'dataTransfer'> | null | undefined,
): boolean {
  const transfer = event?.dataTransfer
  if (!transfer) return false
  const types = Array.from(transfer.types || []).map((type) => String(type).toLowerCase())
  return types.includes(SESSION_FOCUS_TAGS_DRAG_MIME) || types.includes(MEDIA_TAG_DRAG_MIME)
}

export function readSessionFocusTagsDrag(
  event: Pick<DragEvent, 'dataTransfer'> | null | undefined,
): SessionFocusTag[] {
  const transfer = event?.dataTransfer
  if (!transfer) return []
  const fromTray = parseSessionFocusTagsPayload(
    transfer.getData(SESSION_FOCUS_TAGS_DRAG_MIME) || '',
  )
  if (fromTray.length) return fromTray
  const media = parseMediaTagDragPayload(
    transfer.getData(MEDIA_TAG_DRAG_MIME) || transfer.getData('text/plain'),
  )
  const tag = media ? sessionFocusTagFromMediaPayload(media) : null
  return tag ? [tag] : []
}

/** Write only the tray MIME — does not clobber text/plain used by other drop targets. */
export function writeSessionFocusTagsMime(event: DragEvent, tags: SessionFocusTag[]): boolean {
  const transfer = event.dataTransfer
  if (!transfer || !tags.length) return false
  transfer.setData(SESSION_FOCUS_TAGS_DRAG_MIME, encodeSessionFocusTagsPayload(tags))
  setMediaTagDragActive(true)
  return true
}

export function writeSessionFocusTagsDrag(event: DragEvent, tags: SessionFocusTag[]): boolean {
  const transfer = event.dataTransfer
  if (!transfer || !tags.length) return false
  const encoded = encodeSessionFocusTagsPayload(tags)
  transfer.setData(SESSION_FOCUS_TAGS_DRAG_MIME, encoded)
  const first = tags[0]
  transfer.setData(MEDIA_TAG_DRAG_MIME, encodeMediaTagDragPayload({
    tagId: first.tagId,
    metaId: first.metaId,
    sourceMediaId: 0,
    name: first.name,
    icon: first.icon,
    color: first.color,
  }))
  transfer.setData('text/plain', encoded)
  transfer.effectAllowed = 'copy'
  setMediaTagDragActive(true)
  return true
}
