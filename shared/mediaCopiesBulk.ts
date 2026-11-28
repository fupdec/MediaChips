export type DetachCopiesQuery = {prefix: string; onlyUnavailable?: boolean}
export type DetachCopyPlanItem = {
  mediaId: number
  title: string
  detach: Array<{copyId: string; path: string; availability: string}>
  keep: Array<{path: string; availability: string}>
}
export type DetachCopiesPreview = {
  /** Cards that would lose at least one copy. Capped at `limit`; the totals below are complete. */
  cards: DetachCopyPlanItem[]
  limit: number
  totalCards: number
  totalCopies: number
  /** Cards where every copy matches the prefix. They are left untouched: the last copy is never detached. */
  skippedAllMatch: number
}
export type DetachCopiesResult = {cards: number; copies: number; failed: Array<{mediaId: number; code: string}>}
