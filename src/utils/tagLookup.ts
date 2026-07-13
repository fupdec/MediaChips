import type {Tag} from '@/types/stores'

function normalizeTagLookupName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function compactTagLookupName(value: unknown): string {
  return normalizeTagLookupName(value).replace(/\s+/g, '')
}

function getTagLookupNames(tag: Tag): string[] {
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
