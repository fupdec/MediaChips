import {defineStore} from 'pinia'

export const useScraperStore = defineStore('useScraperStore', {
  state: () => ({
    query: '',
    autoScrapeInProgress: false,
    autoScrapeCancelled: false,
    batchTaskId: null as string | null,
  }),
  actions: {
    async searchPerformer() { return null },
    async getOnePerformerByQueryString() { return null },
    async autoScrapeTag() {
      return {success: false, tagId: 0, tagName: '', error: 'sfw'}
    },
    cancelAutoScrape() {},
    clearBatchTask() {},
    async autoScrapeTags() {
      return {results: [], cancelled: false}
    },
  },
})

export default useScraperStore
