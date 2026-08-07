import {describe, expect, it, beforeEach} from 'vitest'
import {
  clearHealthQueueSnooze,
  getActiveHealthSnoozes,
  isHealthQueueItemSnoozed,
  snoozeHealthQueueItem,
} from './healthQueueSnooze'

describe('healthQueueSnooze', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('snoozes and expires queue items', () => {
    const now = 1_000_000
    snoozeHealthQueueItem('duplicates', 5_000, now)
    expect(isHealthQueueItemSnoozed('duplicates', now + 1_000)).toBe(true)
    expect(isHealthQueueItemSnoozed('duplicates', now + 6_000)).toBe(false)
    expect(getActiveHealthSnoozes(now + 6_000)).toEqual({})
  })

  it('can clear a snooze early', () => {
    const now = 1_000_000
    snoozeHealthQueueItem('clip', 60_000, now)
    clearHealthQueueSnooze('clip')
    expect(isHealthQueueItemSnoozed('clip', now + 1_000)).toBe(false)
  })
})
