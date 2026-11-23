import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {computed, createApp, nextTick, reactive, ref} from 'vue'
import type {MediaType} from '@/types/media'
import type {MediaItem, Tag} from '@/types/stores'
import {useItemsThumbPrefetch} from './useItemsThumbPrefetch'
import {loadMediaThumbUrls} from '@/utils/mediaThumbLoader'
import {loadTagThumbUrls} from '@/utils/tagThumbLoader'
import {setCachedMediaThumbs, setCachedTagThumbs} from '@/utils/thumbDisplayCache'
import {warmDisplayImageUrl} from '@/utils/probeImageUrl'

const stores = vi.hoisted(() => ({
  app: {dbPath: '/db', mediaPath: '/media'},
  items: {view: 0}, settings: {videoPreviewStatic: 'thumb'},
}))
vi.mock('@/stores/app', () => ({useAppStore: () => stores.app}))
vi.mock('@/stores/items', () => ({useItemsStore: () => stores.items}))
vi.mock('@/stores/settings', () => ({useSettingsStore: () => stores.settings}))
vi.mock('@/utils/mediaType', () => ({
  isImageMediaType: () => false, isVideoMediaType: () => true,
  getMediaDeleteAssetFolder: () => 'videos',
}))
vi.mock('@/utils/mediaThumbLoader', () => ({loadMediaThumbUrls: vi.fn()}))
vi.mock('@/utils/tagThumbLoader', () => ({loadTagThumbUrls: vi.fn()}))
vi.mock('@/utils/thumbDisplayCache', () => ({
  getCachedThumb: () => undefined,
  mediaThumbKey: (folder: string, id: number) => `${folder}:${id}`,
  setCachedMediaThumbs: vi.fn(), setCachedTagThumbs: vi.fn(),
}))
vi.mock('@/utils/thumbSource', () => ({CARD_THUMB_MAX_EDGE: 480}))
vi.mock('@/utils/visibleItemsWindow', async () => ({visibleItemIds: (await import('vue')).ref([])}))
vi.mock('@/utils/quietMediaBackfill', () => ({needsQuietMetaBackfill: () => false, enqueueQuietMetaBackfillMany: vi.fn()}))
vi.mock('@/utils/probeImageUrl', () => ({warmDisplayImageUrl: vi.fn()}))

const cleanups: Array<() => void> = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  stores.app = reactive({dbPath: '/db', mediaPath: '/media'})
  vi.mocked(loadMediaThumbUrls).mockImplementation(async (_path, _folder, ids) =>
    Object.fromEntries(ids.map(id => [id, `/thumb/${id}`])))
  vi.mocked(warmDisplayImageUrl).mockResolvedValue()
})
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers() })

function setup(kind: 'media' | 'tag' = 'media', count = 1) {
  const list = ref<Array<MediaItem | Tag>>(Array.from({length: count}, (_, i) => ({id: i + 1})))
  const metaId = ref(1)
  const app = createApp({setup() {
    useItemsThumbPrefetch({items: computed(() => list.value), itemsType: computed(() => kind),
      mediaType: ref<MediaType | null>({id: 1, type: 'video'}), metaId: computed(() => metaId.value)})
    return () => null
  }})
  app.mount(document.createElement('div'))
  cleanups.push(() => app.unmount())
  return {list, metaId}
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return {promise, resolve}
}
async function flush(ms = 20) { await nextTick(); await vi.advanceTimersByTimeAsync(ms) }

describe('thumbnail prefetch lifecycle', () => {
  it('aborts active image warming on disposal without starting the remaining images', async () => {
    vi.mocked(warmDisplayImageUrl).mockImplementation((_url, signal) => new Promise(resolve => {
      signal!.addEventListener('abort', () => resolve(), {once: true})
    }))
    setup('media', 24)
    await flush()
    expect(warmDisplayImageUrl).toHaveBeenCalledTimes(8)
    const signal = vi.mocked(warmDisplayImageUrl).mock.calls[0][1]
    cleanups.pop()!()
    expect(signal?.aborted).toBe(true)
    await flush()
    expect(warmDisplayImageUrl).toHaveBeenCalledTimes(8)
  })

  it('cancels debounced work and ignores a late URL response after disposal', async () => {
    const pending = deferred<Record<string, string>>()
    vi.mocked(loadMediaThumbUrls).mockReturnValueOnce(pending.promise)
    const {list} = setup()
    list.value = [{id: 2}]
    await nextTick()
    cleanups.pop()!()
    pending.resolve({1: '/old'})
    await flush(500)
    expect(loadMediaThumbUrls).toHaveBeenCalledTimes(1)
    expect(setCachedMediaThumbs).not.toHaveBeenCalled()
    expect(warmDisplayImageUrl).not.toHaveBeenCalled()
  })

  it('does not cache old tag images under a newly selected metadata field', async () => {
    const old = deferred<Record<string, Record<string, string>>>()
    vi.mocked(loadTagThumbUrls).mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce({1: {main: '/new'}})
    const {metaId} = setup('tag')
    metaId.value = 2
    await flush()
    expect(setCachedTagThumbs).toHaveBeenCalledExactlyOnceWith(2, {1: {main: '/new'}})
    old.resolve({1: {main: '/old'}})
    await flush()
    expect(setCachedTagThumbs).toHaveBeenCalledTimes(1)
  })

  it('clears deferred image warming when leaving after a scroll jump', async () => {
    const {list} = setup()
    await flush()
    expect(warmDisplayImageUrl).toHaveBeenCalledTimes(1)
    list.value = [{id: 2}]
    await flush()
    expect(warmDisplayImageUrl).toHaveBeenCalledTimes(1)
    cleanups.pop()!()
    await flush(400)
    expect(warmDisplayImageUrl).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('discards media URL responses from the previous library', async () => {
    const old = deferred<Record<string, string>>()
    vi.mocked(loadMediaThumbUrls).mockReturnValueOnce(old.promise)
    setup()
    stores.app.dbPath = '/new-db'
    stores.app.mediaPath = '/new-media'
    await flush()
    expect(loadMediaThumbUrls).toHaveBeenLastCalledWith('/new-media', 'videos', [1], expect.anything())
    expect(setCachedMediaThumbs).toHaveBeenCalledTimes(1)
    old.resolve({1: '/old-library/thumb'})
    await flush()
    expect(setCachedMediaThumbs).toHaveBeenCalledTimes(1)
  })
})
