import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildLocalFileUrl = vi.hoisted(() => vi.fn((
  filePath: string,
  _outside?: boolean,
  cacheBust?: boolean | number,
  options?: {maxEdge?: number},
) => {
  const edge = options?.maxEdge ? `&maxEdge=${options.maxEdge}` : ''
  const bust = cacheBust ? `&_t=${cacheBust}` : ''
  return `/api/get-file?url=${encodeURIComponent(filePath)}${edge}${bust}`
}))

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl,
}))

import {
  FILMSTRIP_THUMB_MAX_EDGE,
  loadFilmstripThumbDisplayUrl,
} from './imageSource'
import {
  getCachedThumb,
  mediaThumbKey,
  setCachedThumb,
  invalidateCachedThumb,
} from './thumbDisplayCache'

describe('loadFilmstripThumbDisplayUrl', () => {
  beforeEach(() => {
    buildLocalFileUrl.mockClear()
    invalidateCachedThumb(mediaThumbKey('images-filmstrip', 9))
  })

  it('requests a compact maxEdge from the library thumb path without caching', async () => {
    const url = await loadFilmstripThumbDisplayUrl({id: 9}, '/db/media')
    expect(buildLocalFileUrl).toHaveBeenCalledWith(
      expect.stringContaining('images/thumbs/9.jpg'),
      false,
      false,
      {maxEdge: FILMSTRIP_THUMB_MAX_EDGE},
    )
    expect(url).toContain('maxEdge=144')
    // Callers cache only after a successful probe — avoid sticky 404 URLs.
    expect(getCachedThumb(mediaThumbKey('images-filmstrip', 9))).toBeUndefined()
  })

  it('returns a cached url when present and cacheBust is off', async () => {
    setCachedThumb(
      mediaThumbKey('images-filmstrip', 9),
      '/api/get-file?url=cached&maxEdge=144',
    )
    const url = await loadFilmstripThumbDisplayUrl({id: 9}, '/db/media')
    expect(url).toContain('cached')
    expect(buildLocalFileUrl).not.toHaveBeenCalled()
  })
})
