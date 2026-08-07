import type {ItemsPageProps} from '@/types/itemsPage'

/** Explicit nulls so page-settings WHERE matches one row (omit ≠ IS NULL). */
export function normalizePageSettingCriteria(props: Pick<
  ItemsPageProps,
  'tagId' | 'mediaTypeId' | 'metaId' | 'tabId'
>): {
  tagId: number | null
  mediaTypeId: number | null
  metaId: number | null
  tabId: number | null
} {
  const toId = (value: unknown): number | null => {
    const n = Number(value)
    return Number.isFinite(n) && n > 0 ? n : null
  }

  return {
    tagId: toId(props.tagId),
    mediaTypeId: toId(props.mediaTypeId),
    metaId: toId(props.metaId),
    tabId: toId(props.tabId),
  }
}
