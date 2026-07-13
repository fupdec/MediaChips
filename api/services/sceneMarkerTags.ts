import type { TagRow } from '../db/repositories/tags'
import { createTagsRepository } from '../db/repositories/tags'

type TagsRepository = ReturnType<typeof createTagsRepository>

function normalizeTagLookupName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function compactTagLookupName(value: unknown): string {
  return normalizeTagLookupName(value).replace(/\s+/g, '')
}

function getTagLookupNames(tag: TagRow): string[] {
  const names = new Set<string>()
  const primaryName = normalizeTagLookupName(tag.name)
  if (primaryName) names.add(primaryName)

  if (tag.synonyms) {
    for (const synonym of String(tag.synonyms).split(',')) {
      const normalized = normalizeTagLookupName(synonym)
      if (normalized) names.add(normalized)
    }
  }

  return [...names]
}

function tagMatchesLookupName(tag: TagRow, lookupName: string): boolean {
  const normalized = normalizeTagLookupName(lookupName)
  if (!normalized) return false

  const lookupNames = getTagLookupNames(tag)
  if (lookupNames.includes(normalized)) return true

  const compactLookup = compactTagLookupName(lookupName)
  if (!compactLookup) return false

  return lookupNames.some((name) => compactTagLookupName(name) === compactLookup)
}

export function findTagForMarkerTitle(title: string, allTags: TagRow[]): TagRow | undefined {
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
  allTags: TagRow[]
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

export function resolveOrCreateMarkerTagId({
  title,
  allTags,
  markerMetaId,
  tagsRepo,
}: {
  title: string
  allTags: TagRow[]
  markerMetaId: number
  tagsRepo: TagsRepository
}): number | null {
  const existing = findTagForMarkerTitle(title, allTags)
  if (existing?.id != null) return existing.id

  const trimmed = String(title || '').trim()
  if (!trimmed) return null

  const created = tagsRepo.bulkCreate([{ name: trimmed, metaId: markerMetaId }])
  const tag = created[0]
  if (!tag?.id) return null

  allTags.push(tag)
  return tag.id
}
