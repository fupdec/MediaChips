import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl: vi.fn((path: string) => `/api/get-file?url=${encodeURIComponent(path)}`),
}))

import { buildLocalFileUrl } from '@/services/fileService'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'

describe('loadMediaThumbUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds local file URLs directly without batch API', async () => {
    vi.mocked(buildLocalFileUrl).mockImplementation((
      _path: string,
      _outside?: boolean,
      _bust?: boolean | number,
      options?: {maxEdge?: number},
    ) => (
      options?.maxEdge
        ? `/api/get-file?url=test.jpg&maxEdge=${options.maxEdge}`
        : '/api/get-file?url=test.jpg'
    ))

    const result = await loadMediaThumbUrls('/db/media', 'videos', [1, 2])

    expect(buildLocalFileUrl).toHaveBeenCalled()
    expect(String(result[1])).toContain('maxEdge=')
    expect(String(result[2])).toContain('maxEdge=')
  })

  it('can skip maxEdge for full-size previews', async () => {
    vi.mocked(buildLocalFileUrl).mockReturnValue('/api/get-file?url=test.jpg')

    const result = await loadMediaThumbUrls('/db/media', 'videos', [1], {maxEdge: null})

    expect(result[1]).toBe('/api/get-file?url=test.jpg')
    expect(buildLocalFileUrl).toHaveBeenCalledWith(
      expect.any(String),
      false,
      false,
      undefined,
    )
  })

  it('returns empty object when media path is missing', async () => {
    const result = await loadMediaThumbUrls('', 'videos', [1])

    expect(result).toEqual({})
    expect(buildLocalFileUrl).not.toHaveBeenCalled()
  })
})
