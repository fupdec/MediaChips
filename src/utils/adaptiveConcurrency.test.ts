import {describe, expect, it} from 'vitest'
import {isThrottleError, runAdaptive} from './adaptiveConcurrency'

const sleep = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms))
const throttle = Object.assign(new Error('Too Many Requests'), {response: {status: 429}})

describe('runAdaptive', () => {
  it('starts at the start limit and grows after a streak of successes, up to max', async () => {
    let active = 0
    const seen: number[] = []
    const {peak} = await runAdaptive(Array.from({length: 30}, (_, i) => i), async () => {
      active += 1; seen.push(active); await sleep(2); active -= 1
    }, {start: 2, max: 5, growEvery: 2, isThrottled: () => false, onFailure: () => {}})
    expect(seen[0]).toBe(1)
    expect(peak).toBeGreaterThan(2)
    expect(Math.max(...seen)).toBeLessThanOrEqual(5)
  })

  it('halves, pauses and retries a throttled job instead of failing it', async () => {
    const attempts = new Map<number, number>()
    const failed: number[] = []
    await runAdaptive([1, 2, 3, 4], async (item) => {
      const n = (attempts.get(item) ?? 0) + 1
      attempts.set(item, n)
      await sleep(1)
      if (item === 2 && n === 1) throw throttle
    }, {start: 4, cooldownMs: 5, isThrottled: isThrottleError, onFailure: item => failed.push(item)})
    expect(attempts.get(2)).toBe(2)
    expect(failed).toEqual([])
  })

  it('reports a job as failed after its retries, and other failures at once without retrying', async () => {
    const attempts: Record<string, number> = {throttled: 0, wrong: 0}
    const failed: string[] = []
    await runAdaptive(['throttled', 'wrong'], async (item) => {
      attempts[item] += 1
      throw item === 'throttled' ? throttle : new Error('copy_content_mismatch')
    }, {retries: 1, cooldownMs: 1, isThrottled: isThrottleError, onFailure: item => failed.push(item)})
    expect(attempts).toEqual({throttled: 2, wrong: 1})
    expect(failed.sort()).toEqual(['throttled', 'wrong'])
  })
})

describe('isThrottleError', () => {
  it('recognises overload and dropped connections, not content errors', () => {
    expect(isThrottleError(throttle)).toBe(true)
    expect(isThrottleError({code: 'ECONNABORTED'})).toBe(true)
    expect(isThrottleError({response: {status: 403, data: {message: 'User rate limit exceeded'}}})).toBe(true)
    expect(isThrottleError({response: {status: 400, data: {code: 'copy_content_mismatch'}}})).toBe(false)
  })
})
