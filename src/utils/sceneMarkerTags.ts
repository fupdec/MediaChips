import type { Tag } from '@/types/stores'
import { findOrCreateTagByName } from '@/utils/tagLookup'
import {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  findTagForMarkerTitle,
  resolveMarkerTagId,
} from '@shared/sceneMarkerTags'

export {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  findTagForMarkerTitle,
  resolveMarkerTagId,
} from '@shared/sceneMarkerTags'

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
