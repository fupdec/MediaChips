import {useMediaInboxStore} from '@/stores/mediaInbox'

/**
 * When Review was started from Inbox pending, advancing past an item
 * (or closing on it) marks that media id as done in the pending queue.
 */
export function completeInboxPendingIfNeeded(mediaId: number | null | undefined): boolean {
  const id = Number(mediaId)
  if (!Number.isFinite(id) || id <= 0) return false
  const inbox = useMediaInboxStore()
  if (!inbox.pendingReviewIds.includes(id)) return false
  inbox.removePendingReview([id])
  return true
}
