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
})
