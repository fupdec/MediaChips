/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {mapInOrderedBatches} from './orderedAsyncBatches'

describe('mapInOrderedBatches', () => {
  it('preserves input order despite out-of-order completion', async () => {
    const results = await mapInOrderedBatches([30, 10, 20], 2, async (delay, index) => {
      await new Promise((resolve) => setTimeout(resolve, delay))
      return `${index}:${delay}`
    })
    expect(results).toEqual(['0:30', '1:10', '2:20'])
  })

  it('caps in-flight work to concurrency', async () => {
    let inFlight = 0
    let maxInFlight = 0
    await mapInOrderedBatches([1, 2, 3, 4, 5], 2, async () => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight -= 1
      return true
    })
    expect(maxInFlight).toBeLessThanOrEqual(2)
    expect(maxInFlight).toBeGreaterThan(1)
  })

  it('isolates item failures as undefined', async () => {
    const results = await mapInOrderedBatches([1, 2, 3], 3, async (value) => {
      if (value === 2) throw new Error('boom')
      return value * 10
    })
    expect(results).toEqual([10, undefined, 30])
  })

  it('stops scheduling new batches when shouldStop flips', async () => {
    let started = 0
    await mapInOrderedBatches(
      [1, 2, 3, 4, 5, 6],
      2,
      async () => {
        started += 1
        await new Promise((resolve) => setTimeout(resolve, 1))
        return true
      },
      {shouldStop: () => started >= 2},
    )
    expect(started).toBeLessThan(6)
  })
})
