import {defineStore} from 'pinia'

export type SessionFocusTag = {
  tagId: number
  name: string
  metaId: number
  icon?: string | null
  color?: string | null
}

export const SESSION_FOCUS_STORAGE_KEY = 'mediachips.sessionFocus'
export const SESSION_FOCUS_MAX_TAGS = 12

const STORAGE_KEY = SESSION_FOCUS_STORAGE_KEY

export function normalizeSessionFocusTag(
  value: Partial<SessionFocusTag> | null | undefined,
): SessionFocusTag | null {
  if (!value || typeof value !== 'object') return null
  const tagId = Number(value.tagId)
  const metaId = Number(value.metaId)
  if (!Number.isFinite(tagId) || tagId <= 0 || !Number.isFinite(metaId) || metaId <= 0) {
    return null
  }
  const name = String(value.name || '').trim()
  if (!name) return null
  return {
    tagId,
    metaId,
    name,
    icon: value.icon == null || value.icon === '' ? null : String(value.icon),
    color: value.color == null || value.color === '' ? null : String(value.color),
  }
}

function readLegacyTag(parsed: unknown): SessionFocusTag | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
  return normalizeSessionFocusTag(parsed as Partial<SessionFocusTag>)
}

function readStored(): SessionFocusTag[] {
  if (typeof sessionStorage === 'undefined') return []
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (Array.isArray(parsed)) {
      return dedupeTags(parsed.map(normalizeSessionFocusTag).filter((tag): tag is SessionFocusTag => Boolean(tag)))
    }
    if (parsed && typeof parsed === 'object') {
      const record = parsed as {tags?: unknown}
      if (Array.isArray(record.tags)) {
        return dedupeTags(record.tags.map(normalizeSessionFocusTag).filter((tag): tag is SessionFocusTag => Boolean(tag)))
      }
      const legacy = readLegacyTag(parsed)
      return legacy ? [legacy] : []
    }
    return []
  } catch {
    return []
  }
}

function writeStored(tags: SessionFocusTag[]) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!tags.length) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({tags}))
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function dedupeTags(tags: SessionFocusTag[]): SessionFocusTag[] {
  const seen = new Set<number>()
  const result: SessionFocusTag[] = []
  for (const tag of tags) {
    if (seen.has(tag.tagId)) continue
    seen.add(tag.tagId)
    result.push(tag)
    if (result.length >= SESSION_FOCUS_MAX_TAGS) break
  }
  return result
}

export const useSessionFocusStore = defineStore('sessionFocus', {
  state: () => ({
    tags: readStored() as SessionFocusTag[],
  }),
  getters: {
    isActive(state): boolean {
      return state.tags.length > 0
    },
    /** First tray tag — compatibility with the previous single-tag focus. */
    tag(state): SessionFocusTag | null {
      return state.tags[0] ?? null
    },
    tagId(state): number | null {
      return state.tags[0]?.tagId ?? null
    },
    tagIds(state): number[] {
      return state.tags.map((entry) => entry.tagId)
    },
    namesLabel(state): string {
      return state.tags.map((entry) => entry.name).filter(Boolean).join(', ')
    },
  },
  actions: {
    hasTag(tagId: number): boolean {
      const id = Number(tagId)
      return this.tags.some((entry) => entry.tagId === id)
    },
    setTags(tags: SessionFocusTag[]) {
      this.tags = dedupeTags(tags.map(normalizeSessionFocusTag).filter((tag): tag is SessionFocusTag => Boolean(tag)))
      writeStored(this.tags)
    },
    /** Add a tag to the tray (replaces the old single-tag setFocus). */
    setFocus(tag: SessionFocusTag) {
      this.addTag(tag)
    },
    addTag(tag: SessionFocusTag) {
      const next = normalizeSessionFocusTag(tag)
      if (!next) return
      if (this.hasTag(next.tagId)) {
        this.tags = this.tags.map((entry) => (entry.tagId === next.tagId ? next : entry))
        writeStored(this.tags)
        return
      }
      if (this.tags.length >= SESSION_FOCUS_MAX_TAGS) return
      this.tags = [...this.tags, next]
      writeStored(this.tags)
    },
    addTags(tags: SessionFocusTag[]) {
      for (const tag of tags) this.addTag(tag)
    },
    removeTag(tagId: number) {
      const id = Number(tagId)
      if (!Number.isFinite(id) || id <= 0) return
      this.tags = this.tags.filter((entry) => entry.tagId !== id)
      writeStored(this.tags)
    },
    clearFocus() {
      this.tags = []
      writeStored([])
    },
  },
})
