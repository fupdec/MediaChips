import type { ApiDb } from '../types/db'
import { createMarksRepository } from '../db/repositories/marks'
import { createMediaRepository } from '../db/repositories/media'
import { createMetaRepository } from '../db/repositories/meta'
import { createTagsRepository } from '../db/repositories/tags'
import { deleteMarkGeneratedAsset } from './localAssetCleanup'
import { fetchTpdbSceneMarkers } from '../plugins/adult/theporndbApi'
import {
  buildExistingMarkSignature,
  buildSceneMarkerSignature,
  resolveMarkerTagId,
  resolveOrCreateMarkerTagId,
} from './sceneMarkerTags'

export type SceneMarkerMergeMode = 'merge' | 'replace'

export interface SceneMarkerApplyResult {
  imported: number
  skipped: number
  total: number
}

function parseMarkerMetaId(value: unknown): number | null {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

export async function applyTpdbSceneMarkersToMedia({
  db,
  sceneId,
  mediaId,
  merge = 'merge',
  markerMetaId: markerMetaIdInput = null,
}: {
  db: ApiDb
  sceneId: string
  mediaId: number
  merge?: SceneMarkerMergeMode
  markerMetaId?: number | null
}): Promise<SceneMarkerApplyResult> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const metaRepo = createMetaRepository(db.drizzle)
  const dbPath = db.path!
  const markerMetaId = parseMarkerMetaId(markerMetaIdInput)

  const media = mediaRepo.findById(mediaId)
  if (!media) {
    throw new Error('Media not found')
  }

  if (markerMetaId) {
    const markerMeta = metaRepo.findById(markerMetaId)
    if (!markerMeta?.marks) {
      throw new Error('Selected marker meta category is not configured for timeline marks')
    }
  }

  const markers = await fetchTpdbSceneMarkers(sceneId, {db})
  if (!markers.length) {
    return { imported: 0, skipped: 0, total: 0 }
  }

  const existingMarks = marksRepo.findAllForVideo(mediaId)
  const existingSignatures = new Set(
    existingMarks.map((mark) => buildExistingMarkSignature(mark)),
  )

  if (merge === 'replace' && existingMarks.length) {
    for (const mark of existingMarks) {
      if (mark.id != null) {
        deleteMarkGeneratedAsset(dbPath, mark.id)
        marksRepo.deleteById(mark.id)
      }
    }
    existingSignatures.clear()
  }

  const allTags = tagsRepo.findAllRaw()
  const inserts = []
  let skipped = 0

  for (const marker of markers) {
    const resolution = resolveMarkerTagId({
      title: marker.title,
      allTags,
      markerMetaId,
    })

    if (resolution.unresolved) {
      skipped += 1
      continue
    }

    let tagId = resolution.tagId
    if (!tagId && markerMetaId) {
      tagId = resolveOrCreateMarkerTagId({
        title: marker.title,
        allTags,
        markerMetaId,
        tagsRepo,
      })
    }

    if (!tagId) {
      skipped += 1
      continue
    }

    const signature = buildSceneMarkerSignature(marker.time, { tagId, title: marker.title })
    if (existingSignatures.has(signature)) {
      skipped += 1
      continue
    }

    inserts.push({
      type: 'meta',
      tagId,
      time: marker.time,
      end: marker.end,
      mediaId,
    })
    existingSignatures.add(signature)
  }

  if (inserts.length) {
    marksRepo.bulkCreate(inserts)
  }

  return {
    imported: inserts.length,
    skipped,
    total: markers.length,
  }
}
