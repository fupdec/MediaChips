import path from 'path'
import type { ApiDb } from '../../../../../api/types/db'
import { createMediaRepository } from '../../../../../api/db/repositories/media'
import { createMediaTypesRepository } from '../../../../../api/db/repositories/mediaTypes'
import { createMetaRepository } from '../../../../../api/db/repositories/meta'
import { createMetaInMediaTypesRepository } from '../../../../../api/db/repositories/metaInMediaTypes'
import { createTagsRepository } from '../../../../../api/db/repositories/tags'
import { createTagsInMediaRepository } from '../../../../../api/db/repositories/tagsInMedia'
import { createMarksRepository } from '../../../../../api/db/repositories/marks'
import { createVideoMetadataRepository } from '../../../../../api/db/repositories/videoMetadata'
import { buildPathLookupVariants, normalizeMediaPath } from '../../../../../api/utils/normalizeUserPath'
import { parseMediaFilePath } from '../../../../../shared/mediaPath'
import {
  formatSynonyms,
  mapStashRatingToMediaChips,
  markerTimeSeconds,
  stashOldId,
} from './mapEntities'
import { loadStashLibraryFromPath } from './openStashDb'
import type {
  StashImportCounts,
  StashImportOptions,
  StashImportProgressCallback,
  StashImportResult,
  StashLibrarySnapshot,
  StashPerformer,
  StashScene,
  StashStudio,
  StashTag,
} from './types'

const META_DEFS = [
  {key: 'performers' as const, name: 'Performers', icon: 'account', country: true, marks: false},
  {key: 'studios' as const, name: 'Studios', icon: 'domain', country: false, marks: false},
  {key: 'tags' as const, name: 'Tags', icon: 'tag', country: false, marks: true},
]

function emptyCounts(): StashImportCounts {
  return {
    performers: 0,
    studios: 0,
    tags: 0,
    mediaCreated: 0,
    mediaMatched: 0,
    mediaUpdated: 0,
    mediaSkipped: 0,
    links: 0,
    markers: 0,
    errors: [],
  }
}

function ensureMetaCategories(db: ApiDb, videoMediaTypeId: number) {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const allMeta = metaRepo.findAll()
  const existingLinks = metaInMediaTypesRepo.findAll()
  const result: Record<'performers' | 'studios' | 'tags', number> = {
    performers: 0,
    studios: 0,
    tags: 0,
  }

  for (const def of META_DEFS) {
    const existing = allMeta.find((row) =>
      row.type === 'array'
      && String(row.name || '').trim().toLowerCase() === def.name.toLowerCase(),
    )
    let metaId = existing?.id
    if (!metaId) {
      const created = metaRepo.create({
        type: 'array',
        name: def.name,
        icon: def.icon,
        country: def.country,
        marks: def.marks,
        favorite: true,
        rating: true,
        synonyms: true,
        oldId: `stash:meta:${def.key}`,
      })
      metaId = created.id
      metaRepo.ensureArrayMetaResources(metaId)
      allMeta.push(created)
    } else if (def.marks && !existing?.marks) {
      metaRepo.updateById(metaId, {marks: true})
    }

    const linked = existingLinks.some(
      (link) => link.metaId === metaId && link.mediaTypeId === videoMediaTypeId,
    )
    if (!linked) {
      metaInMediaTypesRepo.create({
        metaId,
        mediaTypeId: videoMediaTypeId,
        show: true,
        order: existingLinks.length + Object.keys(result).indexOf(def.key),
      })
    }

    result[def.key] = metaId
  }

  return result
}

function upsertStashTag(
  tagsRepo: ReturnType<typeof createTagsRepository>,
  existingByOldId: Map<string, number>,
  existingByNameMeta: Map<string, number>,
  metaId: number,
  kind: 'performer' | 'studio' | 'tag',
  entity: StashPerformer | StashStudio | StashTag,
): number {
  const oldId = stashOldId(kind, entity.id)
  const nameKey = `${metaId}::${entity.name.trim().toLowerCase()}`
  const existingId = existingByOldId.get(oldId) ?? existingByNameMeta.get(nameKey)

  const payload = {
    name: entity.name,
    metaId,
    oldId,
    synonyms: formatSynonyms(entity.aliases),
    favorite: entity.favorite,
    rating: mapStashRatingToMediaChips('rating' in entity ? entity.rating : null),
    country: 'country' in entity ? entity.country : null,
  }

  if (existingId) {
    tagsRepo.updateById(existingId, payload)
    return existingId
  }

  const [created] = tagsRepo.bulkCreate([payload])
  existingByOldId.set(oldId, created.id)
  existingByNameMeta.set(nameKey, created.id)
  return created.id
}

