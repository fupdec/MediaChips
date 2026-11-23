/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { createAbortError, createConcurrencyQueue, isAbortError } from './concurrencyQueue'

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

  it('runs higher-priority tasks before lower-priority backlog', async () => {
    const queue = createConcurrencyQueue(1)
    const order: string[] = []

    const gate = delay(30)
    const first = queue.enqueue(async () => {
      order.push('running')
      await gate
      order.push('done-low')
    }, {priority: 1})

    await delay(5)

    const high = queue.enqueue(async () => {
      order.push('high')
    }, {priority: 100})

    const low = queue.enqueue(async () => {
      order.push('low')
    }, {priority: 1})

    await Promise.all([first, high, low])
    expect(order).toEqual(['running', 'done-low', 'high', 'low'])
  })

  it('prefers newer default-priority work over older backlog', async () => {
    const queue = createConcurrencyQueue(1)
    const order: number[] = []

    const blocker = queue.enqueue(async () => {
      await delay(40)
    })
    await delay(5)

    const older = queue.enqueue(async () => {
      order.push(1)
    })
    const newer = queue.enqueue(async () => {
      order.push(2)
    })

    await Promise.all([blocker, older, newer])
    expect(order).toEqual([2, 1])
  })

  it('drops pending work when AbortSignal fires before start', async () => {
    const queue = createConcurrencyQueue(1)
    const controller = new AbortController()
    let started = false

    const blocker = queue.enqueue(async () => {
      await delay(40)
    })
    await delay(5)

    const pending = queue.enqueue(async () => {
      started = true
    }, {signal: controller.signal})

    controller.abort()
    await expect(pending).rejects.toMatchObject({name: 'AbortError'})
    await blocker
    expect(started).toBe(false)
    expect(isAbortError(createAbortError())).toBe(true)
  })

  it('rejects overflowed lowest-priority pending tasks', async () => {
    const queue = createConcurrencyQueue(1, {maxPending: 2})
    let startedExtra = false

    const blocker = queue.enqueue(async () => {
      await delay(50)
    }, {priority: 1000})
    await delay(5)

    const keepA = queue.enqueue(async () => 'a', {priority: 50})
    const keepB = queue.enqueue(async () => 'b', {priority: 40})
    const dropped = queue.enqueue(async () => {
      startedExtra = true
      return 'c'
    }, {priority: 10})

    await expect(dropped).rejects.toMatchObject({name: 'AbortError'})
    await expect(Promise.all([blocker, keepA, keepB])).resolves.toEqual([undefined, 'a', 'b'])
    expect(startedExtra).toBe(false)
  })

  it('runs tasks sequentially when concurrency is 1', async () => {
    const queue = createConcurrencyQueue(1)
    const order: number[] = []

    // Explicit equal priority keeps FIFO among ties via seq... wait, higher seq first.
    // Use rising explicit priorities to keep classic FIFO for this regression.
    await Promise.all([
      queue.enqueue(async () => {
        await delay(10)
        order.push(1)
      }, {priority: 2}),
      queue.enqueue(async () => {
        order.push(2)
      }, {priority: 1}),
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

it('keeps running tasks counted across reset and respects the concurrency limit', async () => {
  const queue = createConcurrencyQueue(1)
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  const first = queue.enqueue(async () => { await gate })
  queue.reset()
  let nextStarted = false
  const next = queue.enqueue(async () => { nextStarted = true })
  const activeAfterReset = queue.getStats().active
  const startedBeforeCompletion = nextStarted
  finish()
  await Promise.all([first, next])
  expect(activeAfterReset).toBe(1)
  expect(startedBeforeCompletion).toBe(false)
  expect(queue.getStats().active).toBe(0)
})

it('releases its slot when a task throws before returning a promise', async () => {
  const queue = createConcurrencyQueue(1)
  await expect(queue.enqueue(() => { throw new Error('synchronous failure') })).rejects.toThrow('synchronous failure')
  expect(queue.getStats()).toMatchObject({active: 0, pending: 0})
  await expect(queue.enqueue(async () => 'recovered')).resolves.toBe('recovered')
})
