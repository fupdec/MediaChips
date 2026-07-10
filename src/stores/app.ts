import { defineStore } from 'pinia'
import type { AppLogEntry, AppState } from '@/types/stores'

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    is_app_ready: false,
    localhost: '',
    appVersion: '0.1.0',
    app_title: 'MediaChips',
    dbPath: '',
    mediaPath: '',
    databases: [],
    isElectron: null,
    isLocked: false,
    hover: {
      show: false,
      tagId: null,
      metaId: null,
      data_type: null,
      label: null,
      imageAspectRatio: null,
      mediaWidth: null,
      mediaHeight: null,
      isVideo: false,
      timeout: 0,
      delay: 0,
      x: 0,
      y: 0,
      previewWidth: 160,
      previewHeight: 160,
    },
    media: [],
    mediaTypes: [],
    meta: [],
    tags: [],
    playlists: [],
    tabs: [],
    filters: {
      visible: false,
      attached: true,
    },
    syncDarkModeOs: {
      matchMedia: false,
      func: null,
    },
    config: {},
    window: { focused: true },
    log: [],
  }),
  actions: {
    updateState<K extends keyof AppState>(key: K, value: AppState[K]) {
      this.$patch({ [key]: value } as Pick<AppState, K>)
    },
    addLog({ text, type, color }: Omit<AppLogEntry, 'time'>) {
      this.log.push({ type, text, color, time: Date.now() })
    },

    getTagById(id: number) {
      return this.tags.find(i => i.id === id)
    },
    getMetaById(id: number) {
      return this.meta.find(i => i.id === id)
    },
    getTagsByMetaId(id: number) {
      return this.tags.filter(i => i.metaId === id)
    },
  },
})

export default useAppStore
