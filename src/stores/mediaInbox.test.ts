import {describe, expect, it, beforeEach} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useMediaInboxStore} from '@/stores/mediaInbox'

describe('useMediaInboxStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('opens and closes the dialog', () => {
    const store = useMediaInboxStore()
    store.open('lost')
    expect(store.dialog).toBe(true)
    expect(store.tab).toBe('lost')
    store.close()
    expect(store.dialog).toBe(false)
  })

  it('persists ignored paths and pending review ids', () => {
    const store = useMediaInboxStore()
    store.ignorePaths(['/A/B.mp4', '/a/b.mp4'])
    store.enqueuePendingReview([1, 2, 2, 0])
    expect(store.ignoredPaths).toEqual(['/a/b.mp4'])
    expect(store.pendingReviewIds).toEqual([1, 2])

    setActivePinia(createPinia())
    const reloaded = useMediaInboxStore()
    expect(reloaded.ignoredPaths).toEqual(['/a/b.mp4'])
    expect(reloaded.pendingReviewIds).toEqual([1, 2])

    reloaded.removePendingReview([1])
    expect(reloaded.pendingReviewIds).toEqual([2])
    reloaded.clearPendingReview()
    expect(reloaded.pendingCount).toBe(0)
  })
})
