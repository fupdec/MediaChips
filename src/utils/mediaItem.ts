import type { MediaItem, PlayableMedia } from '@shared/entities/media'

export function toPlayableMediaItem(
  item?: { id?: number; path?: string; name?: string; basename?: string } | null,
): PlayableMedia | null {
  if (item?.id == null) return null
  return {
    id: Number(item.id),
    path: item.path,
    name: item.name ?? item.basename,
  }
}

export function playlistItemKey(item: PlayableMedia | MediaItem, index?: number): string {
  if (item.key) return String(item.key)
  if (item.markId != null) return `clip-${item.markId}`
  if (index != null) return `${item.id}-${index}`
  return String(item.id)
}

export function getSegmentStart(item: PlayableMedia | MediaItem | null | undefined): number | undefined {
  if (!item) return undefined
  // Do not use `item.time` — that is resume/watch position and gets overwritten.
  const start = Number(item.segmentStart)
  if (Number.isFinite(start)) return start
  return undefined
}

export function isClipPlaylistItem(item: PlayableMedia | MediaItem | null | undefined): boolean {
  if (!item) return false
  return item.markId != null || getSegmentStart(item) != null
}

export function getSegmentEnd(item: PlayableMedia | MediaItem | null | undefined): number | undefined {
  if (!item) return undefined
  const end = Number(item.segmentEnd)
  if (Number.isFinite(end)) return end
  return undefined
}

export function mergeClipFields(
  target: MediaItem,
  source: PlayableMedia | MediaItem | null | undefined,
): MediaItem {
  if (!source || !isClipPlaylistItem(source)) return target
  return {
    ...target,
    markId: source.markId ?? target.markId,
    segmentStart: getSegmentStart(source) ?? getSegmentStart(target),
    segmentEnd: getSegmentEnd(source) ?? getSegmentEnd(target),
    key: source.key || target.key || playlistItemKey(source),
  }
}

export function ensureMediaItem(item: PlayableMedia): MediaItem {
  const key = playlistItemKey(item)
  return {
    id: item.id,
    path: item.path,
    name: item.name,
    basename: item.basename,
    mediaTypeId: item.mediaTypeId,
    duration: item.duration,
    thumb: item.thumb,
    time: item.time,
    markId: item.markId,
    segmentStart: item.segmentStart,
    segmentEnd: item.segmentEnd,
    key,
  }
}
