import {defineStore} from 'pinia'
import {
  normalizeMediaInboxPath,
} from '@/utils/mediaInbox'

const STORAGE_KEY = 'mediachips.mediaInbox.v1'

type MediaInboxPersisted = {
  ignoredPaths: string[]
  pendingReviewIds: number[]
}

function readPersisted(): MediaInboxPersisted {
  if (typeof localStorage === 'undefined') {
    return {ignoredPaths: [], pendingReviewIds: []}
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {ignoredPaths: [], pendingReviewIds: []}
    const parsed = JSON.parse(raw) as Partial<MediaInboxPersisted>
    return {
      ignoredPaths: Array.isArray(parsed.ignoredPaths)
        ? parsed.ignoredPaths.map(normalizeMediaInboxPath).filter(Boolean)
        : [],
      pendingReviewIds: Array.isArray(parsed.pendingReviewIds)
        ? parsed.pendingReviewIds
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id) && id > 0)
        : [],
    }
  } catch {
    return {ignoredPaths: [], pendingReviewIds: []}
  }
}

function writePersisted(state: MediaInboxPersisted) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export const useMediaInboxStore = defineStore('mediaInbox', {
  state: () => {
    const persisted = readPersisted()
    return {
      dialog: false,
      /** Active tab inside the inbox dialog. */
      tab: 'new' as 'new' | 'lost' | 'pending',
      ignoredPaths: persisted.ignoredPaths as string[],
      /** Media ids added from Inbox that still need triage. */
      pendingReviewIds: persisted.pendingReviewIds as number[],
    }
  },
  getters: {
    pendingCount(state): number {
      return state.pendingReviewIds.length
    },
  },
  actions: {
    persist() {
      writePersisted({
        ignoredPaths: this.ignoredPaths,
        pendingReviewIds: this.pendingReviewIds,
      })
    },
    open(tab: 'new' | 'lost' | 'pending' = 'new') {
      this.tab = tab
      this.dialog = true
    },
    close() {
      this.dialog = false
    },
    ignorePaths(paths: string[]) {
      const next = new Set(this.ignoredPaths)
      for (const path of paths) {
        const normalized = normalizeMediaInboxPath(path)
        if (normalized) next.add(normalized)
      }
      this.ignoredPaths = [...next]
      this.persist()
    },
    clearIgnored() {
      this.ignoredPaths = []
      this.persist()
    },
    enqueuePendingReview(ids: number[]) {
      const next = new Set(this.pendingReviewIds)
      for (const id of ids) {
        const n = Number(id)
        if (Number.isFinite(n) && n > 0) next.add(n)
      }
      this.pendingReviewIds = [...next]
      this.persist()
    },
    removePendingReview(ids: number[]) {
      const remove = new Set(ids.map(Number))
      this.pendingReviewIds = this.pendingReviewIds.filter((id) => !remove.has(id))
      this.persist()
    },
    clearPendingReview() {
      this.pendingReviewIds = []
      this.persist()
    },
  },
})

export default useMediaInboxStore
