/**
 * @vitest-environment node
 */
import {afterEach, describe, expect, it, vi} from 'vitest'
import {logMissingFileOnce} from './getFileRoutes'

describe('logMissingFileOnce', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs a missing file once per minute and keeps files independent', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(logMissingFileOnce('/db/media/videos/thumbs/1.jpg', 1_000)).toBe(true)
    expect(logMissingFileOnce('/db/media/videos/thumbs/1.jpg', 20_000)).toBe(false)
    expect(logMissingFileOnce('/db/media/videos/thumbs/2.jpg', 20_000)).toBe(true)
    expect(logMissingFileOnce('/db/media/videos/thumbs/1.jpg', 62_000)).toBe(true)
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('caps a burst of distinct missing files and reports the rest in one summary line', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const base = 10_000_000
    for (let i = 0; i < 20; i++) logMissingFileOnce(`/db/meta/17/${i}_avatar.jpg`, base + i)
    expect(spy).toHaveBeenCalledTimes(5)

    logMissingFileOnce('/db/meta/17/next.jpg', base + 61_000)
    expect(spy).toHaveBeenCalledTimes(7)
    expect(String(spy.mock.calls[5][0])).toContain('15 more missing files')
  })
})
