import {computed} from 'vue'
import {useI18n} from 'vue-i18n'
import orderBy from 'lodash/orderBy'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useWatcherStore} from '@/stores/watcher'
import {useWatcherBadgeCounts} from '@/composable/useWatcherBadgeCounts'
import {getMediaTypeName} from '@/utils/mediaTypeI18n'
import type {Meta} from '@/types/stores'
import type {MediaType} from '@/types/media'
import type {WatcherFilesEntry} from '@/types/watcher'

export type LibraryNavLink = {
  key: string
  to: string
  icon: string
  title: string
  exact?: boolean
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

export function useLibraryNavItems() {
  const {t} = useI18n()
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const watcherStore = useWatcherStore()
  const {watcherBadgeCountsByFolderId} = useWatcherBadgeCounts()

  const mediaTypes = computed(() =>
    (appStore.mediaTypes || []).filter((item) => !item.hidden),
  )

  const mediaTypesHidden = computed(() =>
    (appStore.mediaTypes || []).filter((item) => item.hidden),
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

  const showPlaylists = computed(() => settingsStore.showPlaylistsInNavigation === '1')
  const showMarkers = computed(() => settingsStore.showMarkersInNavigation === '1')
  const showWatchFolders = computed(() => settingsStore.watchFolders === '1')

  const watcherFiles = computed(() => watcherStore.menuEntries)
  const showWatcherFolders = computed(() =>
    Boolean(watcherFiles.value.length && showWatchFolders.value),
  )

  const libraryLinks = computed((): LibraryNavLink[] => {
    const links: LibraryNavLink[] = [
      {
        key: 'home',
        to: '/',
        icon: 'mdi-home-outline',
        title: t('navigation.home'),
      },
      ...mediaTypes.value.map((mediaType) => mediaTypeLink(mediaType, t)),
    ]

    if (showPlaylists.value) {
      links.push({
        key: 'playlists',
        to: '/playlists',
        icon: 'mdi-format-list-bulleted',
        title: t('navigation.playlists'),
      })
    }

    if (showMarkers.value) {
      links.push({
        key: 'markers',
        to: '/markers',
        icon: 'mdi-tooltip-outline',
        title: t('navigation.markers'),
      })
    }

    return links
  })

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

  function openDialogFolder(folder: WatcherFilesEntry) {
    watcherStore.folder = folder
    watcherStore.dialogFolder = true
  }

  return {
    mediaTypes,
    mediaTypesHidden,
    metaArray,
    metaVisible,
    metaHidden,
    showPlaylists,
    showMarkers,
    showWatchFolders,
    watcherFiles,
    showWatcherFolders,
    watcherBadgeCountsByFolderId,
    libraryLinks,
    settingsLink,
    allTagsLink,
    watcherBusy: computed(() => watcherStore.busy),
    openDialogFolder,
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