function findMediaForScene(
  mediaRepo: ReturnType<typeof createMediaRepository>,
  scene: StashScene,
  videoMediaTypeId: number,
) {
  if (scene.path) {
    const variants = buildPathLookupVariants(scene.path)
    const byPath = mediaRepo.findByPathVariants(variants)
    if (byPath) return byPath
  }
  if (scene.oshash) {
    const byOshash = mediaRepo.findByOshash(scene.oshash, videoMediaTypeId)
    if (byOshash) return byOshash
  }
  return null
}

function importSceneMarkers(
  marksRepo: ReturnType<typeof createMarksRepository>,
  mediaId: number,
  scene: StashScene,
  tagIdByStashTagId: Map<number, number>,
): number {
  const existing = marksRepo.findAllForVideo(mediaId)
  const existingTimes = new Set(
    existing.map((mark) => Number(mark.time) || 0),
  )
  const inserts: Array<{
    type: string
    text: string | null
    time: number
    end: number | null
    tagId: number | null
    mediaId: number
  }> = []

  for (const marker of scene.markers) {
    const time = markerTimeSeconds(marker.seconds)
    if (existingTimes.has(time)) continue
    existingTimes.add(time)
    inserts.push({
      type: 'bookmark',
      text: marker.title || null,
      time,
      end: marker.endSeconds == null ? null : markerTimeSeconds(marker.endSeconds),
      tagId: marker.primaryTagId != null
        ? tagIdByStashTagId.get(marker.primaryTagId) ?? null
        : null,
      mediaId,
    })
  }

  if (inserts.length) {
    marksRepo.bulkCreate(inserts)
  }
  return inserts.length
}

