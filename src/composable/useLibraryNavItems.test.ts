import {describe, it, expect, beforeEach, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useLibraryNavItems, mediaTypePath, metaPath} from './useLibraryNavItems'
import {serializeLibraryNavConfig} from '@/utils/libraryNavConfig'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    updateMediaType: vi.fn(async () => ({})),
  },
}))

vi.mock('@/composable/appCatalogs', () => ({
  reloadMediaTypesCatalog: vi.fn(async () => {}),
}))

vi.mock('@/services/settingsService', () => ({
  setOption: vi.fn(async (_value: string, option: string) => {
    const {useSettingsStore} = await import('@/stores/settings')
    const settings = useSettingsStore()
    // @ts-expect-error dynamic key for test
    settings[option] = _value
  }),
}))

describe('useLibraryNavItems', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('builds media and meta paths', () => {
    expect(mediaTypePath(3)).toBe('/media?mediaTypeId=3')
    expect(metaPath(9)).toBe('/meta?metaId=9')
  })

  it('includes playlists and markers only when enabled', async () => {
    const {useAppStore} = await import('@/stores/app')
    const {useSettingsStore} = await import('@/stores/settings')
    const appStore = useAppStore()
    const settingsStore = useSettingsStore()

    appStore.mediaTypes = [
      {id: 1, name: 'Video', icon: 'video', hidden: false} as never,
      {id: 2, name: 'Hidden', icon: 'eye-off', hidden: true} as never,
    ]
    settingsStore.showPlaylistsInNavigation = '0'
    settingsStore.showMarkersInNavigation = '0'
    settingsStore.library_nav_config = ''

    const nav = useLibraryNavItems()

    expect(nav.mediaTypes.value.map((item) => item.id)).toEqual([1])
    expect(nav.libraryLinks.value.map((item) => item.key)).toEqual(['home', 'media-1', 'folders'])

    settingsStore.showPlaylistsInNavigation = '1'
    settingsStore.showMarkersInNavigation = '1'

    expect(nav.libraryLinks.value.map((item) => item.key)).toEqual([
      'home',
      'media-1',
      'folders',
      'playlists',
      'markers',
    ])
  })

  it('respects custom library_nav_config order and hidden', async () => {
    const {useAppStore} = await import('@/stores/app')
    const {useSettingsStore} = await import('@/stores/settings')
    const appStore = useAppStore()
    const settingsStore = useSettingsStore()

    appStore.mediaTypes = [
      {id: 1, name: 'Video', icon: 'video', hidden: false} as never,
      {id: 2, name: 'Image', icon: 'image', hidden: false} as never,
    ]
    settingsStore.library_nav_config = serializeLibraryNavConfig({
      order: ['folders', 'media-2', 'home', 'playlists', 'media-1', 'markers'],
      hidden: {
        home: false,
        folders: false,
        playlists: true,
        markers: false,
        'media-1': true,
        'media-2': false,
      },
    })

    const nav = useLibraryNavItems()

    expect(nav.libraryLinks.value.map((item) => item.key)).toEqual([
      'folders',
      'media-2',
      'home',
      'markers',
    ])
    expect(nav.libraryEditItems.value.map((item) => item.key)).toEqual([
      'folders',
      'media-2',
      'home',
      'playlists',
      'media-1',
      'markers',
    ])
    expect(nav.libraryEditItems.value.find((item) => item.key === 'playlists')?.hidden).toBe(true)
  })

  it('includes trash in navigation only when enabled', async () => {
    const {useSettingsStore} = await import('@/stores/settings')
    const settingsStore = useSettingsStore()

    settingsStore.showTrashInNavigation = '0'
    const nav = useLibraryNavItems()
    expect(nav.showTrash.value).toBe(false)

    settingsStore.showTrashInNavigation = '1'
    expect(nav.showTrash.value).toBe(true)
  })

  it('splits visible and hidden meta categories', async () => {
    const {useAppStore} = await import('@/stores/app')
    const appStore = useAppStore()
    appStore.meta = [
      {id: 1, name: 'Tags', type: 'array', icon: 'tag', hidden: false} as never,
      {id: 2, name: 'Hidden', type: 'array', icon: 'eye-off', hidden: true} as never,
      {id: 3, name: 'Rating', type: 'number', icon: 'star', hidden: false} as never,
    ]

    const nav = useLibraryNavItems()

    expect(nav.metaVisible.value.map((item) => item.id)).toEqual([1])
    expect(nav.metaHidden.value.map((item) => item.id)).toEqual([2])
    expect(nav.metaArray.value.map((item) => item.id)).toEqual([1, 2])
  })
})
