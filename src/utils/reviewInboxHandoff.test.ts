import {describe, expect, it, beforeEach} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useMediaInboxStore} from '@/stores/mediaInbox'
import {completeInboxPendingIfNeeded} from './reviewInboxHandoff'

describe('reviewInboxHandoff', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('removes a pending id and ignores unknowns', () => {
    const inbox = useMediaInboxStore()
    inbox.enqueuePendingReview([10, 20])
    expect(completeInboxPendingIfNeeded(10)).toBe(true)
    expect(inbox.pendingReviewIds).toEqual([20])
    expect(completeInboxPendingIfNeeded(99)).toBe(false)
    expect(completeInboxPendingIfNeeded(null)).toBe(false)
  })
})
