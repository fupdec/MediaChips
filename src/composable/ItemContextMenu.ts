import {computed} from 'vue'
import {useRouter} from 'vue-router'
import {typedApi} from '@/services/typedApi'
import {useAppStore} from '@/stores/app'
import {useItemsStore} from '@/stores/items'
import {useSettingsStore} from '@/stores/settings'
import {useDialogsStore} from '@/stores/dialogs'
import {useOperationsStore} from '@/stores/operations'
import {useNotificationsStore} from '@/stores/notifications'
import {useRegistrationStore} from '@/stores/registration'
import {useTasksStore} from '@/stores/tasks'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog, reloadTabsCatalog} from '@/composable/appCatalogs'
import {useMoveTagsToCategory} from '@/composable/useMoveTagsToCategory'
import path from 'path-browserify'
import {
  getCurrentMediaType,
  getDefaultMediaTypeId,
  getMediaDeleteAssetFolder,
  isAudioMediaType,
  isImageMediaType,
  isVideoMediaType,
} from '@/utils/mediaType'
import {resolveOpenMediaKind} from '@/utils/openMediaKind'
import {openTextMedia} from '@/utils/openTextMedia'
import {isInAppTextPreviewPath} from '@/utils/textPreview'
import {setNotification} from '@/services/notificationService'
import {refreshMediaFileInfoMany} from '@/services/mediaFileInfoService'
import {runFaceDetectionForMediaIds} from '@/composable/useFaceDetectionTask'
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
import {useOpenMediaList} from '@/utils/openMediaList'
import {useSessionFocusStore} from '@/stores/sessionFocus'
import {useSessionFocusActions} from '@/composable/useSessionFocusActions'
import type { DeleteEntityOnePayload, ParsePathTagEntry } from '@shared/api/responses'
import type { ItemContextMenuEntry } from '@/types/itemsPage'
import type { MediaItem, Meta, Playlist, Tag } from '@/types/stores'
import {
  getZipArchivePath,
  zipArchiveBasename,
} from '@shared/zipPath'

interface DeleteItemPayload extends DeleteEntityOnePayload {
  with_file: boolean
  delete_zip_gallery?: boolean
  delete_zip_file?: boolean
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
  const tasksStore = useTasksStore()
  const router = useRouter()

  const eventBus = useEventBus()
  const listSync = useItemsListSync()
  const {moveTagsToCategory} = useMoveTagsToCategory()
  const {openMediaList} = useOpenMediaList()
  const sessionFocusStore = useSessionFocusStore()
  const {applyFocusTagToMediaIds, startFocus, clearFocus} = useSessionFocusActions()

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

      if (type === 'tag' && isTagPageItem(item, type) && meta) {
        contextMenu.push({
          name: t('common.duplicate'),
          type: 'item',
          icon: 'content-duplicate',
          action: duplicateTagItem,
        })
        const focused = Number(sessionFocusStore.tagId) === Number(item.id)
        contextMenu.push({
          name: focused ? t('session_focus.clear') : t('session_focus.start'),
          type: 'item',
          icon: focused ? 'bullseye-arrow' : 'bullseye',
          action: () => {
            if (focused) {
              clearFocus()
              return
            }
            startFocus({
              tagId: Number(item.id),
              metaId: Number(meta.id),
              name: String(item.name || ''),
              icon: meta.icon ? String(meta.icon) : null,
              color: item.color ? String(item.color) : null,
            })
          },
        })
      }
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

