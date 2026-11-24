import {beforeEach, describe, expect, it, vi} from 'vitest'
import {invalidateHomeMediaCache, useHomeMedia} from './useHomeMedia'

const mocks = vi.hoisted(() => ({
  get: vi.fn(), thumbs: vi.fn(),
  store: {localhost: 'server-a', dbPath: 'a', mediaPath: '/a', mediaTypes: []},
}))
vi.mock('@/services/typedApi', () => ({typedApi: {getHomeMedia: mocks.get}}))
vi.mock('@/services/apiClient', () => ({getApiBaseUrl: () => mocks.store.localhost}))
vi.mock('@/stores/app', () => ({useAppStore: () => mocks.store}))
vi.mock('@/utils/homeMediaThumbs', () => ({loadHomeMediaThumbs: mocks.thumbs}))
const options = {limits: {favorites: 12}, loadContinue: false, loadFavorites: true, loadTopViews: false}
function deferred() {
  let resolve!: (value: any) => void
  let reject!: (error: Error) => void
  const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej })
  return {promise, resolve, reject}
}
const response = (id: number) => ({data: {favorites: [{id}]}})
beforeEach(() => {
  invalidateHomeMediaCache()
  vi.resetAllMocks()
  mocks.store.dbPath = 'a'
  mocks.store.localhost = 'server-a'
  mocks.thumbs.mockResolvedValue(undefined)
})
describe('home media request ownership', () => {
  it('does not repopulate an invalidated cache', async () => {
    const pending = deferred()
    mocks.get.mockReturnValue(pending.promise)
    const home = useHomeMedia()
    const load = home.loadHomeMedia(options)
    invalidateHomeMediaCache()
    pending.resolve(response(1))
    await load
    expect(home.favorites.value).toEqual([])
    expect(mocks.thumbs).not.toHaveBeenCalled()
  })
  it('keeps the newest result when requests finish in reverse order', async () => {
    const old = deferred(), current = deferred()
    mocks.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const home = useHomeMedia()
    const first = home.loadHomeMedia(options)
    const second = home.loadHomeMedia({...options, limits: {favorites: 24}})
    current.resolve(response(2))
    await second
    old.resolve(response(1))
    await first
    expect(home.favorites.value.map(item => item.id)).toEqual([2])
  })
  it('does not let stale failures clear a newer pending load', async () => {
    const old = deferred(), current = deferred()
    mocks.get.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const home = useHomeMedia()
    const first = home.loadHomeMedia(options)
    const nextOptions = {...options, limits: {favorites: 24}}
    const second = home.loadHomeMedia(nextOptions)
    old.reject(new Error('offline'))
    await first
    expect(home.isLoading.value).toBe(true)
    const duplicate = home.loadHomeMedia(nextOptions)
    expect(mocks.get).toHaveBeenCalledTimes(2)
    current.resolve(response(2))
    await Promise.all([second, duplicate])
    expect(home.isLoading.value).toBe(false)
  })
  it('ignores a response from a library that is no longer active', async () => {
    const pending = deferred()
    mocks.get.mockReturnValue(pending.promise)
    const home = useHomeMedia()
    const load = home.loadHomeMedia(options)
    mocks.store.dbPath = 'b'
    pending.resolve(response(1))
    await load
    expect(home.favorites.value).toEqual([])
  })
  it('does not publish shuffled favorites after invalidation during thumbnail loading', async () => {
    const thumbnails = deferred()
    mocks.get.mockResolvedValue(response(1))
    mocks.thumbs.mockReturnValue(thumbnails.promise)
    const home = useHomeMedia()
    const shuffle = home.reshuffleFavorites()
    await Promise.resolve()
    invalidateHomeMediaCache()
    thumbnails.resolve(undefined)
    await shuffle
    expect(home.favorites.value).toEqual([])
    expect(home.favoritesLoading.value).toBe(false)
  })
})

it('does not overwrite newer shuffled favorites with an older full-page response', async () => {
  const page = deferred(), shuffle = deferred()
  mocks.get.mockReturnValueOnce(page.promise).mockReturnValueOnce(shuffle.promise)
  const home = useHomeMedia()
  const loadingPage = home.loadHomeMedia({...options, loadContinue: true})
  const loadingShuffle = home.reshuffleFavorites()
  shuffle.resolve(response(2))
  await loadingShuffle
  page.resolve({data: {favorites: [{id: 1}], continueWatching: [{id: 3}]}})
  await loadingPage
  expect(home.favorites.value.map(item => item.id)).toEqual([2])
  expect(home.continueWatching.value.map(item => item.id)).toEqual([3])
})


it.each(['page', 'shuffle'])('ignores a pending %s response after changing server with the same library path', async kind => {
  const pending = deferred()
  mocks.get.mockReturnValue(pending.promise)
  const home = useHomeMedia()
  const loading = kind === 'page' ? home.loadHomeMedia(options) : home.reshuffleFavorites()
  mocks.store.localhost = 'server-b'
  pending.resolve(response(1))
  await loading
  expect(home.favorites.value).toEqual([])
  expect(mocks.thumbs).not.toHaveBeenCalled()
})

it('loads a fresh page after changing server even when the library path is the same', async () => {
  mocks.get.mockResolvedValueOnce(response(1)).mockResolvedValueOnce(response(2))
  const home = useHomeMedia()
  await home.loadHomeMedia(options)
  mocks.store.localhost = 'server-b'
  await home.loadHomeMedia(options)
  expect(mocks.get).toHaveBeenCalledTimes(2)
  expect(home.favorites.value.map(item => item.id)).toEqual([2])
})
