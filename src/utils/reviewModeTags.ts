import orderBy from 'lodash/orderBy'
import {
  REVIEW_TAG_KEY_LABELS,
  REVIEW_TAG_KEYS,
  type ReviewTagSlot,
} from '@/stores/reviewMode'

type TagLike = {
  id?: number | string | null
  metaId?: number | string | null
  name?: string | null
  favorite?: boolean | number | string | null
  views?: number | null
  color?: string | null
}

function isTruthyFavorite(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

/**
 * Build up to 9 quick-tag slots from favorite tags (views desc, then name).
 * Keys: Q W E R T Y U I O.
 */
export function buildReviewTagSlots(tags: TagLike[] = []): ReviewTagSlot[] {
  const favorites = tags.filter((tag) => {
    const id = Number(tag.id)
    const metaId = Number(tag.metaId)
    return isTruthyFavorite(tag.favorite)
      && Number.isFinite(id) && id > 0
      && Number.isFinite(metaId) && metaId > 0
      && String(tag.name || '').trim()
  })

  const sorted = orderBy(
    favorites,
    [
      (tag) => Number(tag.views) || 0,
      (tag) => String(tag.name || '').toLowerCase(),
    ],
    ['desc', 'asc'],
  )

  return sorted.slice(0, REVIEW_TAG_KEYS.length).map((tag, index) => {
    const key = REVIEW_TAG_KEYS[index]
    return {
      key,
      label: REVIEW_TAG_KEY_LABELS[key],
      tagId: Number(tag.id),
      metaId: Number(tag.metaId),
      name: String(tag.name || '').trim(),
      color: tag.color ?? null,
    }
  })
}

export function findReviewTagSlot(
  slots: ReviewTagSlot[],
  code: string,
): ReviewTagSlot | null {
  return slots.find((slot) => slot.key === code) ?? null
}
