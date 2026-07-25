import {describe, expect, it, vi, beforeEach} from 'vitest'

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl: vi.fn((
    path: string,
    _outside?: boolean,
    cacheBust: boolean | number = false,
  ) => {
    const bust = cacheBust === true
      ? '&_t=now'
      : (typeof cacheBust === 'number' ? `&_t=${cacheBust}` : '')
    return `/api/get-file?url=${encodeURIComponent(path)}${bust}`
  }),
}))

vi.mock('@/utils/thumbDisplayCache', () => ({
  getCachedThumb: vi.fn(),
  getTagThumbVersion: vi.fn(),
  isPersistentThumbUrl: vi.fn((url: string | null | undefined) => Boolean(url && url.startsWith('data:'))),
  mediaThumbKey: vi.fn((folder: string, id: number | string) => `media:${folder}:${id}`),
  tagThumbKey: vi.fn((metaId: number | string, tagId: number | string, type: string) =>
    `tag:${metaId}:${tagId}:${type}`),
}))

import {buildLocalFileUrl} from '@/services/fileService'
import {getCachedThumb, getTagThumbVersion} from '@/utils/thumbDisplayCache'
import {resolveMediaThumbDisplayUrl, resolveTagThumbDisplayUrl, getTagHoverThumbCandidates} from '@/utils/thumbSource'

describe('thumbSource', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTagThumbVersion).mockReturnValue(undefined)
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

  it('applies a stable tag version bust after image edits', () => {
    vi.mocked(getCachedThumb).mockReturnValue('data:image/jpeg;base64,stale')
    vi.mocked(getTagThumbVersion).mockReturnValue(1700000000000)

    const url = resolveTagThumbDisplayUrl({
      dbPath: '/db',
      metaId: 1,
      tagId: 2,
      type: 'main',
    })

    expect(url).toContain('_t=1700000000000')
    expect(buildLocalFileUrl).toHaveBeenCalledWith(
      expect.stringContaining('2_main.jpg'),
      false,
      1700000000000,
    )
  })

  it('collects tag hover thumb candidates in priority order', () => {
    vi.mocked(getCachedThumb).mockImplementation((key: string) => {
      if (key.endsWith(':avatar')) return 'data:image/jpeg;base64,avatar'
      if (key.endsWith(':main')) return 'data:image/jpeg;base64,main'
      return undefined
    })

    const candidates = getTagHoverThumbCandidates({
      dbPath: '/db',
      metaId: 1,
      tagId: 2,
    })

    expect(candidates).toEqual([
      {type: 'avatar', url: 'data:image/jpeg;base64,avatar'},
      {type: 'main', url: 'data:image/jpeg;base64,main'},
    ])
  })

  it('rebuilds hover candidates when a versioned edit invalidated stable cache urls', () => {
    vi.mocked(getTagThumbVersion).mockReturnValue(42)
    vi.mocked(getCachedThumb).mockReturnValue('/api/get-file?url=old.jpg')

    const candidates = getTagHoverThumbCandidates({
      dbPath: '/db',
      metaId: 1,
      tagId: 2,
    })

    expect(candidates).toEqual([
      {type: 'avatar', url: expect.stringContaining('_t=42')},
      {type: 'main', url: expect.stringContaining('_t=42')},
    ])
  })

  it('builds media thumb URLs when cache is empty', () => {
    vi.mocked(getCachedThumb).mockReturnValue(undefined)

    const url = resolveMediaThumbDisplayUrl('/db/media', 'videos', 9)

    expect(decodeURIComponent(url!)).toContain('videos/thumbs/9.jpg')
  })
})
