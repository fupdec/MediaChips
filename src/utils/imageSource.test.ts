import { beforeEach, describe, expect, it, vi } from 'vitest'

const buildLocalFileUrl = vi.hoisted(() => vi.fn((
  filePath: string,
  _outside?: boolean,
  _cacheBust?: boolean | number,
  options?: {maxEdge?: number},
) => {
  const edge = options?.maxEdge ? `&maxEdge=${options.maxEdge}` : ''
  return `/api/get-file?url=${encodeURIComponent(filePath)}${edge}`
}))

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl,
}))

import {
  FILMSTRIP_THUMB_MAX_EDGE,
  loadFilmstripThumbDisplayUrl,
} from './imageSource'
import { getCachedThumb, mediaThumbKey } from './thumbDisplayCache'

describe('loadFilmstripThumbDisplayUrl', () => {
  beforeEach(() => {
    buildLocalFileUrl.mockClear()
  })

  it('requests a compact maxEdge from the library thumb path', async () => {
    const url = await loadFilmstripThumbDisplayUrl({id: 9}, '/db/media')
    expect(buildLocalFileUrl).toHaveBeenCalledWith(
      expect.stringContaining('images/thumbs/9.jpg'),
      false,
      false,
      {maxEdge: FILMSTRIP_THUMB_MAX_EDGE},
    )
    expect(url).toContain('maxEdge=144')
    expect(getCachedThumb(mediaThumbKey('images-filmstrip', 9))).toContain('maxEdge=144')
  })
})
