import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import {useAppStore} from '@/stores/app'
import {useDialogsStore} from '@/stores/dialogs'
import {useSettingsStore} from '@/stores/settings'
import {useWatcherStore} from '@/stores/watcher'
import {useMediaInbox} from '@/composable/useMediaInbox'
import {reloadMediaTypesCatalog} from '@/composable/appCatalogs'
import {setOption} from '@/services/settingsService'
import {typedApi} from '@/services/typedApi'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import {
  isLibraryNavItemHidden,
  mediaTypeNavKey,
  parseLibraryNavConfig,
  parseMediaTypeNavKey,
  serializeLibraryNavConfig,
  type LibraryNavConfig,
  type LibraryNavKey,
} from '@/utils/libraryNavConfig'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'

export type LibraryNavLink = {
  key: string
  to: string
  icon: string
  title: string
  exact?: boolean
}

export type LibraryNavEditItem = LibraryNavLink & {
  hidden: boolean
}

export function mediaTypePath(id: number | string) {
  return `/media?mediaTypeId=${id}`
}

export function metaPath(id: number | string) {
  return `/meta?metaId=${id}`
}

function sortMetaNavItems(items: Meta[]) {
  return orderBy(items, ['hidden', 'order'], ['asc', 'asc'])
}

function legacyNavFlags(settings: {showPlaylistsInNavigation: string; showMarkersInNavigation: string}) {
  return {
    showPlaylists: settings.showPlaylistsInNavigation === '1',
    showMarkers: settings.showMarkersInNavigation === '1',
  }
}

