import {getFilterObject} from '@/services/formatUtils'
import type {FilterObject} from '@/types/common'
import type {SessionFocusTag} from '@/stores/sessionFocus'

function asTagList(tags: SessionFocusTag | SessionFocusTag[]): SessionFocusTag[] {
  return Array.isArray(tags) ? tags : [tags]
}

function groupTagIdsByMeta(tags: SessionFocusTag | SessionFocusTag[]): Array<{metaId: number; tagIds: number[]}> {
  const grouped = new Map<number, number[]>()
  for (const tag of asTagList(tags)) {
    const metaId = Number(tag.metaId)
    const tagId = Number(tag.tagId)
    if (!Number.isFinite(metaId) || metaId <= 0 || !Number.isFinite(tagId) || tagId <= 0) continue
    const list = grouped.get(metaId) ?? []
    if (!list.includes(tagId)) list.push(tagId)
    grouped.set(metaId, list)
  }
  return [...grouped.entries()].map(([metaId, tagIds]) => ({metaId, tagIds}))
}

/** Media that has every tray tag (AND across categories). */
export function buildSessionFocusWithTagFilters(
  tags: SessionFocusTag | SessionFocusTag[],
): FilterObject[] {
  return groupTagIdsByMeta(tags).map((group) => getFilterObject({
    param: group.metaId,
    type: 'array',
    cond: 'in all',
    lock: false,
    val: group.tagIds,
    note: 'session-focus-with',
  }))
}

/** Media that does not have any tray tag — useful for tagging sessions. */
export function buildSessionFocusWithoutTagFilters(
  tags: SessionFocusTag | SessionFocusTag[],
): FilterObject[] {
  return groupTagIdsByMeta(tags).map((group) => getFilterObject({
    param: group.metaId,
    type: 'array',
    cond: 'not in',
    lock: false,
    val: group.tagIds,
    note: 'session-focus-without',
  }))
}
