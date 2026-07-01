import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/services/fileService', () => ({
  getLocalImage: vi.fn(),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    postMediaThumbs: vi.fn(),
  },
}))

import { getLocalImage } from '@/services/fileService'
import { typedApi } from '@/services/typedApi'
import { loadMediaThumbUrls } from '@/utils/mediaThumbLoader'

describe('loadMediaThumbUrls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads thumbs from the batch API', async () => {
    vi.mocked(typedApi.postMediaThumbs).mockResolvedValue({
      data: { thumbs: { 1: 'data:image/jpeg;base64,abc', 2: 'data:image/jpeg;base64,def' } },
    } as never)

    const result = await loadMediaThumbUrls('/db/media', 'videos', [1, 2])

    expect(typedApi.postMediaThumbs).toHaveBeenCalledWith({
      ids: [1, 2],
      mediaType: 'videos',
    })
    expect(result).toEqual({
      1: 'data:image/jpeg;base64,abc',
      2: 'data:image/jpeg;base64,def',
    })
    expect(getLocalImage).not.toHaveBeenCalled()
  })

  it('falls back to individual file requests when batch API fails', async () => {
    vi.mocked(typedApi.postMediaThumbs).mockRejectedValue(new Error('offline'))
    vi.mocked(getLocalImage).mockResolvedValue('/api/get-file?url=test.jpg')

    const result = await loadMediaThumbUrls('/db/media', 'videos', [1])

    expect(getLocalImage).toHaveBeenCalled()
    expect(result[1]).toBe('/api/get-file?url=test.jpg')
  })
})
