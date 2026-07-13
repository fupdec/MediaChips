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

/** @deprecated Use findTagByNameOrSynonym */
export function findTagByName(metaId: number, name: string, tags: Tag[]): Tag | undefined {
  return findTagByNameOrSynonym(metaId, name, tags)
}

export function buildScrapedTagEntries({
  scrapedNames,
  metaId,
  assignedTagIds,
  tags,
}: {
  scrapedNames: string[]
  metaId: number
  assignedTagIds: number[]
  tags: Tag[]
}): SceneScraperTagEntry[] {
  const metaTags = tags.filter((tag) => Number(tag.metaId) === Number(metaId))
  const assignedTags = metaTags.filter((tag) =>
    assignedTagIds.includes(Number(tag.id)),
  )

  return scrapedNames.map((name) => {
    const trimmed = name.trim()
    const exists = Boolean(findTagByNameOrSynonym(metaId, trimmed, metaTags))
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
  const existing = findTagByNameOrSynonym(metaId, name, allTags)
  if (existing) return existing.id

  const response = await createTags([{ name, metaId }])
  const created = response.data[0]
  allTags.push({
    ...created,
    id: created.id,
    name: created.name || name,
    metaId,
  } as Tag)

  return created.id
}
