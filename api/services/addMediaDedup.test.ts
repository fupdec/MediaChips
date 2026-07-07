import { describe, expect, it } from 'vitest'
import {
  buildMediaDuplicateKey,
  findRegisteredDuplicate,
  registerDuplicateMedia,
  resetAddMediaDedupState,
  withDuplicateLookupLock,
} from './addMediaDedup'

describe('addMediaDedup', () => {
  it('builds a stable lookup key', () => {
    expect(buildMediaDuplicateKey(1, 1024, 'Movie.mp4')).toBe('1:1024:movie.mp4')
  })

  it('serializes duplicate lookups for the same key', async () => {
    resetAddMediaDedupState()
    const order: string[] = []

    await Promise.all([
      withDuplicateLookupLock('video:1', async () => {
        order.push('a:start')
        await new Promise((resolve) => setTimeout(resolve, 20))
        order.push('a:end')
      }),
      withDuplicateLookupLock('video:1', async () => {
        order.push('b:start')
        order.push('b:end')
      }),
    ])

    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end'])
  })

  it('stores and reads registered duplicates', () => {
    resetAddMediaDedupState()
    registerDuplicateMedia('1:100:clip.mp4', {id: 7, path: '/media/clip.mp4'})

    expect(findRegisteredDuplicate('1:100:clip.mp4')).toEqual({
      id: 7,
      path: '/media/clip.mp4',
    })
  })
})
