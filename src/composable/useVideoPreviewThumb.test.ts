import {describe, expect, it, vi, beforeEach} from 'vitest'
import {ref, nextTick} from 'vue'
import {useVideoPreviewThumb} from './useVideoPreviewThumb'
import {typedApi} from '@/services/typedApi'
import {probeDisplayImageUrl} from '@/utils/probeImageUrl'

const settings = vi.hoisted(() => ({videoPreviewStatic: 'thumb'}))

vi.mock('@/stores/items', () => ({
  useItemsStore: () => ({
    thumbRefreshKeys: {},
    consumeThumbRegenerate: () => false,
  }),
}))

vi.mock('@/stores/settings', () => ({
  useSettingsStore: () => settings,
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    taskCreateThumbForVideo: vi.fn(),
  },
}))

vi.mock('@/services/fileService', () => ({buildLocalFileUrl: () => '/generated-thumb.jpg'}))

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
    settings.videoPreviewStatic = 'thumb'
    vi.mocked(probeDisplayImageUrl).mockResolvedValue(true)
  })

  it.each([
    'https://example.com/watch/123',
    'gdrive://file123',
    'nas://11111111-1111-4111-8111-111111111111/movie.mp4',
    'onedrive://11111111-1111-4111-8111-111111111111/movie',
  ])('uses a static poster without local generation for %s', async path => {
    settings.videoPreviewStatic = 'grid'
    vi.mocked(probeDisplayImageUrl).mockResolvedValue(false)
    const api = useVideoPreviewThumb({
      media: () => ({id: 101, path} as never),
      previewActive: () => true, isFileExists: () => true,
      thumbUrl: () => undefined, isViewCard: () => true,
      isEmbeddedHost: () => false, isMounted: () => true,
      mediaPath: () => '/media',
    })
    expect(api.getStaticPreviewSubfolder()).toBe('thumbs')
    await api.getImg()
    expect(typedApi.taskCreateThumbForVideo).not.toHaveBeenCalled()
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

it('loads each card when the same media is displayed by two instances', async () => {
  let finish!: (value: boolean) => void
  const probe = new Promise<boolean>(resolve => { finish = resolve })
  vi.mocked(probeDisplayImageUrl).mockReturnValue(probe)
  const options = {
    media: {id: 987, path: '/same.mp4'} as never,
    previewActive: true, isFileExists: true, thumbUrl: undefined,
    isViewCard: true, isEmbeddedHost: false, isMounted: true, mediaPath: '/media',
  }
  const first = useVideoPreviewThumb(options)
  const second = useVideoPreviewThumb(options)
  const loadingFirst = first.getImg()
  const loadingSecond = second.getImg()
  finish(true)
  await Promise.all([loadingFirst, loadingSecond])
  expect(first.thumb.value).toBeTruthy()
  expect(second.thumb.value).toBe(first.thumb.value)
  expect(second.thumbLoadStarted.value).toBe(true)
})

it('does not generate a thumbnail after its pending probe is cancelled offscreen', async () => {
  vi.mocked(typedApi.taskCreateThumbForVideo).mockReset()
  vi.mocked(probeDisplayImageUrl).mockImplementation((_url, signal) => new Promise(resolve => {
    signal?.addEventListener('abort', () => resolve(false), {once: true})
  }))
  const api = useVideoPreviewThumb({
    media: {id: 988, path: '/cancelled.mp4'} as never,
    previewActive: true, isFileExists: true, thumbUrl: undefined,
    isViewCard: true, isEmbeddedHost: false, isMounted: true, mediaPath: '/media',
  })
  const loading = api.getImg()
  api.pauseOffscreenThumb()
  await loading
  expect(typedApi.taskCreateThumbForVideo).not.toHaveBeenCalled()
  expect(api.thumbCreateAttempted.value).toBe(false)
})

it('generates a missing poster only once when concurrent probes both report it missing', async () => {
  settings.videoPreviewStatic = 'thumb'
  const probes: ((value: boolean) => void)[] = []
  vi.mocked(probeDisplayImageUrl).mockImplementation(() => new Promise(resolve => { probes.push(resolve) }))
  let finishCreation!: () => void
  const creation = new Promise<void>(resolve => { finishCreation = resolve })
  vi.mocked(typedApi.taskCreateThumbForVideo).mockReset().mockReturnValue(creation as never)
  const api = useVideoPreviewThumb({
    media: {id: 989, path: '/concurrent.mp4'} as never,
    previewActive: true, isFileExists: true, thumbUrl: undefined,
    isViewCard: true, isEmbeddedHost: false, isMounted: true, mediaPath: '/media',
  })
  const first = api.getImg({bust: 1})
  const second = api.getImg({bust: 2})
  probes.forEach(resolve => resolve(false))
  await Promise.resolve()
  await Promise.resolve()
  const creations = vi.mocked(typedApi.taskCreateThumbForVideo).mock.calls.length
  // Release all backend calls even if the assertion below fails.
  finishCreation()
  expect(creations).toBe(1)
  await Promise.all([first, second])
})

it('starts a fresh load after cancellation even before the old promise settles', async () => {
  settings.videoPreviewStatic = 'thumb'
  vi.mocked(probeDisplayImageUrl).mockImplementation((_url, signal) => new Promise(resolve => {
    signal?.addEventListener('abort', () => resolve(false), {once: true})
  }))
  const api = useVideoPreviewThumb({
    media: {id: 990, path: '/reentered.mp4'} as never,
    previewActive: true, isFileExists: true, thumbUrl: undefined,
    isViewCard: true, isEmbeddedHost: false, isMounted: true, mediaPath: '/media',
  })
  const old = api.getImg()
  api.clearThumbState()
  vi.mocked(probeDisplayImageUrl).mockResolvedValue(true)
  const fresh = api.getImg()
  await Promise.all([old, fresh])
  expect(api.thumb.value).toBeTruthy()
  expect(api.thumbLoadStarted.value).toBe(true)
})
