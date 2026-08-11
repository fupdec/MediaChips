import type { Tag } from '@/types/stores'

export interface SceneScraperTagEntry {
  name: string
  exists: boolean
  selected: boolean
  alreadyAssigned: boolean
}

export function normalizeScrapedTagNames(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry ?? '').trim())
      .filter(Boolean)
  }

  const text = String(value ?? '').trim()
  return text ? [text] : []
}

export function normalizeTagLookupName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

export function compactTagLookupName(value: unknown): string {
  return normalizeTagLookupName(value).replace(/\s+/g, '')
}

export function getTagLookupNames(tag: Tag): string[] {
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

export function tagMatchesLookupName(tag: Tag, lookupName: string): boolean {
  const normalized = normalizeTagLookupName(lookupName)
  if (!normalized) return false

  const lookupNames = getTagLookupNames(tag)
  if (lookupNames.includes(normalized)) return true

  const compactLookup = compactTagLookupName(lookupName)
  if (!compactLookup) return false

  return lookupNames.some((name) => compactTagLookupName(name) === compactLookup)
}

export function findTagByNameOrSynonym(metaId: number, name: string, tags: Tag[]): Tag | undefined {
  const normalizedMetaId = Number(metaId)
  return tags.find((tag) =>
    Number(tag.metaId) === normalizedMetaId
    && tagMatchesLookupName(tag, name),
  )
}

/** Tag names are globally unique — reuse across categories when creating. */
export function findTagByNameOrSynonymAnyCategory(name: string, tags: Tag[]): Tag | undefined {
  return tags.find((tag) => tagMatchesLookupName(tag, name))
}

/** @deprecated Use findTagByNameOrSynonym */
export function findTagByName(metaId: number, name: string, tags: Tag[]): Tag | undefined {
  return findTagByNameOrSynonym(metaId, name, tags)
}

function getConflictingTagId(error: unknown): number | null {
  const data = (error as {
    response?: { status?: number; data?: { code?: string; conflictingTagId?: unknown } }
  })?.response?.data
  if (!data || data.code !== 'name_conflict') return null
  const id = Number(data.conflictingTagId)
  return Number.isFinite(id) && id > 0 ? id : null
}

export function buildScrapedTagEntries({
  scrapedNames,
  metaId: _metaId,
  assignedTagIds,
  tags,
}: {
  scrapedNames: string[]
  metaId: number
  assignedTagIds: number[]
  tags: Tag[]
}): SceneScraperTagEntry[] {
  void _metaId
  const assignedIdSet = new Set(assignedTagIds.map((id) => Number(id)))
  // Assigned links are authoritative; do not require tag.metaId to match the field.
  const assignedTags = tags.filter((tag) => assignedIdSet.has(Number(tag.id)))

  return scrapedNames.map((name) => {
    const trimmed = name.trim()
    // Names are globally unique, so "exists" spans categories.
    const exists = Boolean(findTagByNameOrSynonymAnyCategory(trimmed, tags))
    const alreadyAssigned = assignedTags.some((tag) => tagMatchesLookupName(tag, trimmed))

    return {
      name: trimmed,
      exists,
      selected: false,
      alreadyAssigned,
    }
  })
}

export async function findOrCreateTagByName(
  name: string,
  metaId: number,
  allTags: Tag[],
  createTags: (payload: Array<{ name: string; metaId: number }>) => Promise<{ data: Array<{ id: number; name?: string | null }> }>,
): Promise<number> {
  const existingInCategory = findTagByNameOrSynonym(metaId, name, allTags)
  if (existingInCategory) return existingInCategory.id

  // Names are unique across categories — reuse rather than failing create with 409.
  const existingGlobal = findTagByNameOrSynonymAnyCategory(name, allTags)
  if (existingGlobal) return existingGlobal.id

  try {
    const response = await createTags([{ name, metaId }])
    const created = response.data[0]
    if (!created?.id) {
      throw new Error(`Failed to create tag "${name}"`)
    }
    allTags.push({
      ...created,
      id: created.id,
      name: created.name || name,
      metaId,
    } as Tag)

    return created.id
  } catch (error) {
    const conflictingId = getConflictingTagId(error)
    if (conflictingId) {
      const known = allTags.find((tag) => Number(tag.id) === conflictingId)
      if (known) return known.id

      allTags.push({
        id: conflictingId,
        name,
        metaId,
      } as Tag)
      return conflictingId
    }
    throw error
  }
}
