import type { TagRow } from '../db/repositories/tags'
import { createTagsRepository } from '../db/repositories/tags'
import {
  findTagForMarkerTitle,
} from '../../shared/sceneMarkerTags'

export {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  findTagForMarkerTitle,
  resolveMarkerTagId,
} from '../../shared/sceneMarkerTags'

type TagsRepository = ReturnType<typeof createTagsRepository>

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
