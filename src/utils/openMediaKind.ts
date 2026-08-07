import type {MediaType} from '@/types/stores'
import {
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
import {isInAppTextPreviewPath} from '@/utils/textPreview'

export type OpenMediaKind =
  | 'play-av'
  | 'view-image'
  | 'preview-text'
  | 'open-path'
  | 'browse-list'

/**
 * Decide how to open a media item from home / hotkeys / search.
 * `missingAsPlay` matches browser hotkeys (unknown type → builtin player).
 * Pass `path` so text media can open in-app preview for txt/html/md.
 */
export function resolveOpenMediaKind(
  mediaType: MediaType | null | undefined,
  {
    missingAsPlay = false,
    path,
  }: {
    missingAsPlay?: boolean
    path?: string | null
  } = {},
): OpenMediaKind {
  if (isImageMediaType(mediaType)) return 'view-image'
  if (isTextMediaType(mediaType)) {
    return isInAppTextPreviewPath(path) ? 'preview-text' : 'open-path'
  }
  if (isVideoMediaType(mediaType) || isAudioMediaType(mediaType)) return 'play-av'
  if (!mediaType && missingAsPlay) return 'play-av'
  return 'browse-list'
}
