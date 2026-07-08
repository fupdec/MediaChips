import {toRaw} from 'vue'
import {defineStore} from 'pinia'
import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {useEventBus} from '@/utils/eventBus'
import {getDuplicatesGroupKey} from '@/utils/mediaSortFilter'
import {openSeparatePlayer, canOpenSeparatePlayer} from '@/utils/playerWindow'
import {typedApi} from '@/services/typedApi'
import {checkFileExists} from '@/services/fileService'
import {getDateForDB} from '@/services/formatUtils'
import {setNotification} from '@/services/notificationService'
import {openPath} from '@/services/shellService'
import type { FilterObject } from '@/types/common'
import type { EntityUpdatePayload } from '@shared/api/responses'
import type { PlayableMedia } from '@shared/entities/media'
import type { AssignedMeta, ItemsEnvironment, MediaItem, Meta, SavedFilter } from '@/types/stores'
import type { ItemsPageStoreUpdates } from '@/types/itemsPage'
import { ensureMediaItem } from '@/utils/mediaItem'
import { cloneItemsStoreFieldValue } from '@/stores/itemsStoreClone'

const eventBus = useEventBus()

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
    selection: [] as number[],
    savedFilter: {} as SavedFilter,
    filters: [] as FilterObject[],
    filters_saved: [] as SavedFilter[],
    meta: { id: 0 } as Meta,
    assigned: [] as AssignedMeta[],
    isFiltersLoaded: false,
    find_duplicates: false,
    thumbRefreshKeys: {} as Record<number, number>,
    thumbRegenerateKeys: {} as Record<number, number>,
    viewerLoadMoreHandler: null as (() => Promise<boolean>) | null,
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

      if (in_system) {
        void this.openImageInSystem(rawImage)
        return
      }

      eventBus.emit('viewImage', {
        imageIds: [rawImage.id],
        index: 0,
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
      const ids = []

      for (const item of source) {
        if (!mediaTypeId || item.mediaTypeId === mediaTypeId) {
          ids.push(item.id)
        }
      }

      return ids.length ? ids : [image.id]
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

      if (!candidates.length) return null

      const existence = await Promise.all(
        candidates.map((candidate) => checkFileExists(candidate.path!)),
      )

      const index = existence.findIndex(Boolean)
      return index >= 0 ? candidates[index] : null
    },

    async playVideo({video, time, in_system, videos, trustPath = false}: {
      video: PlayableMedia
      time?: number
      in_system?: boolean
      videos?: PlayableMedia[]
      trustPath?: boolean
    }) {
      const settingsStore = useSettingsStore()
      const hasPlaylist = Boolean(videos?.length)
      let playlistVideos: MediaItem[] | undefined = hasPlaylist
        ? videos!.map((item) => ensureMediaItem(toRaw(item)))
        : undefined
      let targetVideo = ensureMediaItem(toRaw(video))

      if (hasPlaylist) {
        const playable = await this.findFirstPlayableVideo(playlistVideos || [])
        targetVideo = playable
          || (playlistVideos || []).find((item) => item?.path)
          || (playlistVideos || [])[0]

        if (!targetVideo) {
          setNotification({
            type: 'error',
            title: 'File not found on path',
            text: 'No playable videos found in playlist',
          })
          return false
        }
      } else         if (!trustPath && targetVideo.path) {
        const isFileExists = await checkFileExists(targetVideo.path)

        if (!isFileExists) {
          setNotification({
            type: 'error',
            title: 'File not found on path',
            text: targetVideo.path
          })
          return false
        }
      }

      if (in_system || settingsStore.isPlayVideoInSystemPlayer === "1") {
        if (targetVideo.path) {
          await openPath(targetVideo.path)
        }

        await this.countViewNumber(targetVideo, 'media')
        return true
      }

      if (!playlistVideos?.length) {
        playlistVideos = [targetVideo]

        const playlistSource = this.navigationItems.length > 0
          ? this.navigationItems
          : this.entities

        const targetId = Number(targetVideo?.id)
        const targetInSource = targetId > 0 && playlistSource.some(
          (item) => Number(item?.id) === targetId
        )

        if (playlistSource.length > 0 && targetInSource) {
          playlistVideos = playlistSource.map(item => toRaw(item))
        }
      }

      const data = {
        video: targetVideo,
        videos: playlistVideos,
        time: time || 0
      };

      if (
        settingsStore.open_player_in_separate_window == '1' &&
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
        eventBus.emit('getMeta')
        return
      }

      eventBus.emit('getItemsFromDb', {
        ids: [item.id],
        type: itemType || 'media',
      })

      if (itemType === 'tag') {
        eventBus.emit('getTags')
      }
    },

    clearSavedFilters() {
      this.filters = [];
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
      // Удалить с текущей страницы
      const indexPage = this.itemsOnPage.findIndex(i => sameItemId(i.id, id))
      if (indexPage > -1) {
        this.itemsOnPage.splice(indexPage, 1)
      }

      // Удалить из всех элементов
      const indexEntities = this.entities.findIndex(i => sameItemId(i.id, id))
      if (indexEntities > -1) {
        this.entities.splice(indexEntities, 1)
      }

      const indexNavigation = this.navigationItems.findIndex(i => sameItemId(i.id, id))
      if (indexNavigation > -1) {
        this.navigationItems.splice(indexNavigation, 1)
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

    // Обновить элемент по ID
    updateItem({id, item}: { id: number; item: Partial<MediaItem> }) {
      if (!item) return

      const mergeItem = (current: MediaItem): MediaItem => ({
        ...current,
        ...item,
      })

      const indexPage = this.itemsOnPage.findIndex(i => sameItemId(i.id, id))
      if (indexPage > -1) {
        this.itemsOnPage.splice(indexPage, 1, mergeItem(this.itemsOnPage[indexPage]))
      }

      const indexEntities = this.entities.findIndex(i => sameItemId(i.id, id))
      if (indexEntities > -1) {
        this.entities.splice(indexEntities, 1, mergeItem(this.entities[indexEntities]))
      }

      const indexNavigation = this.navigationItems.findIndex(i => sameItemId(i.id, id))
      if (indexNavigation > -1) {
        this.navigationItems.splice(
          indexNavigation,
          1,
          mergeItem(this.navigationItems[indexNavigation]),
        )
      }
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

    // Селекция элементов
    toggleItemSelection(id: number) {
      const index = this.selection.indexOf(id)
      if (index === -1) {
        // Добавить в выбранные
        this.selection.push(id)
        this.selected_last = id
      } else {
        // Удалить из выбранных
        this.selection.splice(index, 1)
        if (this.selected_last === id) {
          this.selected_last = null
        }
      }
    },

    // Выбрать все элементы на текущей странице
    selectAllOnPage() {
      this.selection = this.itemsOnPage.map(item => item.id)
    },

    // Выбрать все элементы, подходящие под текущие фильтры
    async selectAllFiltered() {
      if (this.type === 'media') {
        const appStore = useAppStore()
        const mediaTypeId = this.environment.media_type_id
        const mediaType = appStore.mediaTypes?.find((item) => item.id === mediaTypeId)

        const response = await typedApi.getMediaIds({
          mediaTypeId,
          filters: this.filters,
          sortBy: this.sortBy,
          direction: this.sortDir,
          find_duplicates: this.find_duplicates,
          duplicates_by: getDuplicatesGroupKey(mediaType),
        })

        this.selection = response.data.ids || []
        return
      }

      this.selection = this.entities.map(item => item.id)
    },

    // Выбрать все элементы вообще
    async selectAll() {
      await this.selectAllFiltered()
    },

    // Очистить выбор
    clearSelection() {
      this.selection = []
      this.selected_last = null
      this.isSelect = false
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

      const id = item.id;
      const selection = this.selection;
      // выделяем предметы при зажатой кнопке shift
      if (e && e.shiftKey) {
        const last = this.selected_last;
        if (last && selection.length) {
          const index_last = this.entities.findIndex(i => i.id === last);
          const index_current = this.entities.findIndex(i => i.id === id);

          if (index_last > -1 && index_current > -1) {
            let start = index_current;
            let end = index_last;

            if (index_current > index_last) {
              start = index_last;
              end = index_current;
            }

            const section = this.entities.slice(start, end + 1);
            const ids = section.map(i => i.id);

            for (const i of ids) {
              if (selection.includes(i)) {
                const x = selection.findIndex((j) => j == i);
                if (x > -1) selection.splice(x, 1);
              } else {
                selection.push(i)
              }
            }
          }
        }
      } else {
        if (selection.includes(id)) {
          const x = selection.findIndex((i) => i == id);
          if (x > -1) selection.splice(x, 1);
        } else selection.push(id);
      }

      selection.sort((a, b) => Number(a) - Number(b));
      this.selected_last = id;
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