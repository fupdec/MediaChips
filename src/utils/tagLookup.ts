import type {Tag} from '@/types/stores'
import {
  tagMatchesLookupName,
} from '@shared/tagLookupName'

export {tagMatchesLookupName} from '@shared/tagLookupName'

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

function getConflictingTagId(error: unknown): number | null {
  const data = (error as {
    response?: { data?: { code?: string; conflictingTagId?: unknown } }
  })?.response?.data
  if (!data || data.code !== 'name_conflict') return null
  const id = Number(data.conflictingTagId)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function findOrCreateTagByName(
  name: string,
  metaId: number,
  allTags: Tag[],
  createTags: (payload: Array<{ name: string; metaId: number }>) => Promise<{ data: Array<{ id: number; name?: string | null }> }>,
): Promise<number> {
  const existingInCategory = findTagByNameOrSynonym(metaId, name, allTags)
  if (existingInCategory) return existingInCategory.id

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
