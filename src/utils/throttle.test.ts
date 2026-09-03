import {describe, expect, it, vi} from 'vitest'
import {throttle} from './throttle'

describe('throttle', () => {
  it('invokes immediately then coalesces trailing calls', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const fn = throttle((n: number) => {
      calls.push(n)
    }, 100)

    fn(1)
    fn(2)
    fn(3)
    expect(calls).toEqual([1])

    await vi.advanceTimersByTimeAsync(100)
    expect(calls).toEqual([1, 3])

    vi.useRealTimers()
  })

  it('flush forces the pending trailing call', () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const fn = throttle((n: number) => {
      calls.push(n)
    }, 100)

    fn(1)
    fn(2)
    fn.flush()
    expect(calls).toEqual([1, 2])

    vi.useRealTimers()
  })
})
