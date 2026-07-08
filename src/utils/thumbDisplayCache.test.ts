import { describe, expect, it } from 'vitest'
import {
  clearThumbDisplayCache,
  getCachedThumb,
  invalidateCachedThumb,
  mediaThumbKey,
  setCachedThumb,
} from '@/utils/thumbDisplayCache'

describe('thumbDisplayCache', () => {
  it('stores and retrieves thumb URLs', () => {
    clearThumbDisplayCache()
    setCachedThumb('a', 'data:image/jpeg;base64,abc')
    expect(getCachedThumb('a')).toBe('data:image/jpeg;base64,abc')
  })

  it('ignores unavailable placeholder URLs', () => {
    clearThumbDisplayCache()
    setCachedThumb('b', '/unavailable.png')
    expect(getCachedThumb('b')).toBeUndefined()
  })

  it('evicts oldest entries when capacity is exceeded', () => {
    clearThumbDisplayCache()

    for (let i = 0; i < 1501; i += 1) {
      setCachedThumb(mediaThumbKey('videos', i), `thumb-${i}`)
    }

    expect(getCachedThumb(mediaThumbKey('videos', 0))).toBeUndefined()
    expect(getCachedThumb(mediaThumbKey('videos', 1500))).toBe('thumb-1500')
  })

  it('ignores blob URLs that would be revoked later', () => {
    clearThumbDisplayCache()
    setCachedThumb('blob', 'blob:http://localhost/abc')
    expect(getCachedThumb('blob')).toBeUndefined()
  })

  it('ignores authenticated file URLs with token query params', () => {
    clearThumbDisplayCache()
    setCachedThumb('auth', '/api/get-file?url=test.jpg&token=secret')
    expect(getCachedThumb('auth')).toBeUndefined()
  })

  it('clears all cached entries', () => {
    clearThumbDisplayCache()
    setCachedThumb('x', 'thumb-x')
    clearThumbDisplayCache()
    expect(getCachedThumb('x')).toBeUndefined()
  })

  it('invalidates a single cached entry', () => {
    clearThumbDisplayCache()
    setCachedThumb('x', 'thumb-x')
    invalidateCachedThumb('x')
    expect(getCachedThumb('x')).toBeUndefined()
  })

  it('keeps video thumb and grid previews under separate keys', () => {
    clearThumbDisplayCache()
    setCachedThumb(mediaThumbKey('videos', 42, 'thumbs'), 'thumb-url')
    setCachedThumb(mediaThumbKey('videos', 42, 'grids'), 'grid-url')

    expect(getCachedThumb(mediaThumbKey('videos', 42, 'thumbs'))).toBe('thumb-url')
    expect(getCachedThumb(mediaThumbKey('videos', 42, 'grids'))).toBe('grid-url')
  })
})
