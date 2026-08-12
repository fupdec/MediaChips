import {describe, it, expect, beforeEach, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'
import {useLibraryNavItems, mediaTypePath, metaPath} from './useLibraryNavItems'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
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

    const nav = useLibraryNavItems()

    expect(nav.mediaTypes.value.map((item) => item.id)).toEqual([1])
    expect(nav.libraryLinks.value.map((item) => item.key)).toEqual(['home', 'media-1'])

    settingsStore.showPlaylistsInNavigation = '1'
    settingsStore.showMarkersInNavigation = '1'

    expect(nav.libraryLinks.value.map((item) => item.key)).toEqual([
      'home',
      'media-1',
      'playlists',
      'markers',
    ])
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
