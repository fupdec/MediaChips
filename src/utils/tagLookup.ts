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
