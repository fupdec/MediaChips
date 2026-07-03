import { isImageMediaType, isVideoMediaType } from '@/utils/mediaType'
import type { MediaType } from '@/types/media'

export function normalizeItemsView(
  view: number | string | null | undefined,
  itemsType: 'media' | 'tag',
  mediaType?: MediaType | null,
): number {
  const value = Number(view) || 1

  if (itemsType === 'media') {
    if (isVideoMediaType(mediaType)) {
      return value === 2 ? 2 : 1
    }

    if (isImageMediaType(mediaType)) {
      return value === 3 ? 3 : 1
    }

    return 1
  }

  if (itemsType === 'tag') {
    return value === 2 ? 2 : 1
  }

  return 1
}
