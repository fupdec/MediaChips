import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {nextTick, ref} from 'vue'

// The composable registers lifecycle hooks, but these tests call it outside a component on purpose.
const nativeWarn = console.warn.bind(console)
beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes('no active component instance')) return
    nativeWarn(...args)
  })
})
afterAll(() => vi.restoreAllMocks())

vi.mock('@/utils/thumbSource', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbSource')>()
  return {
    ...actual,
    resolveGridSpriteDisplayUrl: vi.fn(() => '/api/get-file?url=grids%2F7.jpg'),
  }
})

vi.mock('@/utils/thumbDisplayCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/thumbDisplayCache')>()
  return {
    ...actual,
    setCachedThumb: vi.fn(),
  }
})

import {
  computeStoryScrollOffset,
  getGridFrameDurationLabel,
  shouldShowFramesInProgressMessage,
  useItemPreviewTimelineFrames,
} from './useItemPreviewTimelineFrames'

describe('getGridFrameDurationLabel', () => {
  it('returns fallback label when media duration is missing', () => {
    expect(getGridFrameDurationLabel(4, 0, '00:00')).toBe('00:00')
  })

  it('returns readable duration from frame percent', () => {
    expect(getGridFrameDurationLabel(4, 100, '00:00')).toBe('00:50')
  })
})

describe('shouldShowFramesInProgressMessage', () => {
  it('shows message only while fallback frames are generating', () => {
    expect(shouldShowFramesInProgressMessage(true, true, true)).toBe(true)
    expect(shouldShowFramesInProgressMessage(true, false, true)).toBe(false)
    expect(shouldShowFramesInProgressMessage(false, true, true)).toBe(false)
    expect(shouldShowFramesInProgressMessage(true, true, false)).toBe(false)
  })
})

describe('computeStoryScrollOffset', () => {
  it('returns null when wrapper fits inside story width', () => {
    expect(computeStoryScrollOffset(40, 200, 200)).toBeNull()
    expect(computeStoryScrollOffset(40, 300, 200)).toBeNull()
  })

  it('computes scroll offset from pointer position', () => {
    expect(computeStoryScrollOffset(100, 200, 600)).toBe(200)
  })
})

describe('useItemPreviewTimelineFrames', () => {
  it('clearTimelineFrames resets timeline state', () => {
    const {gridSpriteUrl, hoverFrameIndex, storyUsesThumbFallback, clearTimelineFrames} =
      useItemPreviewTimelineFrames({
        media: {id: 1} as never,
        isFileExists: true,
        isMounted: true,
        isViewTimeline: false,
        showTimelinePreview: false,
        mediaDuration: 100,
        durationLabel: '01:40',
        mediaAspectRatio: 16 / 9,
        isTaskRunning: false,
        mediaPath: '/media',
        itemsView: 1,
        previewActive: true,
        thumb: ref(null),
        resolveThumbFallback: () => null,
        getImg: vi.fn(async () => {}),
        runImageProbe: vi.fn(async () => false),
        getStoryEl: () => null,
        getStoryWrapperEl: () => null,
      })

    gridSpriteUrl.value = 'grid.jpg'
    hoverFrameIndex.value = 3
    storyUsesThumbFallback.value = true

    clearTimelineFrames()

    expect(gridSpriteUrl.value).toBeNull()
    expect(hoverFrameIndex.value).toBe(0)
    expect(storyUsesThumbFallback.value).toBe(false)
  })

  it('uses the remote poster in timeline view without requesting or generating a sprite', async () => {
    const getImg = vi.fn(async () => {})
    const runImageProbe = vi.fn(async () => false)
    const createGrid = vi.fn(async () => {})
    const api = useItemPreviewTimelineFrames({
      media: {id: 77, path: 'https://example.com/watch/123'} as never,
      isFileExists: true, isMounted: true, isViewTimeline: true,
      showTimelinePreview: false, mediaDuration: 100, durationLabel: '01:40',
      mediaAspectRatio: 16 / 9, isTaskRunning: false, mediaPath: '/media',
      itemsView: 2, previewActive: true, thumb: '/poster.jpg',
      resolveThumbFallback: () => '/poster.jpg', getImg, runImageProbe, createGrid,
      getStoryEl: () => null, getStoryWrapperEl: () => null,
    })
    await api.initFrames()
    expect(api.storyUsesThumbFallback.value).toBe(true)
    expect(api.gridSpriteUrl.value).toBeNull()
    expect(getImg).toHaveBeenCalled()
    expect(runImageProbe).not.toHaveBeenCalled()
    expect(createGrid).not.toHaveBeenCalled()
  })

  it('loads frames when mounted while already active in timeline view', async () => {
    const isMounted = ref(false)
    const getImg = vi.fn(async () => {})
    const runImageProbe = vi.fn(async () => true)

    const {gridSpriteUrl} = useItemPreviewTimelineFrames({
      media: {id: 7} as never,
      isFileExists: true,
      isMounted: () => isMounted.value,
      isViewTimeline: true,
      showTimelinePreview: false,
      mediaDuration: 100,
      durationLabel: '01:40',
      mediaAspectRatio: 16 / 9,
      isTaskRunning: false,
      mediaPath: '/media',
      itemsView: 2,
      previewActive: true,
      thumb: ref(null),
      resolveThumbFallback: () => null,
      getImg,
      runImageProbe,
      getStoryEl: () => null,
      getStoryWrapperEl: () => null,
    })

    await nextTick()
    expect(getImg).not.toHaveBeenCalled()

    isMounted.value = true
    await vi.waitFor(() => expect(getImg).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(gridSpriteUrl.value).toContain('7.jpg'))
    expect(runImageProbe).toHaveBeenCalled()
  })

  it('does not re-probe an already loaded timeline sprite', async () => {
    const isMounted = ref(true)
    const isTaskRunning = ref(true)
    const getImg = vi.fn(async () => {})
    const runImageProbe = vi.fn(async () => true)

    const {gridSpriteUrl, initFrames} = useItemPreviewTimelineFrames({
      media: {id: 9} as never,
      isFileExists: true,
      isMounted: () => isMounted.value,
      isViewTimeline: true,
      showTimelinePreview: false,
      mediaDuration: 100,
      durationLabel: '01:40',
      mediaAspectRatio: 16 / 9,
      isTaskRunning: () => isTaskRunning.value,
      mediaPath: '/media',
      itemsView: 2,
      previewActive: true,
      thumb: ref(null),
      resolveThumbFallback: () => null,
      getImg,
      runImageProbe,
      getStoryEl: () => null,
      getStoryWrapperEl: () => null,
    })

    await vi.waitFor(() => expect(gridSpriteUrl.value).toContain('grids'))
    const probesAfterLoad = runImageProbe.mock.calls.length
    const getImgAfterLoad = getImg.mock.calls.length

    await initFrames()
    expect(runImageProbe).toHaveBeenCalledTimes(probesAfterLoad)
    expect(getImg).toHaveBeenCalledTimes(getImgAfterLoad)

    isTaskRunning.value = false
    await nextTick()
    expect(runImageProbe).toHaveBeenCalledTimes(probesAfterLoad)
    expect(getImg).toHaveBeenCalledTimes(getImgAfterLoad)
  })

  it('keeps an existing sprite when a later probe fails', async () => {
    const isMounted = ref(true)
    let probeOk = true
    const runImageProbe = vi.fn(async () => probeOk)

    const {gridSpriteUrl, ensureGridSpriteLoaded} = useItemPreviewTimelineFrames({
      media: {id: 11} as never,
      isFileExists: true,
      isMounted: () => isMounted.value,
      isViewTimeline: true,
      showTimelinePreview: false,
      mediaDuration: 100,
      durationLabel: '01:40',
      mediaAspectRatio: 16 / 9,
      isTaskRunning: false,
      mediaPath: '/media',
      itemsView: 2,
      previewActive: true,
      thumb: ref(null),
      resolveThumbFallback: () => null,
      getImg: vi.fn(async () => {}),
      runImageProbe,
      getStoryEl: () => null,
      getStoryWrapperEl: () => null,
    })

    await vi.waitFor(() => expect(gridSpriteUrl.value).toContain('grids'))
    const loadedUrl = gridSpriteUrl.value
    probeOk = false
    await expect(ensureGridSpriteLoaded({force: true})).resolves.toBe(false)
    expect(gridSpriteUrl.value).toBeNull()

    gridSpriteUrl.value = loadedUrl
    await expect(ensureGridSpriteLoaded()).resolves.toBe(true)
    expect(gridSpriteUrl.value).toBe(loadedUrl)
  })
})

