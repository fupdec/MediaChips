import { describe, expect, it, beforeEach, vi } from 'vitest'
import {
  enqueueImageThumbRegen,
  resetImageThumbRegenQueueForTests,
} from './imageThumbRegen'
import { resetGalleryPerfCounters, getGalleryPerfSnapshot } from './galleryPerfCounters'

describe('enqueueImageThumbRegen', () => {
  beforeEach(() => {
    resetImageThumbRegenQueueForTests()
    resetGalleryPerfCounters()
  })

  it('coalesces concurrent regenerations for the same media id', async () => {
    let runs = 0
    const run = vi.fn(async () => {
      runs += 1
      await new Promise((resolve) => setTimeout(resolve, 20))
    })

    const a = enqueueImageThumbRegen(7, run)
    const b = enqueueImageThumbRegen(7, run)
    await Promise.all([a, b])

    expect(runs).toBe(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('limits concurrency across different media ids', async () => {
    let concurrent = 0
    let maxConcurrent = 0

    const makeRun = () => async () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      await new Promise((resolve) => setTimeout(resolve, 30))
      concurrent -= 1
    }

    await Promise.all([
      enqueueImageThumbRegen(1, makeRun()),
      enqueueImageThumbRegen(2, makeRun()),
      enqueueImageThumbRegen(3, makeRun()),
      enqueueImageThumbRegen(4, makeRun()),
      enqueueImageThumbRegen(5, makeRun()),
    ])

    expect(maxConcurrent).toBeLessThanOrEqual(3)
    await vi.waitFor(() => {
      expect(getGalleryPerfSnapshot().regenCompleted).toBe(5)
    })
  })
})
