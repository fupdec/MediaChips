/** FilterObject.note marker for tag-page quick filter rows. */
export const TAG_PAGE_QUICK_FILTER_NOTE = 'tagPageQuick'

export function isTagPageQuickFilter(filter: { note?: string | null }): boolean {
  return filter.note === TAG_PAGE_QUICK_FILTER_NOTE
}
