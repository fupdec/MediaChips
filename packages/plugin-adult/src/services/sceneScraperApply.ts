import { typedApi } from '@/services/typedApi'
import { findOrCreateTagByName, findTagByNameOrSynonym, normalizeScrapedTagNames } from '../utils/sceneScraperTags'
import type { Tag } from '@/types/stores'

export async function applySceneScrapedTagNames({
  metaId,
  names,
  currentTagIds,
  allTags,
}: {
  metaId: number
  names: unknown
  currentTagIds: number[]
  allTags: Tag[]
}): Promise<number[]> {
  const nextIds = [...currentTagIds]

  for (const name of normalizeScrapedTagNames(names)) {
    const existing = findTagByNameOrSynonym(metaId, name, allTags)

    if (existing) {
      if (!nextIds.includes(existing.id)) {
        nextIds.push(existing.id)
      }
      continue
    }

    const tagId = await findOrCreateTagByName(
      name,
      metaId,
      allTags,
      (payload) => typedApi.createTags(payload),
    )

    if (!nextIds.includes(tagId)) {
      nextIds.push(tagId)
    }
  }

  return nextIds
}
