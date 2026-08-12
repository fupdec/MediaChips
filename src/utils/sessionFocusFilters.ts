import {getFilterObject} from '@/services/formatUtils'
import type {FilterObject} from '@/types/common'
import type {SessionFocusTag} from '@/stores/sessionFocus'

export function buildSessionFocusWithTagFilters(tag: SessionFocusTag): FilterObject[] {
  return [
    getFilterObject({
      param: tag.metaId,
      type: 'array',
      cond: 'in all',
      lock: false,
      val: [tag.tagId],
      note: 'session-focus-with',
    }),
  ]
}

/** Media that does not yet have the focus tag — useful for tagging sessions. */
export function buildSessionFocusWithoutTagFilters(tag: SessionFocusTag): FilterObject[] {
  return [
    getFilterObject({
      param: tag.metaId,
      type: 'array',
      cond: 'not in',
      lock: false,
      val: [tag.tagId],
      note: 'session-focus-without',
    }),
  ]
}
