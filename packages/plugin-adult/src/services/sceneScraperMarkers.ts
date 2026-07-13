import { typedApi } from '@/services/typedApi'
import type { Tag } from '@/types/stores'
import type { SceneScraperMarker, SceneScraperMarkerEntry } from '../types/sceneScraper'
import {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  resolveMarkerTagId,
  resolveOrCreateMarkerTagId,
} from '@/utils/sceneMarkerTags'

export { buildSceneMarkerSignature } from '@/utils/sceneMarkerTags'

export function annotateSceneMarkersWithExisting(
  markers: SceneScraperMarker[],
  existingMarks: Array<{
    type?: string | null
    time?: number | null
    tagId?: number | null
    text?: string | null
  }>,
  {
    allTags,
    markerMetaId,
  }: {
    allTags: Tag[]
    markerMetaId: number | null
  },
): SceneScraperMarkerEntry[] {
  const existingSignatures = new Set(
    existingMarks.map((mark) => buildExistingMarkSignature(mark)),
  )

  return markers.map((marker) => {
    const resolution = resolveMarkerTagId({
      title: marker.title,
      allTags,
      markerMetaId,
    })

    const signature = buildSceneMarkerSignature(marker.time, {
      tagId: resolution.tagId,
      title: marker.title,
    })
    const alreadyExists = existingSignatures.has(signature)

    return {
      ...marker,
      tagId: resolution.tagId,
      tagExists: resolution.tagExists,
      willCreate: resolution.willCreate,
      unresolved: resolution.unresolved,
      alreadyExists,
      selected: !alreadyExists && !resolution.unresolved,
    }
  })
}

export async function applySelectedSceneMarkers({
  mediaId,
  markers,
  markerMetaId,
  allTags,
}: {
  mediaId: number
  markers: SceneScraperMarkerEntry[]
  markerMetaId: number | null
  allTags: Tag[]
}) {
  let imported = 0

  for (const marker of markers) {
    if (!marker.selected || marker.alreadyExists || marker.unresolved) continue

    let tagId = marker.tagId
    if (!tagId) {
      if (!markerMetaId) continue

      tagId = await resolveOrCreateMarkerTagId({
        title: marker.title,
        allTags,
        markerMetaId,
        createTags: (payload) => typedApi.createTags(payload),
      })
    }

    if (!tagId) continue

    await typedApi.createMark({
      type: 'meta',
      tagId,
      time: marker.time,
      end: marker.end ?? undefined,
      mediaId,
    })
    imported += 1
  }

  return imported
}
