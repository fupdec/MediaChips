import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {effectScope, reactive, ref, type EffectScope} from 'vue'
import type {MediaItem} from '@/types/stores'
import {CLOUD_METADATA_SYNC_MS, cloudMetadataRetryDelayMs, useCloudMetadataSync} from './useCloudMetadataSync'

const load = vi.hoisted(() => vi.fn())
const refreshThumb = vi.hoisted(() => vi.fn())
vi.mock('@/services/fileService', () => ({buildLocalFileUrl: (file: string, _outside: boolean, version: number) => `/api/get-file?url=${encodeURIComponent(file)}&_t=${version}`}))
let app: {dbPath: string; localhost: string; mediaPath: string; mediaTypes: Array<{id: number; type: string}>}
let items: {itemsOnPage: MediaItem[]; entities: MediaItem[]; navigationItems: MediaItem[]; refreshThumb: typeof refreshThumb}
let dialogs: {mediaEditing: {show: boolean; media: MediaItem | null}}
let home: MediaItem[]
vi.mock('@/stores/app', () => ({useAppStore: () => app}))
vi.mock('@/stores/items', () => ({useItemsStore: () => items}))
vi.mock('@/stores/dialogs', () => ({useDialogsStore: () => dialogs}))
vi.mock('@/composable/useHomeMedia', () => ({getLoadedHomeMedia: () => home}))
vi.mock('@/services/typedApi', () => ({typedApi: {getCloudMediaMetadata: load}}))
vi.mock('@/services/apiClient', () => ({getApiBaseUrl: (state: typeof app) => state.localhost}))
let scope: EffectScope
const enabled = ref(true)
const cloud = (id = 1, overrides: Partial<MediaItem> = {}): MediaItem => ({
  id, path: `gdrive://file${id}`, mediaTypeId: 1, filesize: 100, duration: 0, width: 0, height: 0, ...overrides,
})
const metadata = (item: MediaItem) => ({...item, duration: 90, width: 1920, height: 1080, name: 'Upstream name', time: 0, rating: 0})
const advance = () => vi.advanceTimersByTimeAsync(CLOUD_METADATA_SYNC_MS)
function start() { scope = effectScope(); scope.run(() => useCloudMetadataSync(enabled)) }
beforeEach(() => {
  vi.useFakeTimers(); load.mockReset(); refreshThumb.mockClear(); enabled.value = true
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
  app = reactive({dbPath: '/library-a', localhost: 'http://server-a', mediaPath: '/library-a/media', mediaTypes: [{id: 1, type: 'video'}, {id: 2, type: 'image'}, {id: 3, type: 'audio'}]})
  items = reactive({itemsOnPage: [], entities: [], navigationItems: [], refreshThumb})
  dialogs = reactive({mediaEditing: {show: false, media: null}})
  home = reactive([])
  load.mockImplementation(async (ids: number[]) => ({data: {items: ids.map(id => metadata(cloud(id)))}}))
})
afterEach(() => { scope?.stop(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('live cloud metadata cards', () => {
  it('patches loaded cards, home widgets and the inspector in place without resetting user fields', async () => {
    items.itemsOnPage.push(cloud(1, {name: 'My name', rating: 5, time: 12}))
    items.entities.push(cloud())
    items.navigationItems.push(cloud())
    home.push(cloud())
    dialogs.mediaEditing = {show: true, media: cloud()}
    const card = items.itemsOnPage[0]
    start(); await advance()
    expect(load).toHaveBeenCalledTimes(1)
    expect(load.mock.calls[0][0]).toEqual([1])
    expect(items.itemsOnPage[0]).toBe(card)
    for (const target of [card, items.entities[0], items.navigationItems[0], home[0], dialogs.mediaEditing.media]) {
      expect(target).toMatchObject({duration: 90, width: 1920, height: 1080})
    }
    expect(card).toMatchObject({name: 'My name', rating: 5, time: 12})
    await advance(); expect(load).toHaveBeenCalledTimes(1)
  })
  it('updates NAS thumbnails after background processing, including home cards and the inspector', async () => {
    const item = cloud(7, {path: 'nas://11111111-1111-4111-8111-111111111111/movie.mp4', duration: 20, width: 640, height: 360, bitrate: 500000, fps: 24, codec: 'h264'})
    items.itemsOnPage.push({...item}); home.push({...item})
    dialogs.mediaEditing = {show: true, media: {...item}}
    load.mockResolvedValueOnce({data: {items: [{...item, thumbnailState: 'pending'}]}})
      .mockResolvedValue({data: {items: [{...item, thumbnailState: 'ready', thumbnailVersion: 12345}]}})
    start(); await advance()
    expect(refreshThumb).not.toHaveBeenCalled()
    await advance()
    expect(refreshThumb).toHaveBeenCalledTimes(1)
    expect(refreshThumb).toHaveBeenCalledWith(7, {broadcast: false})
    for (const target of [items.itemsOnPage[0], home[0], dialogs.mediaEditing.media!]) {
      expect(target.thumbnailState).toBe('ready')
      expect(decodeURIComponent(String(target.thumb))).toContain('/library-a/media/videos/thumbs/7.jpg')
      expect(String(target.thumb)).toContain('_t=12345')
    }
    await advance(); expect(load).toHaveBeenCalledTimes(2)
  })
  it('stops polling NAS audio when no embedded cover exists', async () => {
    const item = cloud(8, {path: 'nas://11111111-1111-4111-8111-111111111111/song.wav', mediaTypeId: 3, duration: 20, bitrate: 40000, codec: 'pcm_s16le'})
    items.itemsOnPage.push(item)
    load.mockResolvedValue({data: {items: [{...item, thumbnailState: 'unavailable'}]}})
    start(); await advance(); await advance()
    expect(load).toHaveBeenCalledTimes(1)
    expect(refreshThumb).not.toHaveBeenCalled()
  })

  it('keeps checking locally while metadata is pending and applies a later completed background result', async () => {
    items.itemsOnPage.push(cloud())
    load.mockResolvedValueOnce({data: {items: [cloud()]}})
    start(); await advance(); expect(items.itemsOnPage[0].duration).toBe(0)
    await advance(); expect(items.itemsOnPage[0].duration).toBe(90)
    await advance(); expect(load).toHaveBeenCalledTimes(2)
  })
  it('backs off for a card whose snapshot never fills the missing fields', async () => {
    items.itemsOnPage.push(cloud())
    load.mockImplementation(async () => ({data: {items: [cloud()]}}))
    start()
    for (let i = 0; i < 12; i++) await advance()
    expect(load).toHaveBeenCalledTimes(4)
    expect([1, 2, 3, 4, 5].map(cloudMetadataRetryDelayMs)).toEqual([5000, 10_000, 20_000, 30_000, 30_000])
  })
  it('starts over after the library changes', async () => {
    items.itemsOnPage.push(cloud())
    load.mockImplementation(async () => ({data: {items: [cloud()]}}))
    start()
    for (let i = 0; i < 6; i++) await advance()
    const before = load.mock.calls.length
    app.dbPath = '/library-b'
    await advance()
    expect(load.mock.calls.length).toBe(before + 1)
  })
  it.each(['library', 'server', 'locked', 'disposed'] as const)('ignores delayed snapshots after the %s changes', async change => {
    items.itemsOnPage.push(cloud())
    let resolve!: (response: unknown) => void
    load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    start(); await advance()
    const signal = load.mock.calls[0][1].signal as AbortSignal
    if (change === 'library') app.dbPath = '/library-b'
    if (change === 'server') app.localhost = 'http://server-b'
    if (change === 'locked') enabled.value = false
    if (change === 'disposed') scope.stop()
    expect(signal.aborted).toBe(true)
    resolve({data: {items: [metadata(cloud())]}})
    await vi.advanceTimersByTimeAsync(0)
    expect(items.itemsOnPage[0].duration).toBe(0)
  })
  it('ignores relinked cards and edits made while the snapshot was loading', async () => {
    items.itemsOnPage.push(cloud(1), cloud(2))
    let resolve!: (response: unknown) => void
    load.mockImplementationOnce(() => new Promise(done => { resolve = done }))
    start(); await advance()
    items.itemsOnPage[0].path = 'gdrive://different'
    items.itemsOnPage[1].duration = 123
    resolve({data: {items: [metadata(cloud(1)), metadata(cloud(2))]}})
    await vi.advanceTimersByTimeAsync(0)
    expect(items.itemsOnPage[0].width).toBe(0)
    expect(items.itemsOnPage[1]).toMatchObject({duration: 123, width: 1920, height: 1080})
  })
  it('avoids requests for complete cloud cards, local media and hidden pages', async () => {
    items.itemsOnPage.push(cloud(1, {duration: 20, width: 640, height: 360}), cloud(2, {path: '/local.mp4'}), cloud(0))
    start(); await advance(); expect(load).not.toHaveBeenCalled()
    items.itemsOnPage.push(cloud(3))
    vi.mocked(Object.getOwnPropertyDescriptor(document, 'visibilityState')!.get!).mockReturnValue('hidden')
    await advance(); expect(load).not.toHaveBeenCalled()
  })
  it('bounds snapshot batches and eventually refreshes every pending card', async () => {
    items.itemsOnPage.push(...Array.from({length: 140}, (_, index) => cloud(index + 1)))
    start()
    for (let tick = 0; tick < 4; tick++) await advance()
    expect(items.itemsOnPage.every(item => item.duration === 90)).toBe(true)
    expect(load.mock.calls.every(([body]) => body.length <= 64)).toBe(true)
  })
  it('does not overlap slow snapshots and recovers after a failed request', async () => {
    items.itemsOnPage.push(cloud())
    let reject!: (error: Error) => void
    load.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail }))
    start(); await advance(); await advance(); expect(load).toHaveBeenCalledTimes(1)
    reject(new Error('offline')); await vi.advanceTimersByTimeAsync(0)
    await advance(); expect(items.itemsOnPage[0].duration).toBe(90)
  })
  it('fills OneDrive video details and image dimensions without requiring unsupported audio codec data', async () => {
    const account = '11111111-1111-4111-8111-111111111111'
    items.itemsOnPage.push(cloud(1, {path: `onedrive://${account}/movie`, duration: 20, width: 640, height: 360}),
      cloud(2, {mediaTypeId: 2}), cloud(3, {path: `onedrive://${account}/song`, mediaTypeId: 3, duration: 20, bitrate: 256000}))
    load.mockResolvedValue({data: {items: [metadata({...items.itemsOnPage[0], fps: 29.97, bitrate: 4000000, codec: 'H264'}), metadata(items.itemsOnPage[1])]}})
    start(); await advance()
    expect(load.mock.calls[0][0]).toEqual([1, 2])
    expect(items.itemsOnPage[0]).toMatchObject({duration: 20, fps: 29.97, bitrate: 4000000, codec: 'H264'})
    expect(items.itemsOnPage[1]).toMatchObject({width: 1920, height: 1080})
  })
})
