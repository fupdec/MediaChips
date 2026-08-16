import { isImageMediaType, isVideoMediaType } from '@/utils/mediaType'
import type { MediaType } from '@/types/media'

export function normalizeItemsView(
  view: number | string | null | undefined,
  itemsType: 'media' | 'tag',
  mediaType?: MediaType | null,
): number {
  const value = Number(view) || 1

  if (itemsType === 'media') {
    // List view is available for every media type.
    if (value === 5) return 5

    if (isVideoMediaType(mediaType)) {
      if (value === 2 || value === 4) return value
      return 1
    }

    if (isImageMediaType(mediaType)) {
      return value === 3 ? 3 : 1
    }

    return 1
  }

  if (itemsType === 'tag') {
    if (value === 2 || value === 4 || value === 5) return value
    return 1
  }

  return 1
}

/** Minimal grid: thumbnail with filename under the card (video + tags). */
export function isImageOnlyItemsView(view: number | string | null | undefined): boolean {
  return Number(view) === 4
}