describe('timeline request lifecycle', () => {
  function setup(runImageProbe: (url: string) => Promise<boolean>, createGrid?: (input: string, output: string) => Promise<unknown>) {
    return useItemPreviewTimelineFrames({
      media: {id: 7, path: '/video.mp4'} as never,
      isFileExists: true, isMounted: false, isViewTimeline: false,
      showTimelinePreview: false, mediaDuration: 100, durationLabel: '01:40',
      mediaAspectRatio: 16 / 9, isTaskRunning: false, mediaPath: '/media',
      itemsView: 2, previewActive: false, thumb: null,
      resolveThumbFallback: () => null, getImg: async () => {}, runImageProbe, createGrid,
      getStoryEl: () => null, getStoryWrapperEl: () => null,
    })
  }
  it('does not restore a cleared preview when a pending probe finishes', async () => {
    let resolve!: (value: boolean) => void
    const api = setup(() => new Promise<boolean>(done => { resolve = done }))
    const pending = api.ensureGridSpriteLoaded()
    api.clearTimelineFrames()
    resolve(true)
    await pending
    expect(api.gridSpriteUrl.value).toBeNull()
    expect(api.gridLoading.value).toBe(false)
  })
  it('keeps the loading state of the newest probe when an older one finishes', async () => {
    const resolvers: ((value: boolean) => void)[] = []
    const api = setup(() => new Promise<boolean>(done => { resolvers.push(done) }))
    const old = api.ensureGridSpriteLoaded()
    const latest = api.ensureGridSpriteLoaded({force: true})
    resolvers[0](true)
    await old
    expect(api.gridLoading.value).toBe(true)
    expect(api.gridSpriteUrl.value).toBeNull()
    resolvers[1](true)
    await latest
    expect(api.gridLoading.value).toBe(false)
    expect(api.gridSpriteUrl.value).toContain('7.jpg')
  })
  it('waits for an existing sprite generation when a newer request takes over', async () => {
    let finish!: () => void
    let generated = false
    const creation = new Promise<void>(resolve => { finish = () => { generated = true; resolve() } })
    const createGrid = vi.fn(() => creation)
    const probe = vi.fn(async () => generated)
    const api = setup(probe, createGrid)
    const first = api.ensureGridSpriteLoaded()
    await Promise.resolve()
    expect(createGrid).toHaveBeenCalledTimes(1)
    const second = api.ensureGridSpriteLoaded({force: true})
    await Promise.resolve()
    finish()
    await first
    expect(await second).toBe(true)
    expect(createGrid).toHaveBeenCalledTimes(1)
    expect(api.gridSpriteUrl.value).toContain('7.jpg')
    expect(api.storyUsesThumbFallback.value).toBe(false)
  })

})
