import {defineStore} from 'pinia'

export type SessionFocusTag = {
  tagId: number
  name: string
  metaId: number
  icon?: string | null
  color?: string | null
}

const STORAGE_KEY = 'mediachips.sessionFocus'

function readStored(): SessionFocusTag | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SessionFocusTag>
    const tagId = Number(parsed.tagId)
    const metaId = Number(parsed.metaId)
    if (!Number.isFinite(tagId) || tagId <= 0 || !Number.isFinite(metaId) || metaId <= 0) {
      return null
    }
    const name = String(parsed.name || '').trim()
    if (!name) return null
    return {
      tagId,
      metaId,
      name,
      icon: parsed.icon == null ? null : String(parsed.icon),
      color: parsed.color == null ? null : String(parsed.color),
    }
  } catch {
    return null
  }
}

function writeStored(value: SessionFocusTag | null) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!value) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

export const useSessionFocusStore = defineStore('sessionFocus', {
  state: () => ({
    tag: readStored() as SessionFocusTag | null,
  }),
  getters: {
    isActive(state): boolean {
      return Boolean(state.tag)
    },
    tagId(state): number | null {
      return state.tag?.tagId ?? null
    },
  },
  actions: {
    setFocus(tag: SessionFocusTag) {
      const tagId = Number(tag.tagId)
      const metaId = Number(tag.metaId)
      if (!Number.isFinite(tagId) || tagId <= 0 || !Number.isFinite(metaId) || metaId <= 0) {
        return
      }
      const name = String(tag.name || '').trim()
      if (!name) return
      this.tag = {
        tagId,
        metaId,
        name,
        icon: tag.icon ?? null,
        color: tag.color ?? null,
      }
      writeStored(this.tag)
    },
    clearFocus() {
      this.tag = null
      writeStored(null)
    },
  },
})
