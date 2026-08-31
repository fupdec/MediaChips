import { beforeEach, describe, expect, it, vi } from 'vitest'

const loadMediaThumbUrls = vi.hoisted(() => vi.fn())
const probeDisplayImageUrl = vi.hoisted(() => vi.fn())
const enqueueImageThumbAndMeta = vi.hoisted(() => vi.fn())
const enqueueQuietMetaBackfill = vi.hoisted(() => vi.fn())
const taskCreateThumbForVideo = vi.hoisted(() => vi.fn())

vi.mock('@/utils/mediaThumbLoader', () => ({
  loadMediaThumbUrls,
}))

vi.mock('@/utils/probeImageUrl', () => ({
  probeDisplayImageUrl,
}))

vi.mock('@/utils/quietMediaBackfill', () => ({
  enqueueImageThumbAndMeta,
  enqueueQuietMetaBackfill,
  isEmptyMediaSource: (item: {filesize?: number} | null | undefined) =>
    item != null && Number(item.filesize) === 0,
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {taskCreateThumbForVideo},
}))

vi.mock('@/services/fileService', () => ({
  buildLocalFileUrl: (filePath: string, _o?: boolean, bust?: boolean | number) =>
    `/api/get-file?url=${encodeURIComponent(filePath)}${bust ? `&_t=${bust}` : ''}`,
}))

vi.mock('@/utils/mediaType', () => ({
  getMediaDeleteAssetFolder: (mediaType: {type?: string} | null | undefined) => {
    if (mediaType?.type === 'image') return 'images'
    if (mediaType?.type === 'video') return 'videos'
    return 'videos'
  },
  findMediaTypeById: (types: Array<{id: number; type: string}>, id: unknown) =>
    types.find((item) => item.id === Number(id)) || null,
  isImageMediaType: (mediaType: {type?: string} | null | undefined) => mediaType?.type === 'image',
  isVideoMediaType: (mediaType: {type?: string} | null | undefined) => mediaType?.type === 'video',
}))

import { loadHomeMediaThumbs } from './homeMediaThumbs'
import { IMAGE_UNAVAILABLE_URL } from '@/utils/imageSource'

describe('loadHomeMediaThumbs', () => {
  const mediaTypes = [
    {id: 1, type: 'video', name: 'Video'},
    {id: 2, type: 'image', name: 'Image'},
  ]

  beforeEach(() => {
    loadMediaThumbUrls.mockReset()
    probeDisplayImageUrl.mockReset()
    enqueueImageThumbAndMeta.mockReset()
    enqueueQuietMetaBackfill.mockReset()
    taskCreateThumbForVideo.mockReset()
    probeDisplayImageUrl.mockResolvedValue(true)
    enqueueImageThumbAndMeta.mockResolvedValue(true)
    taskCreateThumbForVideo.mockResolvedValue({})
  })

  it('keeps existing thumbs that probe successfully', async () => {
    loadMediaThumbUrls.mockResolvedValue({7: '/thumbs/7.jpg'})
    const items = [{id: 7, mediaTypeId: 2, filesize: 100, thumb: null as string | null}]

    await loadHomeMediaThumbs(items, mediaTypes as never, '/db/media')

    expect(items[0].thumb).toBe('/thumbs/7.jpg')
    expect(enqueueImageThumbAndMeta).not.toHaveBeenCalled()
  })

  it('quietly creates missing image thumbs after a failed probe', async () => {
    loadMediaThumbUrls.mockResolvedValue({9: '/thumbs/9.jpg'})
    probeDisplayImageUrl
      .mockResolvedValueOnce(false) // initial probe miss
      .mockResolvedValueOnce(true) // after create
    const items = [{id: 9, mediaTypeId: 2, filesize: 200, path: '/a.jpg', thumb: null as string | null}]

    await loadHomeMediaThumbs(items, mediaTypes as never, '/db/media')

    expect(enqueueImageThumbAndMeta).toHaveBeenCalledWith(9)
    expect(decodeURIComponent(String(items[0].thumb))).toContain('images/thumbs/9.jpg')
    expect(items[0].thumb).not.toBe(IMAGE_UNAVAILABLE_URL)
  })

  it('creates missing video thumbs and skips empty sources', async () => {
    loadMediaThumbUrls.mockResolvedValue({
      3: '/thumbs/3.jpg',
      4: '/thumbs/4.jpg',
    })
    probeDisplayImageUrl
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    const items = [
      {id: 3, mediaTypeId: 1, filesize: 0, path: '/empty.mp4', thumb: null as string | null},
      {id: 4, mediaTypeId: 1, filesize: 500, path: '/ok.mp4', width: 0, duration: 0, thumb: null as string | null},
    ]

    await loadHomeMediaThumbs(items, mediaTypes as never, '/db/media')

    expect(items[0].thumb).toBe(IMAGE_UNAVAILABLE_URL)
    expect(taskCreateThumbForVideo).toHaveBeenCalledWith({path: '/ok.mp4', id: 4})
    expect(enqueueQuietMetaBackfill).toHaveBeenCalledWith(4)
    expect(decodeURIComponent(String(items[1].thumb))).toContain('videos/thumbs/4.jpg')
  })
})
