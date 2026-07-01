import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {debounce} from '@/utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('invokes on trailing edge by default', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    debounced()
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(100)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('supports leading edge without trailing', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 40, {leading: true, trailing: false})

    debounced()
    expect(fn).toHaveBeenCalledTimes(1)

    debounced()
    debounced()
    expect(fn).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(40)
    expect(fn).toHaveBeenCalledTimes(1)

    debounced()
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('cancels pending invocation', () => {
    const fn = vi.fn()
    const debounced = debounce(fn, 100)

    debounced()
    debounced.cancel()

    vi.advanceTimersByTime(100)
    expect(fn).not.toHaveBeenCalled()
  })
})
