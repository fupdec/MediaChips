import {isRemoteMediaPath} from '@shared/remoteMedia'
import {toRaw} from 'vue'
import {defineStore} from 'pinia'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {useItemsListSync} from '@/composable/itemsListSync'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {reloadMetaCatalog} from '@/composable/metaCatalog'
import {getDuplicatesGroupKey} from '@/utils/mediaSortFilter'
import {openSeparatePlayer, canOpenSeparatePlayer} from '@/utils/playerWindow'
import {nativePlayerNeedsWindow} from '@/services/nativePlayer'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import {isMediaFileAvailable, hasUsableMediaCopy} from '@/services/mediaCopyAvailability'
import {getDateForDB} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import type { FilterObject } from '@/types/common'
import type { EntityUpdatePayload } from '@shared/api/responses'
import type { PlayableMedia } from '@shared/entities/media'
import type { AssignedMeta, ItemsEnvironment, MediaItem, Meta, SavedFilter } from '@/types/stores'
import type { ItemsPageStoreUpdates } from '@/types/itemsPage'
import { ensureMediaItem, getSegmentStart } from '@/utils/mediaItem'
import { findFirstPlayableVideo } from '@/utils/findFirstPlayableVideo'
import { resolveGalleryPlaylistVideos } from '@/utils/galleryPlaylist'
import { cloneItemsStoreFieldValue } from '@/stores/itemsStoreClone'
import type { ItemsGroupBy, ItemsGroupSummary } from '@/utils/itemsGroupBy'
import {itemsSelectionScopeKey} from '@/utils/itemsSelectionScope'
import { selectContiguousEntityIds, replacePageSelection } from '@/utils/itemsSelectionRange'
import { INFINITE_SCROLL_MAX_ITEMS } from '@shared/listPagination'

const eventBus = useEventBus()
const listSync = useItemsListSync()

export const THUMB_BROADCAST_CHANNEL = 'mediachips-thumb-update'

const sameItemId = (left: unknown, right: unknown) => Number(left) === Number(right)

function normalizeAssignedList(
  assigned: AssignedMeta[] | Record<string, AssignedMeta> | unknown,
): AssignedMeta[] {
  if (Array.isArray(assigned)) return assigned
  if (assigned && typeof assigned === 'object') {
    return Object.values(assigned as Record<string, AssignedMeta>)
  }
  return []
}

function createItemsStoreState() {
  return {
    type: '',
    environment: {
      media_type_id: null,
      meta_id: null,
      tag_id: null,
      tab_id: null,
    } as ItemsEnvironment,
    page: 1,
    jumpPage: null as number | null,
    limit: 20,
    filterId: null as number | null,
    size: 3,
    view: 1,
    groupBy: 'none' as ItemsGroupBy,
    groupByMetaId: null as number | null,
    groups: [] as ItemsGroupSummary[],
    sortBy: 'name',
    sortDir: 'asc',
    entities: [] as MediaItem[],
    itemsOnPage: [] as MediaItem[],
    navigationItems: [] as MediaItem[],
    totalFiltered: 0,
    totalFilesize: 0,
    name: 'Tags',
    icon: 'shape',
    isSelect: false,
    selected_last: null as number | null,
    /** Anchor id for Shift+keyboard / Shift+click range selection. */
    selectionAnchor: null as number | null,
    selection: [] as number[],
    selectionRevision: 0,
    /** Set when the whole filter result was selected; valid only while selectionRevision is unchanged. */
    filterSelectionScope: null as null | {revision: number; count: number; filter: Record<string, unknown>},
    savedFilter: {} as SavedFilter,
    filters: [] as FilterObject[],
    /** How active filter rows combine: all (AND) or any (OR). */
    filtersJoin: 'and' as 'and' | 'or',
    filters_saved: [] as SavedFilter[],
    meta: { id: 0 } as Meta,
    assigned: [] as AssignedMeta[],
    isFiltersLoaded: false,
    find_duplicates: false,
    /** Override for duplicate grouping: fingerprint | visualHash | path | filesize */
    duplicates_by: null as string | null,
    /** When set, media list is scoped to these ids (e.g. More like this / semantic search). */
    listScopeIds: null as number[] | null,
    /** Why the list is scoped — drives the filter chip label. */
    listScope: null as null | {
      kind: 'semantic' | 'visualSimilar' | 'similar' | 'clipSimilar' | 'fromPlayer' | 'inbox'
      label?: string
    },
    thumbRefreshKeys: {} as Record<number, number>,
    thumbRegenerateKeys: {} as Record<number, number>,
    viewerLoadMoreHandler: null as (() => Promise<boolean>) | null,
    /** Filter tags by first letter (A-Z). */
    namePrefix: null as string | null,
    /** Filter tags by color (`#rrggbb`) or `none`. */
    colorFilter: null as string | null,
  }
}

