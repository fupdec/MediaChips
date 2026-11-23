import { defineStore } from 'pinia'
import { typedApi } from '@/services/typedApi'
import { MARKS_PAGE_LIMIT } from '@/utils/markSort'
import type { MarkFilterMeta, MarkItem } from '@/types/stores'

// Keep request handles outside reactive/serialized Pinia state and isolate store instances.
const activeRequests = new WeakMap<object, AbortController>()

export const useMarksStore = defineStore('marks', {
  state: () => ({
    marksOnPage: [] as MarkItem[],
    filterMetas: [] as MarkFilterMeta[],
    selectedTypes: [] as string[],
    sortBy: 'time',
    sortDir: 'desc',
    search: '',
    clipsOnly: false,
    page: 1,
    total: 0,
    totalFiltered: 0,
    isLoaded: false,
    isLoading: false,
    isLoadingMore: false,
  }),

  getters: {
    hasMore(state): boolean {
      return state.marksOnPage.length < state.totalFiltered
    },
  },

  actions: {
    getDefaultTypes(filterMetas: MarkFilterMeta[] = []) {
      return [
        'favorite',
        'bookmark',
        'chapter',
        ...filterMetas.map((meta) => String(meta.id)),
      ]
    },

    async loadFilterMetas() {
      const response = await typedApi.getMarkFilterMetas()
      this.filterMetas = response.data || []

      const defaults = this.getDefaultTypes(this.filterMetas)
      if (!this.selectedTypes.length) {
        this.selectedTypes = defaults
        return
      }

      // Drop category chips that are no longer used in the marks table.
      const allowed = new Set(defaults)
      const pruned = this.selectedTypes.filter((type) => allowed.has(String(type)))
      this.selectedTypes = pruned.length ? pruned : defaults
    },

    async fetchMarks({ append = false }: { append?: boolean } = {}) {
      if (append) {
        if (this.isLoading || this.isLoadingMore || !this.hasMore) return
        this.isLoadingMore = true
      } else {
        this.isLoading = true
        this.isLoadingMore = false
        this.page = 1
        this.marksOnPage = []
      }

      activeRequests.get(this)?.abort()
      const controller = new AbortController()
      activeRequests.set(this, controller)
      const requestedPage = append ? this.page + 1 : 1

      try {
        const response = await typedApi.postMarkItems({
          types: [...this.selectedTypes],
          sortBy: this.sortBy,
          sortDir: this.sortDir,
          search: this.search,
          clipsOnly: this.clipsOnly,
          page: requestedPage,
          limit: MARKS_PAGE_LIMIT,
        }, { signal: controller.signal })
        if (activeRequests.get(this) !== controller) return

        this.page = requestedPage

        const items = response.data?.items || []
        this.total = response.data?.total || 0
        this.totalFiltered = response.data?.totalFiltered || 0

        if (append) {
          const existingIds = new Set(this.marksOnPage.map((mark) => mark.id))
          this.marksOnPage = [
            ...this.marksOnPage,
            ...items.filter((mark: MarkItem) => !existingIds.has(mark.id)),
          ]
        } else {
          this.marksOnPage = items
        }

        this.isLoaded = true
      } catch (error) {
        if (activeRequests.get(this) !== controller) return
        console.error(error)
        if (!append) {
          this.marksOnPage = []
          this.total = 0
          this.totalFiltered = 0
          this.isLoaded = true
        }
      } finally {
        if (activeRequests.get(this) === controller) {
          activeRequests.delete(this)
          this.isLoading = false
          this.isLoadingMore = false
        }
      }
    },

    async reloadMarks() {
      this.page = 1
      await this.fetchMarks()
    },

    async setSelectedTypes(types: string[]) {
      this.selectedTypes = types
      await this.reloadMarks()
    },

    async setSortBy(sortBy: string) {
      this.sortBy = sortBy
      await this.reloadMarks()
    },

    async setSortDir(sortDir: string) {
      this.sortDir = sortDir
      await this.reloadMarks()
    },

    async setSearch(search: string) {
      this.search = search
      await this.reloadMarks()
    },

    async setClipsOnly(clipsOnly: boolean) {
      this.clipsOnly = Boolean(clipsOnly)
      await this.reloadMarks()
    },

    async loadNextPage() {
      if (!this.hasMore || this.isLoading || this.isLoadingMore) return

      await this.fetchMarks({ append: true })
    },
  },
})

export default useMarksStore
