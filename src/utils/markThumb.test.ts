/// <reference types="node" />
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { loadMarkImageDisplayUrl } from '@/utils/markThumb'

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl: (filePath: string) => `file://${filePath}`,
  checkFileExists: vi.fn(),
  createThumb: vi.fn(),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    createMarkThumb: vi.fn(),
  },
}))

vi.mock('@/utils/thumbSource', () => ({
  isThumbUnavailable: (src: string | null | undefined) => !src || src.includes('unavailable.png'),
  resolveMediaThumbDisplayUrl: vi.fn(),
}))

import { checkFileExists } from '@/services/fileService'
import { resolveMediaThumbDisplayUrl } from '@/utils/thumbSource'

describe('loadMarkImageDisplayUrl', () => {
  beforeEach(() => {
    vi.mocked(checkFileExists).mockReset()
    vi.mocked(resolveMediaThumbDisplayUrl).mockReset()
  })

  it('returns mark image when mark file exists', async () => {
    vi.mocked(checkFileExists).mockResolvedValue(true)

    const url = await loadMarkImageDisplayUrl({
      markId: 42,
      mediaPath: '/db/path',
    })

    expect(url).toBe('file:///db/path/videos/marks/42.jpg')
    expect(resolveMediaThumbDisplayUrl).not.toHaveBeenCalled()
  })

  it('falls back to video thumb when mark image is missing', async () => {
    vi.mocked(checkFileExists).mockResolvedValue(false)
    vi.mocked(resolveMediaThumbDisplayUrl).mockReturnValue('file:///db/path/videos/thumbs/7.jpg')

    const url = await loadMarkImageDisplayUrl({
      markId: 42,
      mediaPath: '/db/path',
      mediaId: 7,
    })

    expect(url).toBe('file:///db/path/videos/thumbs/7.jpg')
    expect(resolveMediaThumbDisplayUrl).toHaveBeenCalledWith('/db/path', 'videos', 7)
  })

  it('returns unavailable when neither mark nor video thumb exists', async () => {
    vi.mocked(checkFileExists).mockResolvedValue(false)
    vi.mocked(resolveMediaThumbDisplayUrl).mockReturnValue(null)

    const url = await loadMarkImageDisplayUrl({
      markId: 42,
      mediaPath: '/db/path',
      mediaId: 7,
    })

    expect(url).toBe('/images/unavailable.png')
  })
})