type ItemsStoreState = ReturnType<typeof createItemsStoreState>

export const useItemsStore = defineStore('items', {
  // Состояние (State)
  state: () => createItemsStoreState(),

  // Геттеры (Getters) - опциональные, но полезные
  getters: {
    // Получить количество элементов на странице
    itemsOnPageCount: (state) => state.itemsOnPage.length,

    // Получить общее количество элементов
    totalEntities: (state) => state.entities.length,

    // Проверить, есть ли выбранные элементы
    hasSelection: (state) => state.selection.length > 0,

    // Получить количество выбранных элементов
    selectionCount: (state) => state.selection.length,

    // Проверить, выбраны ли все элементы на странице
    isAllSelectedOnPage: (state) => {
      if (state.itemsOnPage.length === 0) return false
      return state.itemsOnPage.every(item =>
        state.selection.includes(item.id)
      )
    },

    // Проверить, выбраны ли все отфильтрованные элементы
    isAllFilteredSelected: (state) => {
      return state.totalFiltered > 0 && state.selection.length === state.totalFiltered
    },

    canLoadMoreForViewer(state): boolean {
      return state.limit === 101
        && state.itemsOnPage.length > 0
        && state.itemsOnPage.length < state.totalFiltered
        && state.viewerLoadMoreHandler != null
    },

    // Получить активные фильтры
    activeFilters: (state) => state.filters.filter(f => f.active),

    // Проверить, изменены ли фильтры по сравнению с сохраненными
    isFiltersChanged: (state) => {
      if (!state.savedFilter || !state.savedFilter.filters) return false
      return JSON.stringify(state.filters) !== JSON.stringify(state.savedFilter.filters)
    },

    // Геттер с параметрами - найти элемент по ID
    getItemById: (state) => (id: number) => {
      return state.itemsOnPage.find(item => item.id === id) ||
        state.entities.find(item => item.id === id)
    },

    // Получить текущую страницу для пагинации
    currentPageInfo: (state) => {
      const start = (state.page - 1) * state.limit + 1
      const end = Math.min(state.page * state.limit, state.entities.length)
      return {start, end, total: state.entities.length}
    },

    // Геттер, который гарантированно возвращает массив
    safeAssigned: (state): AssignedMeta[] => normalizeAssignedList(state.assigned),

    // Отсортированный массив assigned
    sortedAssigned: (state): AssignedMeta[] => {
      const assigned = normalizeAssignedList(state.assigned)

      return [...assigned].sort((a, b) => {
        const orderA = Number.isFinite(a?.order) ? Number(a.order) : 0
        const orderB = Number.isFinite(b?.order) ? Number(b.order) : 0
        if (orderA !== orderB) return orderA - orderB

        const nameA = a.meta?.name || ''
        const nameB = b.meta?.name || ''
        return nameA.localeCompare(nameB)
      })
    }
  },

  // Действия (Actions)
  actions: {

    viewImage({image, in_system, previewSrc = null}: {
      image: MediaItem
      in_system?: boolean
      previewSrc?: string | null
    }) {
      const rawImage = toRaw(image)

      if (in_system && !isRemoteMediaPath(rawImage.path)) {
        void this.openImageInSystem(rawImage)
        return
      }

      const imageIds = this.buildImageViewerPlaylistIds(rawImage)
      const foundIndex = imageIds.indexOf(rawImage.id)

      eventBus.emit('viewImage', {
        imageIds,
        index: foundIndex < 0 ? 0 : foundIndex,
        fallbackImage: rawImage,
        previewSrc: previewSrc || null,
      })

      void this.countViewNumber(rawImage, 'media')
    },

    async openImageInSystem(image: MediaItem) {
      const imagePath = image.path || ''
      const isFileExists = await checkFileExists(imagePath)
      if (!isFileExists) {
        setNotification({
          type: 'error',
          title: 'File not found on path',
          text: imagePath,
        })
        return
      }

      await openPath(imagePath)
      void this.countViewNumber(image, 'media')
    },

    buildImageViewerPlaylistIds(image: MediaItem) {
      const source = this.navigationItems.length > 0
        ? this.navigationItems
        : this.entities

      if (!source.length) return [image.id]

      const mediaTypeId = image.mediaTypeId
      const ids: number[] = []

      for (const item of source) {
        if (!mediaTypeId || item.mediaTypeId === mediaTypeId) {
          ids.push(item.id)
        }
      }

      if (!ids.length) return [image.id]

      // Keep playlist bounded when the in-memory list is huge; viewer extends via loadMore.
      const MAX_PLAYLIST = INFINITE_SCROLL_MAX_ITEMS
      if (ids.length <= MAX_PLAYLIST) return ids

      const idx = ids.indexOf(image.id)
      if (idx < 0) return ids.slice(0, MAX_PLAYLIST)

      const half = Math.floor(MAX_PLAYLIST / 2)
      let start = Math.max(0, idx - half)
      const end = Math.min(ids.length, start + MAX_PLAYLIST)
      start = Math.max(0, end - MAX_PLAYLIST)
      return ids.slice(start, end)
    },

    registerViewerLoadMoreHandler(handler: (() => Promise<boolean>) | null) {
      this.viewerLoadMoreHandler = handler
    },

    async loadMoreForViewer(): Promise<boolean> {
      if (!this.viewerLoadMoreHandler) return false
      return this.viewerLoadMoreHandler()
    },

    resolveMediaById(id: number): MediaItem | null {
      return this.itemsOnPage.find((item) => item.id === id)
        || this.navigationItems.find((item) => item.id === id)
        || this.entities.find((item) => item.id === id)
        || null
    },

    async findFirstPlayableVideo(videos: MediaItem[] = []): Promise<MediaItem | null> {
      const candidates = videos
        .map((item) => ensureMediaItem(toRaw(item)))
        .filter((candidate) => candidate?.path)

      return findFirstPlayableVideo(candidates, checkFileExists, (candidate) => hasUsableMediaCopy(Number(candidate.id)))
    },

    async playVideo({video, time, in_system, player, videos, trustPath = false, inline = false}: {
      video: PlayableMedia
      time?: number
      /** @deprecated Prefer `player`. `true` → system, `false` → builtin. */
      in_system?: boolean
      /** Explicit player choice; overrides the default-player setting. */
      player?: 'default' | 'builtin' | 'system'
      videos?: PlayableMedia[]
      trustPath?: boolean
      inline?: boolean
    }) {
      const {noteExternalPlayVideo} = await import('@/services/similarRadio')
      noteExternalPlayVideo()

      const settingsStore = useSettingsStore()
      const hasPlaylist = Boolean(videos?.length)
      let playlistVideos: MediaItem[] | undefined = hasPlaylist
        ? videos!.map((item) => ensureMediaItem(toRaw(item)))
        : undefined
      let targetVideo = ensureMediaItem(toRaw(video))

      if (hasPlaylist) {
        // Prefer the requested video (e.g. semantic seek hit / marker clip).
        // trustPath only skips filesystem checks — it must not replace the target
        // with playlist[0], or scene seeks land on the wrong file.
        if (trustPath) {
          if (!targetVideo?.path) {
            targetVideo = (playlistVideos || []).find((item) => item?.path)
              || (playlistVideos || [])[0]
              || targetVideo
          }
        } else {
          const requestedPath = targetVideo?.path
          const requestedOk = requestedPath
            ? await isMediaFileAvailable(targetVideo, checkFileExists)
            : false
          if (!requestedOk) {
            const playable = await this.findFirstPlayableVideo(playlistVideos || [])
            targetVideo = playable
              || (playlistVideos || []).find((item) => item?.path)
              || (playlistVideos || [])[0]
              || targetVideo
          }
        }

        if (!targetVideo) {
          setNotification({
            type: 'error',
            title: 'File not found on path',
            text: 'No playable videos found in playlist',
          })
          return false
        }
      } else if (!trustPath && targetVideo.path) {
        // Original first; then a usable copy (network copy always, local copy only if on disk).
        const isFileExists = await isMediaFileAvailable(targetVideo, checkFileExists)

        if (!isFileExists) {
          setNotification({
            type: 'error',
            title: 'File not found on path',
            text: targetVideo.path
          })
          return false
        }
      }

      const resolvedPlayer: 'default' | 'builtin' | 'system' = player
        ?? (in_system === true ? 'system' : in_system === false ? 'builtin' : 'default')
      let useSystemPlayer = !isRemoteMediaPath(targetVideo.path) && (resolvedPlayer === 'system'
        || (resolvedPlayer === 'default' && settingsStore.isPlayVideoInSystemPlayer === '1'))
      // System player needs a real local path; with only a copy left, use the built-in player.
      if (useSystemPlayer && targetVideo.hasCopies && targetVideo.path && !(await checkFileExists(targetVideo.path))) {
        useSystemPlayer = false
      }

      if (useSystemPlayer) {
        if (targetVideo.path) {
          await openPath(targetVideo.path)
        }

        await this.countViewNumber(targetVideo, 'media')
        return true
      }

      if (!playlistVideos?.length) {
        playlistVideos = [targetVideo]

        const targetId = Number(targetVideo?.id)
        const hasTarget = (list: MediaItem[]) => targetId > 0 && list.some(
          (item) => Number(item?.id) === targetId
        )
        // navigationItems can be stale (a later list response may omit it), so only
        // trust it when it contains the clicked item; otherwise use the visible grid.
        const navigationHasTarget = hasTarget(this.navigationItems)
        const playlistSource = navigationHasTarget ? this.navigationItems : this.entities
        const targetInSource = navigationHasTarget || hasTarget(this.entities)

        let resolvedFullPlaylist = false
        if (targetInSource) {
          const appStore = useAppStore()
          const mediaTypeId = this.environment.media_type_id ?? targetVideo.mediaTypeId
          const mediaType = appStore.mediaTypes?.find((item) => item.id === Number(mediaTypeId))
          const fullPlaylist = await resolveGalleryPlaylistVideos({
            type: this.type,
            mediaTypeId,
            filters: this.filters,
            filtersJoin: this.filtersJoin,
            sortBy: this.sortBy,
            sortDir: this.sortDir,
            find_duplicates: this.find_duplicates,
            duplicatesBy: getDuplicatesGroupKey(mediaType, this.duplicates_by),
            listScopeIds: this.listScopeIds,
            entities: this.entities,
            navigationItems: navigationHasTarget ? this.navigationItems : [],
            totalFiltered: this.totalFiltered,
          })

          if (fullPlaylist?.length) {
            this.navigationItems = fullPlaylist
            playlistVideos = fullPlaylist.map((item) => toRaw(item))
            resolvedFullPlaylist = true
          }
        }

        if (!resolvedFullPlaylist && playlistSource.length > 0 && targetInSource) {
          playlistVideos = playlistSource.map(item => toRaw(item))
        }
      }

      const explicitTime = time != null && Number.isFinite(Number(time)) ? Number(time) : null
      const data = {
        video: targetVideo,
        videos: playlistVideos,
        // Explicit seek (semantic scene / marker) wins over item.segmentStart.
        // No explicit start -> leave it undefined so the player restores the saved position.
        // A default 0 here counts as an explicit "from the beginning" and defeats the restore.
        time: explicitTime != null
          ? explicitTime
          : getSegmentStart(targetVideo),
      };

      if (
        !inline && (settingsStore.open_player_in_separate_window == '1' || nativePlayerNeedsWindow()) &&
        canOpenSeparatePlayer()
      ) {
        if (openSeparatePlayer(data)) {
          return true
        }
      }

      eventBus.emit("playVideo", data);

      return true
    },

    async countViewNumber(item: { id: number; views?: number }, itemType: 'media' | 'tag' | 'meta') {
      const settingsStore = useSettingsStore()

      if (settingsStore.count_number_of_views !== '1' || !item?.id) return

      const apiModels: Record<string, string> = {
        media: 'Media',
        tag: 'Tag',
        meta: 'Meta',
      }
      const model = apiModels[itemType] || 'Media'
      const data: EntityUpdatePayload = {
        views: (item.views || 0) + 1,
        silent: true,
      }

      if (itemType === 'media' || itemType === 'tag') {
        data.viewedAt = getDateForDB()
      }

      await typedApi.updateEntity(model, item.id, data)

      if (itemType === 'meta') {
        void reloadMetaCatalog()
        return
      }

      listSync.getItemsFromDb({
        ids: [item.id],
        type: itemType || 'media',
      })

      if (itemType === 'tag') {
        void reloadTagsCatalog()
      }
    },

    clearSavedFilters() {
      this.filters = [];
      this.filtersJoin = 'and';
      this.savedFilter = {};
    },

    // Метод для безопасного установки assigned
    setAssigned(data: AssignedMeta[] | Record<string, AssignedMeta> | null | undefined) {
      if (Array.isArray(data)) {
        this.assigned = data;
      } else if (data && typeof data === 'object') {
        this.assigned = Object.values(data);
      } else {
        this.assigned = [];
      }
    },

    // Или более гибкий метод
    updateAssigned(updates: AssignedMeta[] | Record<string, AssignedMeta>) {
      if (Array.isArray(updates)) {
        this.assigned = updates;
      } else if (updates && typeof updates === 'object') {
        // Если updates - объект, добавляем/обновляем элементы
        if (Array.isArray(this.assigned)) {
          // Ищем существующие элементы для обновления
          const updated = [...this.assigned];
          Object.entries(updates).forEach(([key, value]) => {
            const existingIndex = updated.findIndex(item => String(item.id) === key)
            if (existingIndex > -1) {
              updated[existingIndex] = {...updated[existingIndex], ...value}
            } else {
              updated.push(value)
            }
          })
          this.assigned = updated;
        } else {
          this.assigned = Object.values(updates);
        }
      }
    },

    // Обновить одно свойство состояния
    updateState({key, value}: { key: keyof ItemsPageStoreUpdates; value: unknown }) {
      if (key in this.$state) {
        this.$patch((state) => {
          (state as Record<string, unknown>)[key as string] = value
        })
      } else {
        console.warn(`Key "${String(key)}" does not exist in items store`)
      }
    },

    updateMultiple(updates: Partial<ItemsPageStoreUpdates>) {
      this.$patch((state) => {
        const record = state as Record<string, unknown>
        Object.entries(updates).forEach(([key, value]) => {
          if (key in state) record[key] = value
        })
      })
    },

    updateEnvironment(updates: Partial<ItemsEnvironment>) {
      this.environment = {...this.environment, ...updates}
    },

    // Удалить элемент по ID
    removeItem(id: number) {
      let removed = false

      // Удалить с текущей страницы
      const indexPage = this.itemsOnPage.findIndex(i => sameItemId(i.id, id))
      if (indexPage > -1) {
        this.itemsOnPage.splice(indexPage, 1)
        removed = true
      }

      // Удалить из всех элементов
      const indexEntities = this.entities.findIndex(i => sameItemId(i.id, id))
      if (indexEntities > -1) {
        this.entities.splice(indexEntities, 1)
        removed = true
      }

      const indexNavigation = this.navigationItems.findIndex(i => sameItemId(i.id, id))
      if (indexNavigation > -1) {
        this.navigationItems.splice(indexNavigation, 1)
        removed = true
      }

      if (removed) {
        this.totalFiltered = Math.max(0, this.totalFiltered - 1)
      }

      // Удалить из выбранных, если там есть
      const selectionIndex = this.selection.indexOf(id)
      if (selectionIndex > -1) {
        this.selection.splice(selectionIndex, 1)
      }

      // Если удалили последний выбранный элемент
      if (this.selected_last === id) {
        this.selected_last = null
      }
    },

    refreshThumb(id: number | null | undefined, {broadcast = true, regenerate = false}: {
      broadcast?: boolean
      regenerate?: boolean
    } = {}) {
      if (id == null) return

      const key = Number(id)
      this.thumbRefreshKeys[key] = Date.now()

      if (regenerate) {
        this.thumbRegenerateKeys[key] = Date.now()
      }

      if (broadcast && typeof BroadcastChannel !== 'undefined') {
        try {
          const channel = new BroadcastChannel(THUMB_BROADCAST_CHANNEL)
          channel.postMessage({id: key})
          channel.close()
        } catch (_) {}
      }
    },

    consumeThumbRegenerate(id: number) {
      const key = Number(id)
      if (!this.thumbRegenerateKeys[key]) return false

      const next = {...this.thumbRegenerateKeys}
      delete next[key]
      this.thumbRegenerateKeys = next
      return true
    },

    /** Drop refresh keys for items that left the infinite-scroll data window. */
    pruneThumbKeys(ids: Array<number | string>) {
      if (!ids.length) return
      let changed = false
      const refresh = {...this.thumbRefreshKeys}
      const regenerate = {...this.thumbRegenerateKeys}
      for (const id of ids) {
        const key = Number(id)
        if (!Number.isFinite(key)) continue
        if (refresh[key] != null) {
          delete refresh[key]
          changed = true
        }
        if (regenerate[key] != null) {
          delete regenerate[key]
          changed = true
        }
      }
      if (!changed) return
      this.thumbRefreshKeys = refresh
      this.thumbRegenerateKeys = regenerate
    },

    // Обновить элемент по ID.
    // Mutate in place so virtual/masonry layouts that keep item refs stay in sync.
    updateItem({id, item}: { id: number; item: Partial<MediaItem> }) {
      if (!item) return

      const mergeInto = (current: MediaItem | undefined) => {
        if (!current) return

        Object.assign(current, item)
        if ('tags' in item) {
          current.tags = Array.isArray(item.tags) ? [...item.tags] : []
        }
        if ('values' in item) {
          current.values = Array.isArray(item.values) ? [...item.values] : []
        }
      }

      mergeInto(this.itemsOnPage.find(i => sameItemId(i.id, id)))
      mergeInto(this.entities.find(i => sameItemId(i.id, id)))
      mergeInto(this.navigationItems.find(i => sameItemId(i.id, id)))
    },

    // Обновить поле элемента (альтернативный метод)
    updateItemField({id, field, value}: { id: number; field: string; value: unknown }) {
      const applyField = (target: MediaItem | undefined) => {
        if (target) (target as Record<string, unknown>)[field] = value
      }

      applyField(this.itemsOnPage.find(i => sameItemId(i.id, id)))
      applyField(this.entities.find(i => sameItemId(i.id, id)))
      applyField(this.navigationItems.find(i => sameItemId(i.id, id)))
    },

    removeTagFromItem({itemId, tagId}: { itemId: number; tagId: number }) {
      const nextTags = (tags: Array<{ tagId: number }>) => (tags || []).filter((entry) => !sameItemId(entry.tagId, tagId))
      const applyTags = (target: MediaItem | undefined) => {
        if (target?.tags) {
          target.tags = nextTags(target.tags)
        }
      }

      applyTags(this.itemsOnPage.find(i => sameItemId(i.id, itemId)))
      applyTags(this.entities.find(i => sameItemId(i.id, itemId)))
      applyTags(this.navigationItems.find(i => sameItemId(i.id, itemId)))
    },

    // Установить поле сортировки
    setSortBy(val: string) {
      this.sortBy = val
    },

    // Установить направление сортировки
    setSortDir(val: string) {
      this.sortDir = val
    },

    // Переключить направление сортировки
    toggleSortDir() {
      this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc'
    },

    resetSelectionAnchor() {
      this.selected_last = null
      this.selectionAnchor = null
    },

    toggleItemSelection(id: number) {
      this.toggleSelect(null, {id})
    },

    /** Select a page without losing selections from other pages. */
    selectAllOnPage() {
      this.selectionRevision++
      this.isSelect = true
      this.selection = [...new Set([...this.selection, ...this.itemsOnPage.map(item => item.id)])]
      this.resetSelectionAnchor()
    },

    /** Mouse and keyboard ranges use the displayed page order. */
    selectRange(fromId: number, toId: number, additive = false) {
      this.selectionRevision++
      this.isSelect = true
      const page = this.itemsOnPage
      const anchor = page.some(item => item.id === fromId) ? fromId : toId
      this.selectionAnchor = anchor
      const ids = selectContiguousEntityIds(page, anchor, toId)
      this.selection = additive
        ? [...new Set([...this.selection, ...ids])]
        : replacePageSelection(this.selection, page, ids)
      this.selected_last = toId
    },

    // Выбрать все элементы, подходящие под текущие фильтры
    async selectAllFiltered() {
      const revision = ++this.selectionRevision
      const scope = itemsSelectionScopeKey(this)
      if (this.type === 'media') {
        const appStore = useAppStore()
        const mediaTypeId = this.environment.media_type_id
        const mediaType = appStore.mediaTypes?.find((item) => item.id === mediaTypeId)

        const response = await typedApi.getMediaIds({
          mediaTypeId,
          filters: this.filters,
          filtersJoin: this.filtersJoin,
          sortBy: this.sortBy,
          direction: this.sortDir,
          find_duplicates: this.find_duplicates,
          duplicates_by: getDuplicatesGroupKey(mediaType, this.duplicates_by),
        })

        if (revision !== this.selectionRevision || scope !== itemsSelectionScopeKey(this)) return
        const scopedIds = this.listScopeIds ? new Set(this.listScopeIds) : null
        this.selection = [...new Set(response.data.ids || [])].filter(id => !scopedIds || scopedIds.has(id))
        this.filterSelectionScope = scopedIds ? null : {
          revision,
          count: this.selection.length,
          filter: {
            mediaTypeId,
            filters: this.filters,
            filtersJoin: this.filtersJoin,
            sortBy: this.sortBy,
            direction: this.sortDir,
            find_duplicates: this.find_duplicates,
            duplicates_by: getDuplicatesGroupKey(mediaType, this.duplicates_by),
          },
        }
        this.isSelect = true
        this.resetSelectionAnchor()
        return
      }

      this.selection = [...new Set(this.entities.map(item => item.id))]
      this.isSelect = true
      this.resetSelectionAnchor()
    },

    // Выбрать все элементы вообще
    async selectAll() {
      await this.selectAllFiltered()
    },

    // Очистить выбор
    clearSelection() {
      this.selectionRevision++
      this.selection = []
      this.selected_last = null
      this.selectionAnchor = null
      this.isSelect = false
    },

    /** Focus a single item for the browser inspector without entering bulk-select mode. */
    focusForInspector(item: { id: number }) {
      this.selectionRevision++
      this.selection = [item.id]
      this.selected_last = item.id
      this.selectionAnchor = null
    },

    /** Clear inspector focus without toggling bulk-select chrome. */
    clearInspectorFocus() {
      this.selectionRevision++
      this.selection = []
      this.selected_last = null
      this.selectionAnchor = null
    },

    // Переключить режим выбора
    toggleSelectMode() {
      this.isSelect = !this.isSelect
      if (!this.isSelect) {
        this.clearSelection()
      }
    },

    // Переключить режим выбора
    toggleSelect(e: MouseEvent | null, item: { id: number }) {
      if (!this.isSelect) {
        this.toggleSelectMode()
      }

      const id = item.id
      if (e?.shiftKey) {
        this.selectRange(this.selectionAnchor ?? this.selected_last ?? id, id, e.ctrlKey || e.metaKey)
        return
      }

      this.selectionRevision++
      this.selectionAnchor = id
      if (this.selection.includes(id)) {
        this.selection = this.selection.filter(selectedId => selectedId !== id)
      } else {
        this.selection = [...this.selection, id]
      }
      this.selected_last = id
    },

    // Добавить фильтр
    addFilter(filter: FilterObject) {
      this.filters.push(filter)
    },

    // Удалить фильтр по индексу
    removeFilter(index: number) {
      if (index >= 0 && index < this.filters.length) {
        this.filters.splice(index, 1)
      }
    },

    // Очистить все фильтры
    clearFilters() {
      this.filters = []
      this.filtersJoin = 'and'
    },

    // Обновить фильтр по индексу
    updateFilter(index: number, updates: Partial<FilterObject>) {
      if (index >= 0 && index < this.filters.length) {
        this.filters[index] = {...this.filters[index], ...updates}
      }
    },

    // Переключить активность фильтра
    toggleFilterActive(index: number) {
      if (index >= 0 && index < this.filters.length) {
        this.filters[index].active = !this.filters[index].active
      }
    },

    // Сохранить текущие фильтры как savedFilter
    saveCurrentFilters(name?: string) {
      this.savedFilter = {
        name: name || `Saved Filter ${new Date().toLocaleString()}`,
        filters: [...this.filters],
        savedAt: new Date().toISOString()
      }
    },

    // Загрузить savedFilter в текущие фильтры
    loadSavedFilter() {
      if (this.savedFilter && this.savedFilter.filters) {
        this.filters = [...this.savedFilter.filters]
      }
    },

    // Перейти на следующую страницу
    nextPage() {
      const totalPages = Math.ceil(this.entities.length / this.limit)
      if (this.page < totalPages) {
        this.page++
        this.updateItemsOnPage()
      }
    },

    // Перейти на предыдущую страницу
    previousPage() {
      if (this.page > 1) {
        this.page--
        this.updateItemsOnPage()
      }
    },

    // Перейти на конкретную страницу
    goToPage(pageNumber: number) {
      const totalPages = Math.ceil(this.entities.length / this.limit)
      if (pageNumber >= 1 && pageNumber <= totalPages) {
        this.page = pageNumber
        this.updateItemsOnPage()
      }
    },

    // Обновить элементы на текущей странице (пагинация)
    updateItemsOnPage() {
      const start = (this.page - 1) * this.limit
      const end = start + this.limit
      this.itemsOnPage = this.entities.slice(start, end)
    },

    // Обновить entities и автоматически обновить itemsOnPage
    setEntities(newEntities: MediaItem[]) {
      this.entities = newEntities
      this.updateItemsOnPage()
    },

    // Добавить элементы к существующим entities
    addEntities(newEntities: MediaItem[]) {
      this.entities = [...this.entities, ...newEntities]
      this.updateItemsOnPage()
    },

    // Сбросить состояние к начальным значениям
    resetState() {
      this.$reset() // Встроенный метод Pinia для сброса к initialState
      // Дополнительный сброс если нужно
      this.environment = {
        media_type_id: null,
        meta_id: null,
        tag_id: null,
        tab_id: null
      }
    },

    // Частичный сброс (только определенные поля)
    resetPartial(fields: Array<keyof ItemsStoreState> = []) {
      const initial = createItemsStoreState()
      this.$patch((state) => {
        const record = state as Record<string, unknown>
        const initialRecord = initial as Record<string, unknown>
        fields.forEach((field) => {
          if (field in initialRecord) {
            record[field as string] = cloneItemsStoreFieldValue(field as string, initialRecord[field as string])
          }
        })
      })
    }
  }
})

export default useItemsStore
