import {describe, expect, it, vi, beforeEach} from 'vitest'

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl: vi.fn((path: string) => `/api/get-file?url=${encodeURIComponent(path)}`),
}))

vi.mock('@/utils/thumbDisplayCache', () => ({
  getCachedThumb: vi.fn(),
  isPersistentThumbUrl: vi.fn((url: string | null | undefined) => Boolean(url && url.startsWith('data:'))),
  mediaThumbKey: vi.fn((folder: string, id: number | string) => `media:${folder}:${id}`),
  tagThumbKey: vi.fn((metaId: number | string, tagId: number | string, type: string) =>
    `tag:${metaId}:${tagId}:${type}`),
}))

import {getCachedThumb} from '@/utils/thumbDisplayCache'
import {resolveMediaThumbDisplayUrl, resolveTagThumbDisplayUrl} from '@/utils/thumbSource'

describe('thumbSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns cached tag thumb URLs without building a file URL', () => {
    vi.mocked(getCachedThumb).mockReturnValue('data:image/jpeg;base64,abc')

    const url = resolveTagThumbDisplayUrl({
      dbPath: '/db',
      metaId: 1,
      tagId: 2,
      type: 'main',
    })

    expect(url).toBe('data:image/jpeg;base64,abc')
  })

  it('builds tag thumb URLs when cache is empty', () => {
    vi.mocked(getCachedThumb).mockReturnValue(undefined)

    const url = resolveTagThumbDisplayUrl({
      dbPath: '/db',
      metaId: 1,
      tagId: 2,
      type: 'avatar',
    })

    expect(url).toContain('/api/get-file?url=')
    expect(decodeURIComponent(url)).toContain('2_avatar.jpg')
  })

  it('builds media thumb URLs when cache is empty', () => {
    vi.mocked(getCachedThumb).mockReturnValue(undefined)

    const url = resolveMediaThumbDisplayUrl('/db/media', 'videos', 9)

    expect(decodeURIComponent(url!)).toContain('videos/thumbs/9.jpg')
  })
})
