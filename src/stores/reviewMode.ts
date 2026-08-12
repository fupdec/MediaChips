import {defineStore} from 'pinia'
import type {MediaItem} from '@/types/stores'

export type ReviewTagSlot = {
  key: string
  label: string
  tagId: number
  metaId: number
  name: string
  color?: string | null
}

type ReviewModeState = {
  active: boolean
  /** Ordered media ids for the current review session. */
  mediaIds: number[]
  index: number
  /** Snapshot of media used while reviewing (avoids losing context if list reloads). */
  mediaById: Record<number, MediaItem>
  /** Flash feedback after a rating/tag/favorite action. */
  statusText: string
  statusTimeout: ReturnType<typeof setTimeout> | null
}

export const REVIEW_TAG_KEYS = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO'] as const

export const REVIEW_TAG_KEY_LABELS: Record<(typeof REVIEW_TAG_KEYS)[number], string> = {
  KeyQ: 'Q',
  KeyW: 'W',
  KeyE: 'E',
  KeyR: 'R',
  KeyT: 'T',
  KeyY: 'Y',
  KeyU: 'U',
  KeyI: 'I',
  KeyO: 'O',
}

export const useReviewModeStore = defineStore('reviewMode', {
  state: (): ReviewModeState => ({
    active: false,
    mediaIds: [],
    index: 0,
    mediaById: {},
    statusText: '',
    statusTimeout: null,
  }),
  getters: {
    currentId(state): number | null {
      if (!state.mediaIds.length) return null
      const id = state.mediaIds[state.index]
      return Number.isFinite(id) ? id : null
    },
    current(state): MediaItem | null {
      const id = state.mediaIds[state.index]
      if (id == null) return null
      return state.mediaById[id] ?? null
    },
    counter(state): string {
      if (!state.mediaIds.length) return ''
      return `${state.index + 1} / ${state.mediaIds.length}`
    },
    hasPrev(state): boolean {
      return state.index > 0
    },
    hasNext(state): boolean {
      return state.index < state.mediaIds.length - 1
    },
  },
  actions: {
    open(mediaList: MediaItem[], startId?: number | null) {
      const unique = new Map<number, MediaItem>()
      for (const item of mediaList) {
        const id = Number(item?.id)
        if (!Number.isFinite(id) || id <= 0) continue
        if (!unique.has(id)) unique.set(id, item)
      }
      const ids = [...unique.keys()]
      if (!ids.length) return false

      let index = 0
      if (startId != null) {
        const found = ids.indexOf(Number(startId))
        if (found >= 0) index = found
      }

      this.mediaById = Object.fromEntries([...unique.entries()])
      this.mediaIds = ids
      this.index = index
      this.active = true
      this.clearStatus()
      return true
    },
    close() {
      this.active = false
      this.mediaIds = []
      this.index = 0
      this.mediaById = {}
      this.clearStatus()
    },
    goPrev() {
      if (!this.hasPrev) return false
      this.index -= 1
      return true
    },
    goNext() {
      if (!this.hasNext) return false
      this.index += 1
      return true
    },
    patchCurrent(patch: Partial<MediaItem>) {
      const id = this.currentId
      if (id == null) return
      const current = this.mediaById[id]
      if (!current) return
      this.mediaById[id] = {...current, ...patch}
    },
    showStatus(text: string) {
      this.clearStatus()
      this.statusText = text
      this.statusTimeout = setTimeout(() => {
        this.statusText = ''
        this.statusTimeout = null
      }, 1400)
    },
    clearStatus() {
      if (this.statusTimeout) {
        clearTimeout(this.statusTimeout)
        this.statusTimeout = null
      }
      this.statusText = ''
    },
  },
})

export default useReviewModeStore
