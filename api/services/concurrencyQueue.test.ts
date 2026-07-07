/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createConcurrencyQueue } from './concurrencyQueue'

const delay = (ms: number) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms)
})

describe('createConcurrencyQueue', () => {
  it('limits concurrent task execution', async () => {
    const queue = createConcurrencyQueue(2)
    let active = 0
    let maxActive = 0

    const tasks = Array.from({length: 6}, () => queue.enqueue(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await delay(20)
      active -= 1
      return true
    }))

    await Promise.all(tasks)

    expect(maxActive).toBeLessThanOrEqual(2)
    expect(queue.getStats().active).toBe(0)
    expect(queue.getStats().pending).toBe(0)
  })

  it('runs tasks sequentially when concurrency is 1', async () => {
    const queue = createConcurrencyQueue(1)
    const order: number[] = []

    await Promise.all([
      queue.enqueue(async () => {
        await delay(10)
        order.push(1)
      }),
      queue.enqueue(async () => {
        order.push(2)
      }),
    ])

    expect(order).toEqual([1, 2])
  })

  it('propagates task errors to the caller', async () => {
    const queue = createConcurrencyQueue(1)

    await expect(queue.enqueue(async () => {
      throw new Error('queue failed')
    })).rejects.toThrow('queue failed')
  })
})