export async function importStashLibrary(
  db: ApiDb,
  stashDbPath: string,
  options: StashImportOptions = {},
  onProgress?: StashImportProgressCallback,
  isAborted?: () => boolean,
): Promise<StashImportResult> {
  const createMissingMedia = options.createMissingMedia !== false
  const counts = emptyCounts()

  const report = (phase: string, processed: number, total: number, current?: string) => {
    onProgress?.({type: 'progress', phase, processed, total, current})
  }

  let snapshot: StashLibrarySnapshot
  try {
    snapshot = loadStashLibraryFromPath(stashDbPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    counts.errors.push(message)
    throw err
  }

  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const videoType = mediaTypesRepo.findByType('video')
  if (!videoType?.id) {
    throw new Error('Video media type is not configured in this library')
  }
  const videoMediaTypeId = videoType.id

  const metaIds = ensureMetaCategories(db, videoMediaTypeId)
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)

  const existingByOldId = new Map<string, number>()
  const existingByNameMeta = new Map<string, number>()
  for (const tag of tagsRepo.findAllRaw()) {
    if (tag.oldId) existingByOldId.set(String(tag.oldId), tag.id)
    if (tag.metaId != null && tag.name) {
      existingByNameMeta.set(`${tag.metaId}::${tag.name.trim().toLowerCase()}`, tag.id)
    }
  }

  const performerIdMap = new Map<number, number>()
  const studioIdMap = new Map<number, number>()
  const tagIdMap = new Map<number, number>()

  report('performers', 0, snapshot.performers.length)
  for (let i = 0; i < snapshot.performers.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.performers[i]
    const id = upsertStashTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.performers,
      'performer',
      entity,
    )
    performerIdMap.set(entity.id, id)
    counts.performers += 1
    if (i % 25 === 0 || i === snapshot.performers.length - 1) {
      report('performers', i + 1, snapshot.performers.length, entity.name)
    }
  }

  report('studios', 0, snapshot.studios.length)
  for (let i = 0; i < snapshot.studios.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.studios[i]
    const id = upsertStashTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.studios,
      'studio',
      entity,
    )
    studioIdMap.set(entity.id, id)
    counts.studios += 1
    if (i % 25 === 0 || i === snapshot.studios.length - 1) {
      report('studios', i + 1, snapshot.studios.length, entity.name)
    }
  }

  report('tags', 0, snapshot.tags.length)
  for (let i = 0; i < snapshot.tags.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.tags[i]
    const id = upsertStashTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.tags,
      'tag',
      entity,
    )
    tagIdMap.set(entity.id, id)
    counts.tags += 1
    if (i % 25 === 0 || i === snapshot.tags.length - 1) {
      report('tags', i + 1, snapshot.tags.length, entity.name)
    }
  }

  report('scenes', 0, snapshot.scenes.length)
  for (let i = 0; i < snapshot.scenes.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const scene = snapshot.scenes[i]
    const label = scene.path || scene.title || `scene ${scene.id}`

    try {
      if (!scene.path && !scene.oshash) {
        counts.mediaSkipped += 1
        report('scenes', i + 1, snapshot.scenes.length, label)
        continue
      }

      let mediaRow = findMediaForScene(mediaRepo, scene, videoMediaTypeId)
      let created = false

      if (!mediaRow) {
        if (!createMissingMedia || !scene.path) {
          counts.mediaSkipped += 1
          report('scenes', i + 1, snapshot.scenes.length, label)
          continue
        }

        const storedPath = normalizeMediaPath(scene.path) || scene.path
        const parsed = parseMediaFilePath(storedPath)
        const result = mediaRepo.findOrCreateByPath(storedPath, {
          basename: parsed.basename || path.basename(storedPath),
          name: scene.title || parsed.name || path.parse(storedPath).name,
          ext: parsed.ext || path.extname(storedPath).replace(/^\./, ''),
          filesize: scene.filesize,
          mediaTypeId: videoMediaTypeId,
          contentHash: scene.contentHash,
        })
        mediaRow = result.row
        created = result.created
        if (created) counts.mediaCreated += 1
        else counts.mediaMatched += 1
      } else {
        counts.mediaMatched += 1
      }

      mediaRepo.updateById(mediaRow.id, {
        name: scene.title || mediaRow.name,
        filesize: scene.filesize || mediaRow.filesize,
        oshash: scene.oshash || mediaRow.oshash,
        contentHash: scene.contentHash || mediaRow.contentHash,
        rating: mapStashRatingToMediaChips(scene.rating),
        views: Math.max(Number(mediaRow.views) || 0, scene.views),
        viewedAt: scene.viewedAt || mediaRow.viewedAt,
        oldId: stashOldId('scene', scene.id),
        mediaTypeId: videoMediaTypeId,
      })
      counts.mediaUpdated += 1

      if (scene.duration != null || scene.width != null || scene.codec) {
        videoMetadataRepo.upsert({
          mediaId: mediaRow.id,
          duration: scene.duration ?? 0,
          width: scene.width ?? 0,
          height: scene.height ?? 0,
          bitrate: scene.bitrate ?? 0,
          fps: scene.fps ?? 0,
          codec: scene.codec,
        })
      }

      const links: Array<{mediaId: number; tagId: number; metaId: number}> = []
      for (const performerId of scene.performerIds) {
        const tagId = performerIdMap.get(performerId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.performers})
      }
      if (scene.studioId != null) {
        const tagId = studioIdMap.get(scene.studioId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.studios})
      }
      for (const stashTagId of scene.tagIds) {
        const tagId = tagIdMap.get(stashTagId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.tags})
      }
      if (links.length) {
        tagsInMediaRepo.bulkCreate(links)
        counts.links += links.length
      }

      counts.markers += importSceneMarkers(marksRepo, mediaRow.id, scene, tagIdMap)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      counts.errors.push(`${label}: ${message}`)
    }

    if (i % 10 === 0 || i === snapshot.scenes.length - 1) {
      report('scenes', i + 1, snapshot.scenes.length, label)
    }
  }

  return {...counts, ok: true}
}
