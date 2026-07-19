import {computed} from 'vue'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useOperationsStore} from '@/stores/operations'
import {useNotificationsStore} from '@/stores/notifications'
import {useRegistrationStore} from '@/stores/registration'
import {useEventBus} from '@/utils/eventBus'
import path from 'path-browserify'
import {
  getCurrentMediaType,
  getDefaultMediaTypeId,
  getMediaDeleteAssetFolder,
  isAudioMediaType,
  isImageMediaType,
  isTextMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
import {setNotification} from '@/services/notificationService'
import {refreshMediaFileInfo} from '@/services/mediaFileInfoService'
import {openPath} from '@/services/shellService'
import {detectAppPlatform} from '@/composable/useAppPlatform'
import {copyToClipboard} from '@/utils/copyToClipboard'
import {parseFilePath} from '@/services/pathTagParser'
import translate, {type Locale} from '@/utils/translate'
import {resolveSelectedMediaItems} from '@/utils/resolveSelection'
import {useScraperStore} from '@mediachips/plugin-adult/stores/scraper'
import {useAutoScrapeBatch} from '@mediachips/plugin-adult/composables/useAutoScrapeBatch'
import {useAutoSceneScrapeBatch} from '@mediachips/plugin-adult/composables/useAutoSceneScrapeBatch'
import {useSceneScraperStore} from '@mediachips/plugin-adult/stores/sceneScraper'
import {useTmdbPersonAutoScrapeBatch} from '@mediachips/plugin-tmdb/composables/useTmdbPersonAutoScrapeBatch'
import {autoScrapeTmdbPersonTag} from '@mediachips/plugin-tmdb/services/tmdbPersonAutoScrape'
import {isAdultUiAvailable} from '@/services/adultFeatures'
import {isTmdbUiAvailable, isTmdbPersonCategory} from '@/services/tmdbFeatures'
import {isMediaPageItem, isTagPageItem, mediaPageItemPath, type PageItem} from '@/utils/pageItem'
import type { DeleteEntityOnePayload, ParsePathTagEntry } from '@shared/api/responses'
import type { ItemContextMenuEntry } from '@/types/itemsPage'
import type { MediaItem, Meta, Playlist, Tag } from '@/types/stores'

interface DeleteItemPayload extends DeleteEntityOnePayload {
  with_file: boolean
}

export interface ItemContextMenuOptions {
  reg?: boolean
  x?: number
  /** Force single-item menu/actions (e.g. global search results). */
  singleItem?: boolean
}

type ContextItem = PageItem

export default function useItemContextMenu(
  item: ContextItem,
  type: 'media' | 'tag' | string,
  meta: Meta | null | undefined,
  is_file_exists: boolean,
  _emitFn: unknown,
  options: ItemContextMenuOptions = {},
) {
  const store = useAppStore()
  const dialogsStore = useDialogsStore()
  const notificationsStore = useNotificationsStore()
  const operationsStore = useOperationsStore()
  const playlistsStore = useAppStore().playlists
  const itemsStore = useItemsStore()
  const settingsStore = useSettingsStore()
  const registrationStore = useRegistrationStore()

  const eventBus = useEventBus()

  const scraperStore = useScraperStore()
  const sceneScraperStore = useSceneScraperStore()
  const { runForSelection } = useAutoScrapeBatch()
  const { runForSelection: runSceneScrapeForSelection, runForMedia: runSceneScrapeForMedia } = useAutoSceneScrapeBatch()
  const tmdbPersonBatch = useTmdbPersonAutoScrapeBatch()

  const reg = options.reg ?? registrationStore.reg
  const x = options.x ?? 0
  const isSelectMode = () => !options.singleItem && itemsStore.isSelect

  const currentMediaType = computed(() => {
    if (isMediaPageItem(item, type)) {
      return getCurrentMediaType(store.mediaTypes, item.mediaTypeId || itemsStore.environment?.media_type_id)
    }
    return getCurrentMediaType(store.mediaTypes, itemsStore.environment?.media_type_id)
  })

  const getContextMenu = (): ItemContextMenuEntry[] => {
    const locale = settingsStore.locale as Locale
    const t = (key: string, params: Record<string, string | number> = {}) => translate(key, params, locale)
    const contextMenu: ItemContextMenuEntry[] = []
    const canAutoScrape = type === 'tag'
      && isAdultUiAvailable()
      && Boolean(meta?.scraper)
    const canTmdbPersonAutoScrape = type === 'tag'
      && isTmdbUiAvailable()
      && isTmdbPersonCategory(meta, itemsStore.sortedAssigned)
    const canSceneAutoScrape = type === 'media'
      && isAdultUiAvailable()
      && isVideoMediaType(currentMediaType.value)

    if (!isSelectMode()) {
      contextMenu.push({
        name: t('common.edit'),
        type: 'item',
        icon: 'pencil',
        action: editItem,
      })
    } else {
      contextMenu.push({
        name: t('context_menu.bulk_edit'),
        type: 'item',
        icon: 'pencil-plus',
        disabled: itemsStore.selection.length === 0,
        action: () => {
          dialogsStore.bulkEditingItems = true
          itemsStore.isSelect = false
        },
      })

      if (type === 'tag' && meta) {
        contextMenu.push({
          name: t('context_menu.merge_tags'),
          type: 'item',
          icon: 'set-merge',
          disabled: itemsStore.selection.length < 2,
          action: openTagMerge,
        })
      }

      if (canAutoScrape) {
        contextMenu.push({
          name: t('context_menu.bulk_auto_scrape'),
          type: 'item',
          icon: 'cloud-download',
          disabled: itemsStore.selection.length === 0 || scraperStore.autoScrapeInProgress,
          action: () => {
            if (!meta) return
            void runForSelection(meta)
          },
        })
      }

      if (canTmdbPersonAutoScrape) {
        contextMenu.push({
          name: t('context_menu.bulk_tmdb_auto_scrape'),
          type: 'item',
          icon: 'movie-search-outline',
          disabled: itemsStore.selection.length === 0 || tmdbPersonBatch.isInProgress(),
          action: () => {
            if (!meta) return
            void tmdbPersonBatch.runForSelection(meta)
          },
        })
      }

      if (canSceneAutoScrape) {
        contextMenu.push({
          name: t('context_menu.bulk_auto_scrape_scenes'),
          type: 'item',
          icon: 'cloud-download',
          disabled: itemsStore.selection.length === 0 || sceneScraperStore.autoScrapeInProgress,
          action: () => {
            void runSceneScrapeForSelection()
          },
        })
      }
    }

    if (!isSelectMode()) {
      if (type === 'media' && isMediaPageItem(item, type)) {
        contextMenu.push({type: 'divider'})
        contextMenu.push({
          name: t('context_menu.copy_name'),
          type: 'item',
          icon: 'content-copy',
          action: copyItemName,
        })
        contextMenu.push({
          name: t('context_menu.copy_path'),
          type: 'item',
          icon: 'content-copy',
          disabled: !mediaPageItemPath(item, type),
          action: copyItemPath,
        })
      } else if (type === 'tag' && isTagPageItem(item, type)) {
        contextMenu.push({type: 'divider'})
        contextMenu.push({
          name: t('context_menu.copy_name'),
          type: 'item',
          icon: 'content-copy',
          action: copyItemName,
        })
      }
    }

    if (type === 'tag') {
      if (!isSelectMode()) {
        if (canAutoScrape && isTagPageItem(item, type) && meta) {
          contextMenu.push({
            name: t('context_menu.auto_scrape'),
            type: 'item',
            icon: 'cloud-download',
            disabled: scraperStore.autoScrapeInProgress,
            action: () => {
              void autoScrapeSingleTag()
            },
          })
        }

        if (canTmdbPersonAutoScrape && isTagPageItem(item, type) && meta) {
          contextMenu.push({
            name: t('context_menu.tmdb_auto_scrape'),
            type: 'item',
            icon: 'movie-search-outline',
            disabled: tmdbPersonBatch.isInProgress(),
            action: () => {
              void autoScrapeSingleTmdbPerson()
            },
          })
        }

        contextMenu.push({type: 'divider'})
        contextMenu.push({
          name: t('context_menu.open_in_new_tab'),
          type: 'item',
          icon: 'tab',
          action: openNewTab,
        })
        contextMenu.push({type: 'divider'})
      }
    } else if (type === 'media') {
      contextMenu.push({
        name: t('context_menu.parse_tags_in_path'),
        type: 'item',
        icon: 'text-box-search',
        disabled: isSelectMode() && itemsStore.selection.length === 0,
        action: parseMetadata,
      })

      contextMenu.push({
        name: t('context_menu.update_file_info'),
        type: 'item',
        icon: 'file-sync-outline',
        disabled: !is_file_exists || (isSelectMode() && itemsStore.selection.length === 0),
        action: updateFileInfo,
      })

      contextMenu.push({type: 'divider'})

      if (canSceneAutoScrape && isMediaPageItem(item, type)) {
        contextMenu.push({
          name: t('context_menu.auto_scrape_scene'),
          type: 'item',
          icon: 'cloud-download',
          disabled: sceneScraperStore.autoScrapeInProgress,
          action: () => {
            void autoScrapeSingleScene()
          },
        })
        contextMenu.push({type: 'divider'})
      }

      if (!isSelectMode() && isVideoMediaType(currentMediaType.value)) {
        const playInMenu: ItemContextMenuEntry[] = [
          {
            name: t('context_menu.mediachips_player'),
            type: 'item',
            icon: 'open-in-app',
            disabled: !is_file_exists,
            action: () => {
              play()
            },
          },
          {
            name: t('context_menu.external_player'),
            type: 'item',
            icon: 'open-in-new',
            disabled: !is_file_exists,
            action: () => {
              play(true)
            },
          },
          {
            name: t('context_menu.mpv'),
            type: 'item',
            icon: 'play-box',
            disabled: !is_file_exists,
            action: () => {
              void openInExternalPlayer('mpv')
            },
          },
        ]

        if (detectAppPlatform().isMac) {
          playInMenu.push({
            name: t('context_menu.iina'),
            type: 'item',
            icon: 'play-box-outline',
            disabled: !is_file_exists,
            action: () => {
              void openInExternalPlayer('iina')
            },
          })
        }

        contextMenu.push({
          name: t('context_menu.play_video_in'),
          type: 'menu',
          icon: 'play-circle',
          disabled: !is_file_exists || (!reg && x > 14),
          menu: playInMenu,
        })
      }

      if (!isSelectMode() && isAudioMediaType(currentMediaType.value)) {
        contextMenu.push({
          name: t('context_menu.play_audio_in'),
          type: 'menu',
          icon: 'play-circle',
          disabled: !is_file_exists || (!reg && x > 14),
          menu: [
            {
              name: t('context_menu.mediachips_player'),
              type: 'item',
              icon: 'open-in-app',
              disabled: !is_file_exists,
              action: () => {
                play()
              },
            },
            {
              name: t('context_menu.external_player'),
              type: 'item',
              icon: 'open-in-new',
              disabled: !is_file_exists,
              action: () => {
                play(true)
              },
            },
          ],
        })
      }

      if (!isSelectMode() && isImageMediaType(currentMediaType.value)) {
        contextMenu.push({
          name: t('context_menu.view_image'),
          type: 'item',
          icon: 'image-search',
          disabled: !is_file_exists,
          action: () => {
            if (isMediaPageItem(item, type)) {
              itemsStore.viewImage({image: item})
            }
          },
        })
        contextMenu.push({
          name: t('context_menu.open_image_file'),
          type: 'item',
          icon: 'file-image',
          disabled: !is_file_exists,
          action: () => {
            openPath(mediaPageItemPath(item, type))
          },
        })
      }

      if (!isSelectMode() && isTextMediaType(currentMediaType.value)) {
        contextMenu.push({
          name: t('context_menu.open_text_file'),
          type: 'item',
          icon: 'file-document-outline',
          disabled: !is_file_exists,
          action: () => {
            openPath(mediaPageItemPath(item, type))
          },
        })
      }

      if (!isSelectMode()) {
        contextMenu.push({
          name: t('context_menu.open_files_folder'),
          type: 'item',
          icon: 'folder-open',
          disabled: !is_file_exists,
          action: () => {
            openPath(mediaPageItemPath(item, type), true)
          },
        })
      }

      contextMenu.push({
        name: t('context_menu.move_file_to'),
        type: 'item',
        icon: 'file-move',
        disabled: (isSelectMode() && itemsStore.selection.length === 0) || !is_file_exists || operationsStore.moving.active,
        action: moveTo,
      })

      contextMenu.push({
        name: t('context_menu.organize_by_tag'),
        type: 'item',
        icon: 'folder-plus',
        disabled: (isSelectMode() && itemsStore.selection.length === 0) || !is_file_exists,
        action: organizeFolderByTag,
      })

      const isPlaylistMedia = isVideoMediaType(currentMediaType.value)
        || isAudioMediaType(currentMediaType.value)

      if (isPlaylistMedia) {
        const getMediaIdsForPlaylist = (): number[] => {
          if (isSelectMode()) return [...itemsStore.selection]
          return [item.id]
        }

        const menuPlaylists: ItemContextMenuEntry[] = [
          {
            name: t('playlists.create_playlist'),
            type: 'item',
            icon: 'playlist-plus',
            action: () => {
              dialogsStore.createPlaylistForMedia(getMediaIdsForPlaylist())
            },
          },
        ]

        if ((playlistsStore || []).length > 0) {
          menuPlaylists.push({type: 'divider'})
          menuPlaylists.push(...(playlistsStore || []).map((playlist: Playlist) => ({
            name: String(playlist.name ?? ''),
            type: 'item',
            icon: 'plus',
            action: async () => {
              await addMediaToPlaylist(item.id, playlist.id)
            },
          })))
        }

        contextMenu.push({
          name: t('playlists.add_to_playlist'),
          type: 'menu',
          icon: 'playlist-plus',
          menu: menuPlaylists,
          disabled: isSelectMode() && itemsStore.selection.length === 0,
        })
      }

      contextMenu.push({type: 'divider'})
    }

    const is_selected = itemsStore.selection.includes(item.id)
    if (!options.singleItem) {
      contextMenu.push({
        name: is_selected ? t('appbar.buttons.unselect') : t('appbar.buttons.select'),
        icon: is_selected ? 'checkbox-blank-outline' : 'checkbox-marked-outline',
        type: 'item',
        action: (event?: unknown) => toggleSelect(event as MouseEvent),
      })

      contextMenu.push({type: 'divider'})
    }

    contextMenu.push({
      name: t('common.delete'),
      type: 'item',
      icon: 'delete',
      color: 'red',
      disabled: isSelectMode() && itemsStore.selection.length === 0,
      action: deleteItem,
    })

    return contextMenu
  }

  const editItem = (): void => {
    if (isMediaPageItem(item, type)) {
      dialogsStore.editMedia(item, currentMediaType.value)
    } else if (isTagPageItem(item, type) && meta) {
      dialogsStore.editTag(item, meta)
    }
  }

  const openTagMerge = (): void => {
    if (type !== 'tag' || !meta) return

    const selectedTags = itemsStore.selection
      .map((id) => {
        const fromPage = itemsStore.getItemById(id)
        if (fromPage && isTagPageItem(fromPage, 'tag')) return fromPage
        return store.tags.find((tag) => Number(tag.id) === Number(id)) ?? null
      })
      .filter((tag): tag is Tag => Boolean(tag))

    if (selectedTags.length < 2) return

    dialogsStore.openTagMerge(selectedTags, meta)
    itemsStore.isSelect = false
  }

  const autoScrapeSingleScene = async (): Promise<void> => {
    if (!isMediaPageItem(item, type)) return

    await runSceneScrapeForMedia(item, { openManualOnMiss: true })
  }

  const autoScrapeSingleTag = async (): Promise<void> => {
    if (!isTagPageItem(item, type) || !meta) return

    const locale = settingsStore.locale as Locale
    const translateLocal = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    dialogsStore.process.show = true
    dialogsStore.process.text = translateLocal('scraper.auto_scrape_in_progress', {
      name: item.name || '',
    })

    try {
      const result = await scraperStore.autoScrapeTag({
        tag: item,
        meta,
      })

      notificationsStore.setNotification({
        type: result.success ? 'success' : result.error === 'not_found' ? 'warning' : 'error',
        title: translateLocal(result.success ? 'scraper.auto_scrape_done' : 'scraper.auto_scrape_failed'),
        text: result.performerName || item.name || '',
      })

      if (result.success) {
        eventBus.emit('getItemsFromDb', { ids: [item.id], type: 'tag' })
        eventBus.emit('getTags')
      }
    } finally {
      dialogsStore.process.show = false
      dialogsStore.process.text = null
    }
  }

  const autoScrapeSingleTmdbPerson = async (): Promise<void> => {
    if (!isTagPageItem(item, type) || !meta) return

    const locale = settingsStore.locale as Locale
    const translateLocal = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    dialogsStore.process.show = true
    dialogsStore.process.text = translateLocal('tmdb.auto_scrape_in_progress', {
      name: item.name || '',
    })

    try {
      const result = await autoScrapeTmdbPersonTag({
        tag: item,
        meta,
        dbPath: store.dbPath,
      })

      notificationsStore.setNotification({
        type: result.success
          ? (result.error === 'image_failed' ? 'warning' : 'success')
          : result.error === 'not_found' ? 'warning' : 'error',
        title: translateLocal(
          result.success
            ? (result.error === 'image_failed' ? 'tmdb.auto_scrape_image_failed' : 'tmdb.auto_scrape_done')
            : 'tmdb.auto_scrape_failed',
        ),
        text: result.personName || item.name || '',
      })

      if (result.success) {
        eventBus.emit('getItemsFromDb', { ids: [item.id], type: 'tag' })
        eventBus.emit('getTags')
      }
    } finally {
      dialogsStore.process.show = false
      dialogsStore.process.text = null
    }
  }

  const copyItemName = (): void => {
    const locale = settingsStore.locale as Locale
    void copyToClipboard(String(item.name ?? ''), {
      successText: translate('common.copied', {}, locale),
    })
  }

  const copyItemPath = (): void => {
    if (!isMediaPageItem(item, type)) return
    const locale = settingsStore.locale as Locale
    void copyToClipboard(mediaPageItemPath(item, type), {
      successText: translate('common.copied', {}, locale),
    })
  }

  const toggleSelect = (...args: unknown[]): void => {
    itemsStore.toggleSelect(args[0] as MouseEvent, item)
  }

  const openNewTab = async (): Promise<void> => {
    if (!isTagPageItem(item, type)) return
    try {
      await typedApi.createTab({
        name: item.name,
        icon: meta?.icon,
        url: '/tag',
        tagId: item.id,
        metaId: meta?.id,
        mediaTypeId: getDefaultMediaTypeId(store.mediaTypes),
      })
      eventBus.emit('getTabs')
    } catch (e) {
      console.error(e)
    }
  }

  const parseMetadata = async (): Promise<void> => {
    let videos: MediaItem[] = []
    if (isSelectMode()) {
      videos = await resolveSelectedMediaItems(itemsStore.selection)
    } else if (isMediaPageItem(item, type)) {
      videos.push(item)
    }

    let vals: ParsePathTagEntry[] = []
    let updated: number[] = []
    try {
      const parseResponse = await typedApi.parsePathTags({
        paths: videos.map((entry) => ({path: entry.path, mediaId: entry.id})),
      })
      vals = parseResponse.data || []
    } catch (e) {
      console.error(e)
      for (const video of videos) {
        const parsed = parseFilePath(String(video.path ?? ''), video.id, {
          tags: store.tags,
          assigned: itemsStore.assigned,
        })
        vals = [...vals, ...parsed]
      }
    }

    updated = [...new Set(vals.map((entry) => Number(entry.mediaId)).filter(Boolean))]

    const added: number[] = []
    for (const val of vals) {
      await typedApi.createTagsInMediaOne(val)
        .then((res) => {
          if (res.data?.[1]) added.push(1)
        })
        .catch((e) => {
          console.log(e)
        })
    }
    setNotification({
      type: added.length > 0 ? 'success' : 'info',
      title: 'Parsing completed',
      text: `Tags added: ${added.length}`,
      icon: 'text-box-search',
    })
    if (added.length > 0) {
      eventBus.emit('getItemsFromDb', {
        ids: updated,
        type: 'media',
      })
    }
  }

  const updateFileInfo = async (): Promise<void> => {
    let ids: number[] = []
    if (isSelectMode()) {
      ids = itemsStore.selection
    } else {
      ids = [item.id]
    }

    const updated: number[] = []
    for (const id of ids) {
      const fileInfo = await refreshMediaFileInfo(id)
      if (fileInfo) updated.push(id)
    }

    await setNotification({
      type: updated.length > 0 ? 'success' : 'info',
      title: 'Update complete',
      text: `Media updated: ${updated.length}`,
      icon: 'file-sync-outline',
    })
    if (updated.length > 0) {
      eventBus.emit('getItemsFromDb', {
        ids: updated,
        type: 'media',
      })
    }
  }

  const moveTo = (): void => {
    if (!is_file_exists) return

    let ids = [item.id]
    if (isSelectMode()) ids = itemsStore.selection

    const cb = (id?: number): void => {
      if (id == null) return
      eventBus.emit('getItemsFromDb', {
        ids: [id],
        type: 'media',
      })
    }

    operationsStore.moving.dialog = true
    operationsStore.moving.ids = ids
    operationsStore.moving.items = null
    operationsStore.moving.folderPath = path.dirname(mediaPageItemPath(item, type))
    operationsStore.moving.callback = cb
  }

  const organizeFolderByTag = (): void => {
    if (!is_file_exists) return

    let ids = [item.id]
    if (isSelectMode()) {
      ids = itemsStore.selection
    }
    operationsStore.create_folder_move_media.ids = ids
    operationsStore.create_folder_move_media.dialog = true
  }

  const addMediaToPlaylist = async (mediaId: number, playlistId: number): Promise<void> => {
    const arr: Array<{ mediaId: number; playlistId: number }> = []
    if (isSelectMode()) {
      arr.push(...itemsStore.selection.map((id) => ({
        mediaId: id,
        playlistId,
      })))
    } else {
      arr.push({
        mediaId,
        playlistId,
      })
    }

    for (const data of arr) {
      try {
        await typedApi.addMediaToPlaylist(data)
      } catch (e) {
        console.error(e)
      }
    }

    itemsStore.isSelect = false
    eventBus.emit('getItemsFromDb', {
      ids: itemsStore.selection,
      type: 'media',
    })
  }

  const resolveSelectedMedia = resolveSelectedMediaItems

  const resolveItemById = (id: number): MediaItem | Tag | null => {
    if (Number(id) === Number(item.id)) return item
    const fromPage = itemsStore.entities.find((entry) => Number(entry.id) === Number(id))
    if (fromPage) return fromPage
    if (type === 'tag') {
      return store.tags.find((tag) => Number(tag.id) === Number(id)) ?? null
    }
    return null
  }

  const deleteItem = (): void => {
    const deleteItems = async (): Promise<void> => {
      const is_checked = dialogsStore.confirm.checkBox

      let ids = [item.id]
      if (isSelectMode()) {
        ids = itemsStore.selection
      }

      const deleted_items_names: string[] = []
      const itemsToDelete = type === 'media' && isSelectMode()
        ? await resolveSelectedMedia(ids)
        : ids
          .map((id) => resolveItemById(id))
          .filter((entry): entry is MediaItem | Tag => Boolean(entry))

      for (const found of itemsToDelete) {
        deleted_items_names.push(String(found.name ?? ''))

        const itemData: DeleteItemPayload = {
          with_file: is_checked,
          id: found.id,
        }

        if (isTagPageItem(found, type)) {
          itemData.metaId = Number(found.metaId ?? meta?.id)
        } else if (isMediaPageItem(found, type)) {
          itemData.metaId = meta?.id
          itemData.path = found.path
          const mediaType = getCurrentMediaType(store.mediaTypes, found.mediaTypeId)
          itemData.type = getMediaDeleteAssetFolder(mediaType) ?? undefined
        }

        try {
          await typedApi.deleteEntityOne(type, itemData)
        } catch (e) {
          console.error(e)
        }
      }

      itemsStore.selection = []
      itemsStore.selected_last = null
      itemsStore.isSelect = false

      notificationsStore.setNotification({
        type: 'info',
        title: 'The items has been deleted',
        text: deleted_items_names.join(', '),
      })

      eventBus.emit('removeEntitiesFromState', {
        ids,
        type,
      })

      if (type === 'tag') {
        eventBus.emit('getTags', [])
      }

      if (type === 'media') {
        eventBus.emit('update:watcher')
      }
    }

    dialogsStore.confirm.text = 'Delete selected ' + type + ' from app?'
    dialogsStore.confirm.checkBoxText = type === 'media' ? 'Also delete files' : ''
    dialogsStore.confirm.action = deleteItems
    dialogsStore.confirm.show = true
  }

  const play = (forceSystem = false): void => {
    if (!isMediaPageItem(item, type)) return
    itemsStore.playVideo({
      video: item,
      player: forceSystem ? 'system' : 'builtin',
    })
  }

  const openInExternalPlayer = async (player: 'mpv' | 'iina'): Promise<void> => {
    if (!isMediaPageItem(item, type)) return
    const mediaPath = mediaPageItemPath(item, type)
    if (!mediaPath) return

    const locale = settingsStore.locale as Locale
    const playerLabel = translate(
      player === 'iina' ? 'context_menu.iina' : 'context_menu.mpv',
      {},
      locale,
    )

    try {
      await typedApi.openInExternalPlayer({
        path: mediaPath,
        player,
        mediaId: Number(item.id) || undefined,
      })
      await itemsStore.countViewNumber(item, 'media')
    } catch (error) {
      const err = error as {response?: {data?: {message?: string}}; message?: string}
      setNotification({
        type: 'error',
        title: playerLabel,
        text: err.response?.data?.message || err.message || String(error),
      })
    }
  }

  return {
    getContextMenu,
    editItem,
    toggleSelect,
    openNewTab,
    parseMetadata,
    updateFileInfo,
    moveTo,
    organizeFolderByTag,
    addMediaToPlaylist,
    deleteItem,
    play,
  }
}
