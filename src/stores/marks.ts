import { defineStore } from 'pinia'
import { typedApi } from '@/services/typedApi'
import { MARKS_PAGE_LIMIT } from '@/utils/markSort'
import type { MarkFilterMeta, MarkItem } from '@/types/stores'

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

      if (!this.selectedTypes.length) {
        this.selectedTypes = this.getDefaultTypes(this.filterMetas)
      }
    },

    async fetchMarks({ append = false }: { append?: boolean } = {}) {
      if (append) {
        if (this.isLoadingMore || !this.hasMore) return
        this.isLoadingMore = true
      } else {
        this.isLoading = true
        this.page = 1
        this.marksOnPage = []
      }

      try {
        const response = await typedApi.postMarkItems({
          types: this.selectedTypes,
          sortBy: this.sortBy,
          sortDir: this.sortDir,
          search: this.search,
          clipsOnly: this.clipsOnly,
          page: this.page,
          limit: MARKS_PAGE_LIMIT,
        })

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
        console.error(error)
        if (!append) {
          this.marksOnPage = []
          this.total = 0
          this.totalFiltered = 0
          this.isLoaded = true
        }
      } finally {
        this.isLoading = false
        this.isLoadingMore = false
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

      this.page += 1
      await this.fetchMarks({ append: true })
    },
  },
})

export default useMarksStore
