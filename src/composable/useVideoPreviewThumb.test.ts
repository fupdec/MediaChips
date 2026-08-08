import {describe, expect, it, vi, beforeEach} from 'vitest'
import {ref, nextTick} from 'vue'
import {useVideoPreviewThumb} from './useVideoPreviewThumb'

vi.mock('@/stores/items', () => ({
  useItemsStore: () => ({
    thumbRefreshKeys: {},
    consumeThumbRegenerate: () => false,
  }),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => ({
    videoPreviewStatic: 'thumb',
  }),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    taskCreateThumbForVideo: vi.fn(),
  },
}))

vi.mock('@/utils/probeImageUrl', () => ({
  probeDisplayImageUrl: vi.fn(async () => true),
}))

vi.mock('@/utils/thumbSource', async () => {
  const actual = await vi.importActual<typeof import('@/utils/thumbSource')>('@/utils/thumbSource')
  return {
    ...actual,
    resolveMediaThumbDisplayUrl: () => '/thumbs/1.jpg',
  }
})

describe('useVideoPreviewThumb', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses thumbs subfolder by default', () => {
    const isMounted = ref(true)
    const api = useVideoPreviewThumb({
      media: () => ({id: 1, path: '/a.mp4'} as never),
      previewActive: () => true,
      isFileExists: () => true,
      thumbUrl: () => undefined,
      isViewCard: () => true,
      isEmbeddedHost: () => false,
      isMounted: () => isMounted.value,
      mediaPath: () => '/media',
    })

    expect(api.getStaticPreviewSubfolder()).toBe('thumbs')
  })

  it('loads external thumb url without probing', async () => {
    const isMounted = ref(true)
    const thumbUrl = ref<string | undefined>('https://cdn.example/poster.jpg')
    const api = useVideoPreviewThumb({
      media: () => ({id: 2, path: '/b.mp4'} as never),
      previewActive: () => true,
      isFileExists: () => true,
      thumbUrl: () => thumbUrl.value,
      isViewCard: () => true,
      isEmbeddedHost: () => false,
      isMounted: () => isMounted.value,
      mediaPath: () => '/media',
    })

    await nextTick()
    expect(api.usesExternalThumb.value).toBe(true)
    expect(api.thumb.value).toBe('https://cdn.example/poster.jpg')

    await api.getImg()
    expect(api.thumb.value).toBe('https://cdn.example/poster.jpg')
  })

  it('clears thumb state', () => {
    const api = useVideoPreviewThumb({
      media: () => ({id: 3, path: '/c.mp4'} as never),
      previewActive: () => true,
      isFileExists: () => true,
      thumbUrl: () => undefined,
      isViewCard: () => true,
      isEmbeddedHost: () => false,
      isMounted: () => true,
      mediaPath: () => '/media',
    })

    api.thumb.value = '/x.jpg'
    api.thumbLoadStarted.value = true
    api.clearThumbState()
    expect(api.thumb.value).toBeNull()
    expect(api.thumbLoadStarted.value).toBe(false)
  })

  it('pauseOffscreenThumb keeps the last thumb src mounted', () => {
    const api = useVideoPreviewThumb({
      media: () => ({id: 4, path: '/d.mp4'} as never),
      previewActive: () => true,
      isFileExists: () => true,
      thumbUrl: () => undefined,
      isViewCard: () => true,
      isEmbeddedHost: () => false,
      isMounted: () => true,
      mediaPath: () => '/media',
    })

    api.thumb.value = '/thumbs/4.jpg'
    api.thumbLoadStarted.value = true
    api.pauseOffscreenThumb()
    expect(api.thumb.value).toBe('/thumbs/4.jpg')
    expect(api.thumbLoadStarted.value).toBe(false)
  })
})
