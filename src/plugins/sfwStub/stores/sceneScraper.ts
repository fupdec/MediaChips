import {defineStore} from 'pinia'

export const useSceneScraperStore = defineStore('useSceneScraperStore', {
  state: () => ({
    autoScrapeInProgress: false,
    autoScrapeCancelled: false,
    batchTaskId: null as string | null,
  }),
  actions: {
    cancelAutoScrape() {},
    clearBatchTask() {},
  },
})

export default useSceneScraperStore
