import type { App } from 'vue'
import * as fileService from '@/services/fileService'
import { updateConfig, initConfig } from '@/services/configService'
import { showOpenDialog } from '@/services/electronDialogService'
import { getOption, setOption } from '@/services/settingsService'
import { setNotification } from '@/services/notificationService'
import { openPath } from '@/services/shellService'
import { getWatchedFolders } from '@/services/watcherService'

type FilterService = typeof import('@/services/filterService')
let filterServicePromise: Promise<FilterService> | null = null

function loadFilterService(): Promise<FilterService> {
  filterServicePromise ??= import('@/services/filterService')
  return filterServicePromise
}

/** Legacy facade for globalThis.$operable and app.config.globalProperties.$operable */
export function createOperableFacade() {
  return {
    initConfig,
    checkFileExists: fileService.checkFileExists,
    getLocalImage: fileService.getLocalImage,
    updateConfig,
    createImage: fileService.createImage,
    deleteLocalFile: fileService.deleteLocalFile,
    createThumb: fileService.createThumb,
    getOption,
    showOpenDialog,
    setOption,
    openPath,
    getWatchedFolders,
    getSavedFilters: async (...args: Parameters<FilterService['getSavedFilters']>) =>
      (await loadFilterService()).getSavedFilters(...args),
    setNotification,
    getFilters: async (...args: Parameters<FilterService['getFilters']>) =>
      (await loadFilterService()).getFilters(...args),
  }
}

export type OperableFacade = ReturnType<typeof createOperableFacade>

const operablePlugin = {
  install(app: App, _options = {}) {
    const operable = createOperableFacade()

    app.config.globalProperties.$operable = operable
    app.provide('operable', operable)
    globalThis.$operable = operable
  },
}

export default operablePlugin

declare module 'vue' {
  interface ComponentCustomProperties {
    $operable: OperableFacade
  }
}

declare global {
  var $operable: OperableFacade
}
