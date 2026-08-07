import { describe, expect, it } from 'vitest'
import {
  clearThumbDisplayCache,
  getCachedThumb,
  invalidateCachedThumb,
  mediaThumbKey,
  setCachedTagThumbs,
  setCachedThumb,
  setTagThumbVersion,
  tagThumbKey,
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

    for (let i = 0; i < 401; i += 1) {
      setCachedThumb(mediaThumbKey('videos', i), `thumb-${i}`)
    }

    expect(getCachedThumb(mediaThumbKey('videos', 0))).toBeUndefined()
    expect(getCachedThumb(mediaThumbKey('videos', 400))).toBe('thumb-400')
  })

  it('ignores blob URLs that would be revoked later', () => {
    clearThumbDisplayCache()
    setCachedThumb('blob', 'blob:http://localhost/abc')
    expect(getCachedThumb('blob')).toBeUndefined()
  })

  it('stores authenticated file URLs without the session token', () => {
    clearThumbDisplayCache()
    setCachedThumb('auth', '/api/get-file?url=test.jpg&cv=1&token=secret')
    expect(getCachedThumb('auth')).toBe('/api/get-file?url=test.jpg&cv=1')
  })

  it('re-attaches the current session token when reading cached get-file URLs', () => {
    clearThumbDisplayCache()
    sessionStorage.setItem('mediachips_auth_token', 'live-token')
    setCachedThumb('auth2', '/api/get-file?url=photo.jpg&cv=1&token=old')
    expect(getCachedThumb('auth2')).toBe('/api/get-file?url=photo.jpg&cv=1&token=live-token')
    sessionStorage.removeItem('mediachips_auth_token')
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

  it('refuses to re-cache stable tag urls after an image edit version bump', () => {
    clearThumbDisplayCache()
    setTagThumbVersion(9, 100, 123)

    setCachedTagThumbs(9, {
      100: {
        main: '/api/get-file?url=100_main.jpg',
        avatar: '/api/get-file?url=100_avatar.jpg&_t=123',
      },
    })

    expect(getCachedThumb(tagThumbKey(9, 100, 'main'))).toBeUndefined()
    expect(getCachedThumb(tagThumbKey(9, 100, 'avatar'))).toBe(
      '/api/get-file?url=100_avatar.jpg&_t=123',
    )
  })
})