      if (type === 'media') {
        contextMenu.push({
          name: t('context_menu.merge_media'),
          type: 'item',
          icon: 'set-merge',
          disabled: itemsStore.selection.length < 2,
          action: openMediaMerge,
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

    if (type === 'tag') {
      const currentMetaId = Number(
        meta?.id
          ?? (isTagPageItem(item, type) ? item.metaId : 0),
      )
      const targetCategories = (store.meta || []).filter((category: Meta) =>
        category.type === 'array'
        && Number(category.id) !== currentMetaId,
      )

      if (targetCategories.length > 0) {
        contextMenu.push({
          name: t('context_menu.move_to_tag_category'),
          type: 'menu',
          icon: 'folder-move',
          disabled: isSelectMode() && itemsStore.selection.length === 0,
          menu: targetCategories.map((category: Meta) => ({
            name: String(category.name ?? ''),
            type: 'item',
            icon: String(category.icon || 'tag').replace(/^mdi-/, ''),
            action: () => {
              moveTagsToCategoryAction(Number(category.id), String(category.name ?? ''))
            },
          })),
        })
      }

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
      // Smart tools submenu (works in single-item and multi-select modes).
      const selectionEmpty = isSelectMode() && itemsStore.selection.length === 0
      const smartMenu: ItemContextMenuEntry[] = []

      smartMenu.push({
        name: t('context_menu.parse_tags_in_path'),
        type: 'item',
        icon: 'text-box-search',
        disabled: selectionEmpty,
        action: parseMetadata,
      })

      if (isVideoMediaType(currentMediaType.value)) {
        smartMenu.push({
          name: t('context_menu.detect_faces'),
          type: 'item',
          icon: 'face-recognition',
          disabled: !is_file_exists || selectionEmpty,
          action: detectFacesForSelection,
        })
        smartMenu.push({
          name: t('context_menu.generate_chapters'),
          type: 'item',
          icon: 'bookmark-multiple-outline',
          disabled: !is_file_exists || selectionEmpty,
          action: generateChaptersForSelection,
        })

        if (isMediaPageItem(item, type)) {
          smartMenu.push({
            name: t('context_menu.more_like_this'),
            type: 'item',
            icon: 'image-search-outline',
            // Seed is the right-clicked item (also available while multi-selecting).
            action: openMoreLikeThis,
          })
          smartMenu.push({
            name: t('context_menu.apply_tags_from_similar'),
            type: 'item',
            icon: 'tag-plus-outline',
            disabled: selectionEmpty,
            action: applyTagsFromSimilar,
          })
          smartMenu.push({
            name: t('context_menu.semantically_similar'),
            type: 'item',
            icon: 'brain',
            action: openSemanticallySimilar,
          })
          smartMenu.push({
            name: t('context_menu.play_similar_radio'),
            type: 'item',
            icon: 'radio-tower',
            disabled: !is_file_exists,
            action: playSimilarRadio,
          })
        }
      }

      if (
        isImageMediaType(currentMediaType.value)
        && isMediaPageItem(item, type)
      ) {
        smartMenu.push({
          name: t('context_menu.semantically_similar'),
          type: 'item',
          icon: 'brain',
          action: openSemanticallySimilar,
        })
      }

      if (smartMenu.length) {
        contextMenu.push({type: 'divider'})
        contextMenu.push({
          name: t('context_menu.smart_tools'),
          type: 'menu',
          icon: 'flash',
          menu: smartMenu,
        })
      }

      if (canSceneAutoScrape && isMediaPageItem(item, type) && !isSelectMode()) {
        contextMenu.push({
          name: t('context_menu.auto_scrape_scene'),
          type: 'item',
          icon: 'cloud-download',
          disabled: sceneScraperStore.autoScrapeInProgress,
          action: () => {
            void autoScrapeSingleScene()
          },
        })
      }

      contextMenu.push({
        name: t('context_menu.update_file_info'),
        type: 'item',
        icon: 'file-sync-outline',
        disabled: !is_file_exists || selectionEmpty,
        action: updateFileInfo,
      })

      // Playback + playlist
      const isPlaylistMedia = isVideoMediaType(currentMediaType.value)
        || isAudioMediaType(currentMediaType.value)

      if (!isSelectMode()) {
        contextMenu.push({type: 'divider'})

        if (isVideoMediaType(currentMediaType.value)) {
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

        if (isAudioMediaType(currentMediaType.value)) {
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

        if (resolveOpenMediaKind(currentMediaType.value) === 'view-image') {
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

        {
          const textKind = resolveOpenMediaKind(currentMediaType.value, {
            path: mediaPageItemPath(item, type),
          })
          if (textKind === 'open-path' || textKind === 'preview-text') {
            const path = mediaPageItemPath(item, type)
            if (isInAppTextPreviewPath(path)) {
              contextMenu.push({
                name: t('context_menu.preview_text_file'),
                type: 'item',
                icon: 'eye',
                disabled: !is_file_exists,
                action: () => {
                  openTextMedia({...item, path} as MediaItem)
                },
              })
            }
            contextMenu.push({
              name: t('context_menu.open_text_file'),
              type: 'item',
              icon: 'file-document-outline',
              disabled: !is_file_exists,
              action: () => {
                openTextMedia({...item, path} as MediaItem, {forceExternal: true})
              },
            })
          }
        }
      }

      if (isPlaylistMedia) {
        if (isSelectMode()) {
          contextMenu.push({type: 'divider'})
        }

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

      if (sessionFocusStore.tag) {
        const focusTag = sessionFocusStore.tag
        contextMenu.push({
          name: t('session_focus.apply_menu', {name: focusTag.name}),
          type: 'item',
          icon: 'bullseye-arrow',
          disabled: isSelectMode() && itemsStore.selection.length === 0,
          action: () => {
            const ids = isSelectMode() ? [...itemsStore.selection] : [item.id]
            void applyFocusTagToMediaIds(ids)
          },
        })
      }

      // File location / management
      contextMenu.push({type: 'divider'})
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

      contextMenu.push({type: 'divider'})
    }

    if (!isSelectMode()) {
      if (type === 'media' && isMediaPageItem(item, type)) {
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
        contextMenu.push({
          name: t('context_menu.copy_name'),
          type: 'item',
          icon: 'content-copy',
          action: copyItemName,
        })
      }
    }

    const is_selected = itemsStore.selection.includes(item.id)
    if (!options.singleItem) {
      const last = contextMenu[contextMenu.length - 1]
      if (last?.type !== 'divider') {
        contextMenu.push({type: 'divider'})
      }
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

  const duplicateTagItem = (): void => {
    if (!isTagPageItem(item, type) || !meta) return

    const locale = settingsStore.locale as Locale
    const translateLocal = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    void (async () => {
      try {
        const {data} = await typedApi.duplicateTag({id: Number(item.id)})
        const created = data.tag
        setNotification({
          type: 'success',
          title: translateLocal('meta.dialogs.duplicate_tag_done'),
          text: translateLocal('meta.dialogs.duplicate_tag_done_text', {
            name: created.name || '',
          }),
        })
        void reloadTagsCatalog()
        listSync.getItemsFromDb({ids: [created.id], type: 'tag'})
        dialogsStore.editTag(created, meta)
      } catch (error) {
        console.error('Error duplicating tag:', error)
        setNotification({
          type: 'error',
          text: translateLocal('meta.dialogs.duplicate_tag_failed'),
        })
      }
    })()
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

  const openMediaMerge = (): void => {
    if (type !== 'media') return

    const selectedMedia = itemsStore.selection
      .map((id) => {
        const fromPage = itemsStore.getItemById(id)
        return fromPage && isMediaPageItem(fromPage, 'media') ? fromPage : null
      })
      .filter((item): item is MediaItem => Boolean(item))

    if (selectedMedia.length < 2) return

    dialogsStore.openMediaMerge(selectedMedia)
    itemsStore.isSelect = false
  }

  const resolveTagsForMove = (): Tag[] => {
    if (type !== 'tag') return []

    if (isSelectMode()) {
      return itemsStore.selection
        .map((id) => {
          const fromPage = itemsStore.getItemById(id)
          if (fromPage && isTagPageItem(fromPage, 'tag')) return fromPage
          return store.tags.find((tag) => Number(tag.id) === Number(id)) ?? null
        })
        .filter((tag): tag is Tag => Boolean(tag))
    }

    if (isTagPageItem(item, type)) return [item]
    return []
  }

  const moveTagsToCategoryAction = (targetMetaId: number, targetName: string): void => {
    moveTagsToCategory(resolveTagsForMove(), targetMetaId, targetName)
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
        listSync.getItemsFromDb({ ids: [item.id], type: 'tag' })
        void reloadTagsCatalog()
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
        listSync.getItemsFromDb({ ids: [item.id], type: 'tag' })
        void reloadTagsCatalog()
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
      void reloadTabsCatalog()
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
    const locale = settingsStore.locale as Locale
    setNotification({
      type: added.length > 0 ? 'success' : 'info',
      title: translate('notifications_text.parsing_completed', {}, locale),
      text: translate('notifications_text.tags_added_count', {count: added.length}, locale),
      icon: 'text-box-search',
    })

    if (added.length > 0) {
      listSync.getItemsFromDb({
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

    const updated = await refreshMediaFileInfoMany(ids)

    const locale = settingsStore.locale as Locale
    await setNotification({
      type: updated.length > 0 ? 'success' : 'info',
      title: translate('notifications_text.update_complete', {}, locale),
      text: translate('notifications_text.media_updated_count', {count: updated.length}, locale),
      icon: 'file-sync-outline',
    })

    if (updated.length > 0) {
      listSync.getItemsFromDb({
        ids: updated,
        type: 'media',
      })
    }
  }

  const openMoreLikeThis = async (): Promise<void> => {
    if (!isMediaPageItem(item, type)) return
    const seedId = Number(item.id)
    if (!Number.isFinite(seedId) || seedId <= 0) return

    const locale = settingsStore.locale as Locale
    const tr = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    let ids: number[] = []
    try {
      // Same hybrid ranking as Home Similar (CLIP + tags, series diversity).
      let data: {
        hasSignals?: boolean
        ids?: number[]
      } | null = null
      try {
        const response = await typedApi.similarHybrid({seedId, limit: 48})
        data = response.data
      } catch (hybridError) {
        // Dev HMR / older bundles may miss similarHybrid — fall back to CLIP.
        console.warn('similarHybrid failed, falling back to similarByClip', hybridError)
        const response = await typedApi.similarByClip({seedId, limit: 48})
        const clip = response.data
        data = {
          hasSignals: Boolean(clip?.hasEmbedding && Array.isArray(clip.ids) && clip.ids.length > 1),
          ids: clip?.ids,
        }
      }

      if (!data?.hasSignals) {
        setNotification({
          type: 'info',
          title: tr('context_menu.more_like_this_none'),
          icon: 'image-search-outline',
        })
        return
      }
      ids = Array.isArray(data.ids)
        ? data.ids.map(Number).filter((id) => Number.isFinite(id) && id > 0)
        : []
      if (ids.length <= 1) {
        setNotification({
          type: 'info',
          title: tr('context_menu.more_like_this_none'),
          icon: 'image-search-outline',
        })
        return
      }
    } catch (error) {
      console.error('Failed to find similar media:', error)
      setNotification({
        type: 'error',
        title: tr('context_menu.more_like_this_failed'),
        text: error instanceof Error ? error.message : String(error || ''),
        icon: 'image-search-outline',
      })
      return
    }

    try {
      const seedName = String(item.name || item.basename || '').trim()
      await openMediaList({
        mediaTypeId: item.mediaTypeId || currentMediaType.value?.id,
        ids,
        scope: {
          kind: 'similar',
          label: seedName
            ? tr('home.widgets.similar_to', {name: seedName})
            : tr('filters.similar_scope'),
        },
      })
    } catch (error) {
      console.error('Failed to open similar media list:', error)
      setNotification({
        type: 'error',
        title: tr('context_menu.more_like_this_failed'),
        text: error instanceof Error ? error.message : String(error || ''),
        icon: 'image-search-outline',
      })
    }
  }

  const applyTagsFromSimilar = async (): Promise<void> => {
    const locale = settingsStore.locale as Locale
    const tr = (key: string, params: Record<string, string | number> = {}) =>
      translate(key, params, locale)

    let ids = [Number(item.id)].filter((id) => Number.isFinite(id) && id > 0)
    if (isSelectMode()) {
      ids = itemsStore.selection.map(Number).filter((id) => Number.isFinite(id) && id > 0)
    }
    if (!ids.length || !isMediaPageItem(item, type)) return

    try {
      const response = await typedApi.suggestTagsFromSimilar({
        mediaIds: ids,
        apply: true,
        tagLimit: 12,
        neighborLimit: 24,
      })
      const applied = Number(response.data?.applied || 0)
      const suggested = Number(response.data?.suggested || 0)
      if (!applied && !suggested) {
        setNotification({
          type: 'info',
          title: tr('context_menu.apply_tags_from_similar'),
          text: tr('context_menu.apply_tags_from_similar_empty'),
          icon: 'tag-plus-outline',
        })
        return
      }
      listSync.getItemsFromDb({ids, type: 'media'})
      setNotification({
        type: applied > 0 ? 'success' : 'info',
        title: tr('context_menu.apply_tags_from_similar'),
        text: tr('context_menu.apply_tags_from_similar_done', {applied, suggested}),
        icon: 'tag-plus-outline',
      })
    } catch (error) {
      console.error('Failed to apply tags from similar media:', error)
      setNotification({
        type: 'error',
        title: tr('context_menu.apply_tags_from_similar'),
        text: tr('context_menu.apply_tags_from_similar_failed'),
        icon: 'tag-plus-outline',
      })
    }
  }

  const openSemanticallySimilar = async (): Promise<void> => {
    if (!isMediaPageItem(item, type)) return
    const seedId = Number(item.id)
    if (!Number.isFinite(seedId) || seedId <= 0) return

    dialogsStore.openSimilarWall({
      seedId,
      mediaTypeId: item.mediaTypeId || currentMediaType.value?.id || null,
    })
  }

  const playSimilarRadio = async (): Promise<void> => {
    if (!isMediaPageItem(item, type)) return
    const {startSimilarRadio} = await import('@/services/similarRadio')
    await startSimilarRadio(item)
  }

  const detectFacesForSelection = async (): Promise<void> => {
    let ids = [Number(item.id)]
    if (isSelectMode()) ids = itemsStore.selection.map(Number).filter((id) => Number.isFinite(id))
    if (!ids.length) return

    await runFaceDetectionForMediaIds({
      mediaIds: ids,
      locale: settingsStore.locale as Locale,
      contextItem: isMediaPageItem(item, type) ? item : null,
      reloadMediaItems: (mediaIds) => {
        listSync.getItemsFromDb({
          ids: mediaIds,
          type: 'media',
        })
      },
    })
  }

  const generateChaptersForSelection = async (): Promise<void> => {
    let ids = [Number(item.id)]
    if (isSelectMode()) ids = itemsStore.selection.map(Number).filter((id) => Number.isFinite(id))
    if (!ids.length) return

    const locale = settingsStore.locale as Locale
    const tr = (key: string, params: Record<string, string | number> = {}) => translate(key, params, locale)
    const controller = new AbortController()
    const taskId = tasksStore.setTask({
      title: tr('context_menu.generate_chapters'),
      subtitle: tr('context_menu.generate_chapters_progress', {
        processed: 0,
        total: ids.length,
        percent: 0,
      }),
      icon: 'bookmark-multiple-outline',
      progress: 0,
      action: () => controller.abort(),
    })

    try {
      let created = 0
      let skipped = 0
      let failed = 0
      await typedApi.streamAutoChapterGeneration(
        {
          mediaIds: ids,
          force: true,
          useSilence: true,
          useLlmTitles: true,
          locale: String(locale || 'en'),
        },
        {signal: controller.signal},
        (event) => {
          if (event.type === 'progress' || event.type === 'item') {
            created = Number(event.created) || created
            skipped = Number(event.skipped) || skipped
            failed = Number(event.failed) || failed
            const processed = Number(event.processed) || 0
            const total = Number(event.total) || ids.length
            const itemProgress = Math.min(1, Math.max(0, Number(event.itemProgress) || 0))
            const effective = processed + (event.type === 'progress' ? itemProgress : 0)
            const percent = total > 0 ? Math.min((effective / total) * 100, 100) : 0
            tasksStore.updateTask(taskId, {
              subtitle: tr('context_menu.generate_chapters_progress', {
                processed,
                total,
                percent: Math.round(percent),
              }),
              progress: percent,
            })
          }
          if (event.type === 'error') {
            throw new Error(event.message || tr('common.error'))
          }
        },
      )
      tasksStore.updateTask(taskId, {
        subtitle: tr('context_menu.generate_chapters_done', {created, skipped, failed}),
        progress: 100,
        color: 'success',
        done: true,
        action: undefined,
      })
      setNotification({
        type: created > 0 ? 'success' : 'info',
        title: tr('context_menu.generate_chapters'),
        text: tr('context_menu.generate_chapters_done', {created, skipped, failed}),
        icon: 'bookmark-multiple-outline',
      })
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        tasksStore.updateTask(taskId, {
          subtitle: tr('common.stop'),
          color: 'warning',
          done: true,
          action: undefined,
        })
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      tasksStore.updateTask(taskId, {
        subtitle: message,
        color: 'error',
        done: true,
        action: undefined,
      })
      setNotification({
        type: 'error',
        title: tr('context_menu.generate_chapters'),
        text: message,
      })
    }
  }

  const moveTo = (): void => {
    if (!is_file_exists) return

    let ids = [item.id]
    if (isSelectMode()) ids = itemsStore.selection

    const cb = (id?: number): void => {
      if (id == null) return
      listSync.getItemsFromDb({
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
    listSync.getItemsFromDb({
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
    const locale = settingsStore.locale as Locale

    const previewCandidates: Array<MediaItem | Tag> = []
    if (type === 'media') {
      if (isSelectMode()) {
        for (const id of itemsStore.selection) {
          const found = resolveItemById(id)
          if (found) previewCandidates.push(found)
        }
      } else {
        previewCandidates.push(item)
      }
    }

    const zipArchiveNames = [...new Set(
      previewCandidates
        .map((entry) => {
          if (!isMediaPageItem(entry, type)) return null
          const zipPath = getZipArchivePath(mediaPageItemPath(entry, type))
          return zipPath ? zipArchiveBasename(zipPath) : null
        })
        .filter((name): name is string => Boolean(name)),
    )]
    const hasZipGallery = zipArchiveNames.length > 0

    const runDelete = async ({
      withFile,
      deleteZipGallery,
      deleteZipFile,
    }: {
      withFile: boolean
      deleteZipGallery: boolean
      deleteZipFile: boolean
    }): Promise<void> => {
      let ids = [item.id]
      if (isSelectMode()) {
        ids = itemsStore.selection
      }

      const deleted_items_names: string[] = []
      const deletedIds = new Set<number>()
      const handledZipArchives = new Set<string>()
      let softDeleted = type === 'media'
      const itemsToDelete = type === 'media' && isSelectMode()
        ? await resolveSelectedMedia(ids)
        : ids
          .map((id) => resolveItemById(id))
          .filter((entry): entry is MediaItem | Tag => Boolean(entry))

      for (const found of itemsToDelete) {
        deleted_items_names.push(String(found.name ?? ''))

        const itemData: DeleteItemPayload = {
          with_file: withFile,
          id: found.id,
        }

        if (isTagPageItem(found, type)) {
          itemData.metaId = Number(found.metaId ?? meta?.id)
        } else if (isMediaPageItem(found, type)) {
          itemData.metaId = meta?.id
          itemData.path = found.path
          const mediaType = getCurrentMediaType(store.mediaTypes, found.mediaTypeId)
          itemData.type = getMediaDeleteAssetFolder(mediaType) ?? undefined

          const zipPath = getZipArchivePath(found.path)
          if (deleteZipGallery && zipPath) {
            if (handledZipArchives.has(zipPath)) continue
            handledZipArchives.add(zipPath)
            itemData.delete_zip_gallery = true
            itemData.delete_zip_file = deleteZipFile
            itemData.with_file = false
          }
        }

        try {
          const response = await typedApi.deleteEntityOne(type, itemData)
          const responseData = response.data as {deletedIds?: number[]; softDeleted?: boolean} | undefined
          if (responseData?.softDeleted === false) softDeleted = false
          if (type !== 'media') softDeleted = false
          const responseIds = Array.isArray(responseData?.deletedIds)
            ? responseData.deletedIds
            : [found.id]
          for (const deletedId of responseIds) {
            deletedIds.add(Number(deletedId))
          }
        } catch (e) {
          console.error(e)
          deletedIds.add(found.id)
        }
      }

      const removedIds = deletedIds.size ? [...deletedIds] : ids

      itemsStore.selection = []
      itemsStore.selected_last = null
      itemsStore.isSelect = false

      {
        const locale = settingsStore.locale as Locale
        notificationsStore.setNotification({
          type: 'info',
          title: softDeleted
            ? translate('notifications_text.items_moved_to_trash', {}, locale)
            : translate('notifications_text.items_deleted', {}, locale),
          text: deleted_items_names.join(', '),
        })
      }


      listSync.removeEntitiesFromState({
        ids: removedIds,
        type,
      })

      if (type === 'tag') {
        void reloadTagsCatalog()
      }

      if (type === 'media') {
        eventBus.emit('update:watcher')
      }
    }

    const archives = zipArchiveNames.join(', ')
    dialogsStore.confirm.checkBox = false
    dialogsStore.confirm.checkBox2 = false
    dialogsStore.confirm.checkBox2RequiresPrimary = false

    if (hasZipGallery) {
      dialogsStore.confirm.text = translate(
        'media.delete_zip_confirm',
        { archives },
        locale,
      )
      dialogsStore.confirm.checkBoxText = translate('actions.delete_zip_gallery', {}, locale)
      dialogsStore.confirm.checkBox2Text = translate('actions.delete_zip_file', {}, locale)
      dialogsStore.confirm.checkBox2RequiresPrimary = true
    } else {
      dialogsStore.confirm.text = type === 'media'
        ? translate('media.move_to_trash_confirm', {}, locale)
        : translate('media.delete_from_app_confirm', {}, locale)
      dialogsStore.confirm.checkBoxText = type === 'media'
        ? translate('actions.also_delete_files_on_purge', {}, locale)
        : ''
      dialogsStore.confirm.checkBox2Text = ''
    }

    dialogsStore.confirm.action = () => {
      const deleteZipGallery = hasZipGallery && dialogsStore.confirm.checkBox
      const deleteZipFile = deleteZipGallery && dialogsStore.confirm.checkBox2

      void runDelete({
        withFile: !hasZipGallery && dialogsStore.confirm.checkBox,
        deleteZipGallery,
        deleteZipFile,
      })
    }
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
