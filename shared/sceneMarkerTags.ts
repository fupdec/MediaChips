import {tagMatchesLookupName, type TagLookupLike} from './tagLookupName'

export type MarkerTagLike = TagLookupLike & {id?: number | null}

export function findTagForMarkerTitle<T extends MarkerTagLike>(
  title: string,
  allTags: T[],
): T | undefined {
  const trimmed = String(title || '').trim()
  if (!trimmed) return undefined

  return allTags.find((tag) => tagMatchesLookupName(tag, trimmed))
}

export function resolveMarkerTagId<T extends MarkerTagLike>({
  title,
  allTags,
  markerMetaId,
}: {
  title: string
  allTags: T[]
  markerMetaId: number | null
}): {
  tagId: number | null
  tagExists: boolean
  willCreate: boolean
  unresolved: boolean
} {
  const existing = findTagForMarkerTitle(title, allTags)
  if (existing?.id != null) {
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
  options?: {tagId?: number | null; title?: string | null},
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
    return buildSceneMarkerSignature(time, {tagId: mark.tagId})
  }

  return buildSceneMarkerSignature(time, {title: mark.text})
}
