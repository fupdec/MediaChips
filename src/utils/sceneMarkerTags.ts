import type { Tag } from '@/types/stores'
import { findOrCreateTagByName, tagMatchesLookupName } from './sceneScraperTags'

export function findTagForMarkerTitle(title: string, allTags: Tag[]): Tag | undefined {
  const trimmed = String(title || '').trim()
  if (!trimmed) return undefined

  return allTags.find((tag) => tagMatchesLookupName(tag, trimmed))
}

export function resolveMarkerTagId({
  title,
  allTags,
  markerMetaId,
}: {
  title: string
  allTags: Tag[]
  markerMetaId: number | null
}): {
  tagId: number | null
  tagExists: boolean
  willCreate: boolean
  unresolved: boolean
} {
  const existing = findTagForMarkerTitle(title, allTags)
  if (existing) {
    return {
      tagId: existing.id,
      tagExists: true,
      willCreate: false,
      unresolved: false,
    }
  }

  if (markerMetaId) {
    return {
      tagId: null,
      tagExists: false,
      willCreate: true,
      unresolved: false,
    }
  }

  return {
    tagId: null,
    tagExists: false,
    willCreate: false,
    unresolved: true,
  }
}

export function buildSceneMarkerSignature(
  time: number,
  options?: { tagId?: number | null; title?: string | null },
): string {
  const normalizedTime = Number(time) || 0
  if (options?.tagId) return `${normalizedTime}:tag:${options.tagId}`
  return `${normalizedTime}:name:${String(options?.title || '').trim().toLowerCase()}`
}

export function buildExistingMarkSignature(mark: {
  type?: string | null
  time?: number | null
  tagId?: number | null
  text?: string | null
}): string {
  const time = Number(mark.time) || 0
  if (mark.type === 'meta' && mark.tagId) {
    return buildSceneMarkerSignature(time, { tagId: mark.tagId })
  }

  return buildSceneMarkerSignature(time, { title: mark.text })
}

export async function resolveOrCreateMarkerTagId({
  title,
  allTags,
  markerMetaId,
  createTags,
}: {
  title: string
  allTags: Tag[]
  markerMetaId: number
  createTags: (payload: Array<{ name: string; metaId: number }>) => Promise<{ data: Array<{ id: number; name?: string | null }> }>
}): Promise<number | null> {
  const existing = findTagForMarkerTitle(title, allTags)
  if (existing) return existing.id

  return findOrCreateTagByName(title, markerMetaId, allTags, createTags)
}
