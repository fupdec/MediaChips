import type {MediaType} from '@/types/stores'
import {
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'

export type OpenMediaKind =
  | 'play-av'
  | 'view-image'
  | 'open-path'
  | 'browse-list'

/**
 * Decide how to open a media item from home / hotkeys / search.
 * `missingAsPlay` matches browser hotkeys (unknown type → builtin player).
 */
export function resolveOpenMediaKind(
  mediaType: MediaType | null | undefined,
  {missingAsPlay = false}: {missingAsPlay?: boolean} = {},
): OpenMediaKind {
  if (isImageMediaType(mediaType)) return 'view-image'
  if (isTextMediaType(mediaType)) return 'open-path'
  if (isVideoMediaType(mediaType) || isAudioMediaType(mediaType)) return 'play-av'
  if (!mediaType && missingAsPlay) return 'play-av'
  return 'browse-list'
}