export function useLibraryNavItems() {
  const {t} = useI18n()
  const appStore = useAppStore()
  const dialogsStore = useDialogsStore()
  const settingsStore = useSettingsStore()
  const watcherStore = useWatcherStore()
  const {badgeCount: inboxBadgeCount, openInbox, newCount: inboxNewCount, lostCount: inboxLostCount} = useMediaInbox()

  const openTrash = () => {
    dialogsStore.openMediaTrash()
  }

  const trashLink = computed(() => ({
    key: 'trash',
    icon: 'mdi-delete-outline',
    title: t('media_trash.title'),
  }))

  const allMediaTypes = computed(() => appStore.mediaTypes || [])

  const libraryNavConfig = computed(() =>
    parseLibraryNavConfig(
      settingsStore.library_nav_config,
      allMediaTypes.value,
      legacyNavFlags(settingsStore),
    ),
  )

  const mediaTypes = computed(() =>
    allMediaTypes.value.filter((item) => {
      const key = mediaTypeNavKey(item.id)
      return !isLibraryNavItemHidden(libraryNavConfig.value, key) && !item.hidden
    }),
  )

  const mediaTypesHidden = computed(() =>
    allMediaTypes.value.filter((item) => {
      const key = mediaTypeNavKey(item.id)
      return isLibraryNavItemHidden(libraryNavConfig.value, key) || Boolean(item.hidden)
    }),
  )

  const metaArray = computed(() =>
    sortMetaNavItems(appStore.meta.filter((item) => item.type === 'array')),
  )

  const metaVisible = computed(() =>
    metaArray.value.filter((item) => !item.hidden),
  )

  const metaHidden = computed(() =>
    metaArray.value.filter((item) => item.hidden),
  )

  const showPlaylists = computed(() => !isLibraryNavItemHidden(libraryNavConfig.value, 'playlists'))
  const showMarkers = computed(() => !isLibraryNavItemHidden(libraryNavConfig.value, 'markers'))
  const showTrash = computed(() => settingsStore.showTrashInNavigation === '1')
  const showWatchFolders = computed(() => settingsStore.watchFolders === '1')

  function structuralLink(key: 'home' | 'folders' | 'playlists' | 'markers'): LibraryNavLink {
    switch (key) {
      case 'home':
        return {
          key: 'home',
          to: '/',
          icon: 'mdi-home-outline',
          title: t('navigation.home'),
        }
      case 'folders':
        return {
          key: 'folders',
          to: '/folders',
          icon: 'mdi-folder-outline',
          title: t('navigation.folders'),
          exact: true,
        }
      case 'playlists':
        return {
          key: 'playlists',
          to: '/playlists',
          icon: 'mdi-format-list-bulleted',
          title: t('navigation.playlists'),
        }
      case 'markers':
        return {
          key: 'markers',
          to: '/markers',
          icon: 'mdi-tooltip-outline',
          title: t('navigation.markers'),
        }
    }
  }

  function linkForKey(key: LibraryNavKey): LibraryNavLink | null {
    const mediaId = parseMediaTypeNavKey(key)
    if (mediaId != null) {
      const mediaType = allMediaTypes.value.find((item) => item.id === mediaId)
      if (!mediaType) return null
      return mediaTypeLink(mediaType, t)
    }
    if (key === 'home' || key === 'folders' || key === 'playlists' || key === 'markers') {
      return structuralLink(key)
    }
    return null
  }

  const libraryEditItems = computed((): LibraryNavEditItem[] => {
    const config = libraryNavConfig.value
    const items: LibraryNavEditItem[] = []
    for (const key of config.order) {
      const link = linkForKey(key)
      if (!link) continue
      const mediaId = parseMediaTypeNavKey(key)
      const mediaType = mediaId != null
        ? allMediaTypes.value.find((item) => item.id === mediaId)
        : null
      const hidden = isLibraryNavItemHidden(config, key) || Boolean(mediaType?.hidden)
      items.push({
        ...link,
        hidden,
      })
    }
    return items
  })

  const libraryLinks = computed((): LibraryNavLink[] =>
    libraryEditItems.value
      .filter((item) => !item.hidden)
      .map(({hidden: _hidden, ...link}) => link),
  )

  const settingsLink = computed((): LibraryNavLink => ({
    key: 'settings',
    to: '/settings',
    icon: 'mdi-cog-outline',
    title: t('navigation.settings'),
  }))

  const allTagsLink = computed((): LibraryNavLink => ({
    key: 'all-tags',
    to: '/tags',
    icon: 'mdi-tag-multiple-outline',
    title: t('navigation.all_tags'),
    exact: true,
  }))

  async function persistLibraryNavConfig(config: LibraryNavConfig): Promise<void> {
    const serialized = serializeLibraryNavConfig(config)
    settingsStore.library_nav_config = serialized
    await setOption(serialized, 'library_nav_config')

    const playlistsValue = config.hidden.playlists ? '0' : '1'
    const markersValue = config.hidden.markers ? '0' : '1'
    if (settingsStore.showPlaylistsInNavigation !== playlistsValue) {
      await setOption(playlistsValue, 'showPlaylistsInNavigation')
    }
    if (settingsStore.showMarkersInNavigation !== markersValue) {
      await setOption(markersValue, 'showMarkersInNavigation')
    }
  }

  async function setLibraryNavOrder(keys: string[]): Promise<void> {
    const current = libraryNavConfig.value
    const mediaTypeIds = new Set(allMediaTypes.value.map((item) => item.id))
    const nextOrder = keys.filter((key): key is LibraryNavKey => {
      if (key === 'home' || key === 'folders' || key === 'playlists' || key === 'markers') return true
      const id = parseMediaTypeNavKey(key)
      return id != null && mediaTypeIds.has(id)
    })

    const next: LibraryNavConfig = {
      order: nextOrder,
      hidden: {...current.hidden},
    }

    // Keep any known keys that were missing from the drag list.
    for (const key of current.order) {
      if (!next.order.includes(key)) next.order.push(key)
    }

    await persistLibraryNavConfig(next)

    const mediaKeys = next.order
      .map((key) => parseMediaTypeNavKey(key))
      .filter((id): id is number => id != null)

    await Promise.all(
      mediaKeys.map(async (id, index) => {
        try {
          await typedApi.updateMediaType(id, {order: index})
        } catch (error) {
          console.error('Failed updating media type order', id, error)
        }
      }),
    )
    await reloadMediaTypesCatalog()
  }

  async function toggleLibraryNavHidden(key: string): Promise<void> {
    const current = libraryNavConfig.value
    const mediaId = parseMediaTypeNavKey(key)
    const mediaType = mediaId != null
      ? allMediaTypes.value.find((item) => item.id === mediaId)
      : null
    const currentlyHidden = isLibraryNavItemHidden(current, key) || Boolean(mediaType?.hidden)
    const nextHidden = !currentlyHidden
    const next: LibraryNavConfig = {
      order: [...current.order],
      hidden: {
        ...current.hidden,
        [key]: nextHidden,
      },
    }

    await persistLibraryNavConfig(next)

    if (mediaId != null) {
      try {
        await typedApi.updateMediaType(mediaId, {hidden: nextHidden})
        await reloadMediaTypesCatalog()
      } catch (error) {
        console.error('Failed updating media type hidden', mediaId, error)
      }
    }
  }

  async function syncLibraryNavFromLegacyFlags(): Promise<void> {
    const current = libraryNavConfig.value
    const playlistsHidden = settingsStore.showPlaylistsInNavigation !== '1'
    const markersHidden = settingsStore.showMarkersInNavigation !== '1'
    if (
      current.hidden.playlists === playlistsHidden
      && current.hidden.markers === markersHidden
    ) {
      return
    }

    await persistLibraryNavConfig({
      order: [...current.order],
      hidden: {
        ...current.hidden,
        playlists: playlistsHidden,
        markers: markersHidden,
      },
    })
  }

  return {
    mediaTypes,
    mediaTypesHidden,
    allMediaTypes,
    metaArray,
    metaVisible,
    metaHidden,
    showPlaylists,
    showMarkers,
    showTrash,
    showWatchFolders,
    inboxBadgeCount,
    inboxNewCount,
    inboxLostCount,
    showInbox: computed(() =>
      showWatchFolders.value || inboxBadgeCount.value > 0 || inboxLostCount.value > 0
    ),
    libraryLinks,
    libraryEditItems,
    libraryNavConfig,
    settingsLink,
    allTagsLink,
    trashLink,
    watcherBusy: computed(() => watcherStore.busy),
    openInbox,
    openTrash,
    mediaTypePath,
    metaPath,
    mediaTypeTitle: (mediaType: MediaType) => getMediaTypeName(mediaType, t),
    metaLink: (meta: Meta): LibraryNavLink => ({
      key: `meta-${meta.id}`,
      to: metaPath(meta.id),
      icon: `mdi-${meta.icon || 'tag'}`,
      title: meta.name || String(meta.id),
      exact: true,
    }),
    setLibraryNavOrder,
    toggleLibraryNavHidden,
    syncLibraryNavFromLegacyFlags,
  }
}

function mediaTypeLink(
  mediaType: MediaType,
  t: ReturnType<typeof useI18n>['t'],
): LibraryNavLink {
  return {
    key: `media-${mediaType.id}`,
    to: mediaTypePath(mediaType.id),
    icon: `mdi-${mediaType.icon}`,
    title: getMediaTypeName(mediaType, t),
    exact: true,
  }
}
