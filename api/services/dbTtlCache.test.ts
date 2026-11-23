/**
 * @vitest-environment node
 */
import {describe, expect, it, vi} from 'vitest'
import {clearDbTtlCaches, createDbTtlCache} from './dbTtlCache'

describe('createDbTtlCache', () => {
  it('reuses a value until it expires, per library and key', () => {
    let clock = 0
    const cache = createDbTtlCache(1000, () => clock)
    const dbA = {}
    const dbB = {}
    const compute = vi.fn(() => ({}))

    const first = cache.get(dbA, 'k', compute)
    expect(cache.get(dbA, 'k', compute)).toBe(first)
    expect(compute).toHaveBeenCalledTimes(1)

    expect(cache.get(dbB, 'k', compute)).not.toBe(first)
    expect(cache.get(dbA, 'other', compute)).not.toBe(first)
    expect(compute).toHaveBeenCalledTimes(3)

    clock = 1001
    expect(cache.get(dbA, 'k', compute)).not.toBe(first)
  })

  it('is cleared by clearDbTtlCaches and drops rejected promises', async () => {
    const cache = createDbTtlCache(60_000)
    const db = {}
    const first = cache.get(db, 'k', () => ({}))
    clearDbTtlCaches()
    expect(cache.get(db, 'k', () => ({}))).not.toBe(first)

    const failing = cache.get(db, 'bad', () => Promise.reject(new Error('boom')))
    await expect(failing).rejects.toThrow('boom')
    await Promise.resolve()
    const retry = vi.fn(() => Promise.resolve('ok'))
    expect(await cache.get(db, 'bad', retry)).toBe('ok')
    expect(retry).toHaveBeenCalledTimes(1)
  })
})
