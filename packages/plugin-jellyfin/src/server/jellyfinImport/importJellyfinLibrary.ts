import path from 'path'
import type {ApiDb} from '../../../../../api/types/db'
import {createMediaRepository} from '../../../../../api/db/repositories/media'
import {createMediaTypesRepository} from '../../../../../api/db/repositories/mediaTypes'
import {createMetaRepository} from '../../../../../api/db/repositories/meta'
import {createMetaInMediaTypesRepository} from '../../../../../api/db/repositories/metaInMediaTypes'
import {createTagsRepository} from '../../../../../api/db/repositories/tags'
import {createTagsInMediaRepository} from '../../../../../api/db/repositories/tagsInMedia'
import {createMarksRepository} from '../../../../../api/db/repositories/marks'
import {createVideoMetadataRepository} from '../../../../../api/db/repositories/videoMetadata'
import {buildPathLookupVariants, normalizeMediaPath} from '../../../../../api/utils/normalizeUserPath'
import {parseMediaFilePath} from '../../../../../shared/mediaPath'
import {createJellyfinClient} from './jellyfinClient'
import {
  jellyfinOldId,
  mapJellyfinRatingToMediaChips,
  markerTimeSeconds,
} from './mapEntities'
import type {
  JellyfinImportCounts,
  JellyfinImportOptions,
  JellyfinImportProgressCallback,
  JellyfinImportResult,
  JellyfinLibrarySnapshot,
  JellyfinOldIdPrefix,
} from './types'

const META_DEFS = [
  {
    key: 'performers' as const,
    name: 'Performers',
    icon: 'account',
    country: true,
    marks: false,
    imageAspectRatio: 5 / 8,
  },
  {key: 'studios' as const, name: 'Studios', icon: 'domain', country: false, marks: false},
  {key: 'tags' as const, name: 'Tags', icon: 'tag', country: false, marks: true},
  {key: 'series' as const, name: 'Series', icon: 'television-classic', country: false, marks: false},
]

function emptyCounts(): JellyfinImportCounts {
  return {
    people: 0,
    genres: 0,
    studios: 0,
    series: 0,
    mediaCreated: 0,
    mediaMatched: 0,
    mediaUpdated: 0,
    mediaSkipped: 0,
    links: 0,
    markers: 0,
    errors: [],
  }
}

function ensureMetaCategories(db: ApiDb, videoMediaTypeId: number, prefix: JellyfinOldIdPrefix) {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const allMeta = metaRepo.findAll()
  const existingLinks = metaInMediaTypesRepo.findAll()
  const result: Record<'performers' | 'studios' | 'tags' | 'series', number> = {
    performers: 0,
    studios: 0,
    tags: 0,
    series: 0,
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
        imageAspectRatio: 'imageAspectRatio' in def ? def.imageAspectRatio : undefined,
        favorite: true,
        rating: true,
        synonyms: true,
        oldId: jellyfinOldId(prefix, 'meta', def.key),
      })
      metaId = created.id
      metaRepo.ensureArrayMetaResources(metaId)
      allMeta.push(created)
    } else {
      const patch: Record<string, unknown> = {}
      if (def.marks && !existing?.marks) {
        patch.marks = true
      }
      if (
        'imageAspectRatio' in def
        && def.imageAspectRatio != null
        && Number(existing?.imageAspectRatio) !== def.imageAspectRatio
      ) {
        patch.imageAspectRatio = def.imageAspectRatio
      }
      if (Object.keys(patch).length) {
        metaRepo.updateById(metaId, patch)
      }
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

function upsertNamedTag(
  tagsRepo: ReturnType<typeof createTagsRepository>,
  existingByOldId: Map<string, number>,
  existingByNameMeta: Map<string, number>,
  metaId: number,
  oldId: string,
  name: string,
): number {
  const nameKey = `${metaId}::${name.trim().toLowerCase()}`
  const existingId = existingByOldId.get(oldId) ?? existingByNameMeta.get(nameKey)
  const payload = {
    name,
    metaId,
    oldId,
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

function findMediaForItem(
  mediaRepo: ReturnType<typeof createMediaRepository>,
  mediaByOldId: Map<string, number>,
  itemOldId: string,
  itemPath: string | null,
) {
  const byOldId = mediaByOldId.get(itemOldId)
  if (byOldId) {
    const row = mediaRepo.findById(byOldId)
    if (row) return row
  }
  if (itemPath) {
    const variants = buildPathLookupVariants(itemPath)
    const byPath = mediaRepo.findByPathVariants(variants)
    if (byPath) return byPath
  }
  return null
}

function importChapters(
  marksRepo: ReturnType<typeof createMarksRepository>,
  mediaId: number,
  chapters: Array<{name: string | null; startSeconds: number}>,
): number {
  const existing = marksRepo.findAllForVideo(mediaId)
  const existingTimes = new Set(existing.map((mark) => Number(mark.time) || 0))
  const inserts: Array<{
    type: string
    text: string | null
    time: number
    end: number | null
    tagId: number | null
    mediaId: number
  }> = []

  for (const chapter of chapters) {
    const time = markerTimeSeconds(chapter.startSeconds)
    if (existingTimes.has(time)) continue
    existingTimes.add(time)
    inserts.push({
      type: 'bookmark',
      text: chapter.name,
      time,
      end: null,
      tagId: null,
      mediaId,
    })
  }

  if (inserts.length) {
    marksRepo.bulkCreate(inserts)
  }
  return inserts.length
}

export async function importJellyfinLibrary(
  db: ApiDb,
  options: JellyfinImportOptions,
  onProgress?: JellyfinImportProgressCallback,
  isAborted?: () => boolean,
  clientFactory: typeof createJellyfinClient = createJellyfinClient,
): Promise<JellyfinImportResult> {
  const createMissingMedia = options.createMissingMedia !== false
  const prefix: JellyfinOldIdPrefix = options.oldIdPrefix || 'jellyfin'
  const counts = emptyCounts()

  const report = (phase: string, processed: number, total: number, current?: string) => {
    onProgress?.({type: 'progress', phase, processed, total, current})
  }

  let snapshot: JellyfinLibrarySnapshot
  try {
    const client = clientFactory({
      baseUrl: options.baseUrl,
      apiKey: options.apiKey,
    })
    snapshot = await client.loadLibrarySnapshot(options.libraryIds)
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

  const metaIds = ensureMetaCategories(db, videoMediaTypeId, prefix)
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

  const mediaByOldId = new Map<string, number>()
  for (const row of mediaRepo.findOldIdMappings()) {
    if (row.oldId) mediaByOldId.set(String(row.oldId), row.id)
  }

  const personIdMap = new Map<string, number>()
  const genreIdMap = new Map<string, number>()
  const studioIdMap = new Map<string, number>()
  const seriesIdMap = new Map<string, number>()

  report('people', 0, snapshot.people.length)
  for (let i = 0; i < snapshot.people.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.people[i]
    const id = upsertNamedTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.performers,
      jellyfinOldId(prefix, 'person', entity.id),
      entity.name,
    )
    personIdMap.set(entity.id, id)
    counts.people += 1
    if (i % 25 === 0 || i === snapshot.people.length - 1) {
      report('people', i + 1, snapshot.people.length, entity.name)
    }
  }

  report('genres', 0, snapshot.genres.length)
  for (let i = 0; i < snapshot.genres.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.genres[i]
    const id = upsertNamedTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.tags,
      jellyfinOldId(prefix, 'genre', entity.id),
      entity.name,
    )
    genreIdMap.set(entity.id, id)
    counts.genres += 1
    if (i % 25 === 0 || i === snapshot.genres.length - 1) {
      report('genres', i + 1, snapshot.genres.length, entity.name)
    }
  }

  report('studios', 0, snapshot.studios.length)
  for (let i = 0; i < snapshot.studios.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.studios[i]
    const id = upsertNamedTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.studios,
      jellyfinOldId(prefix, 'studio', entity.id),
      entity.name,
    )
    studioIdMap.set(entity.id, id)
    counts.studios += 1
    if (i % 25 === 0 || i === snapshot.studios.length - 1) {
      report('studios', i + 1, snapshot.studios.length, entity.name)
    }
  }

  report('series', 0, snapshot.series.length)
  for (let i = 0; i < snapshot.series.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const entity = snapshot.series[i]
    const id = upsertNamedTag(
      tagsRepo,
      existingByOldId,
      existingByNameMeta,
      metaIds.series,
      jellyfinOldId(prefix, 'series', entity.id),
      entity.name,
    )
    seriesIdMap.set(entity.id, id)
    counts.series += 1
    if (i % 25 === 0 || i === snapshot.series.length - 1) {
      report('series', i + 1, snapshot.series.length, entity.name)
    }
  }

  report('items', 0, snapshot.items.length)
  for (let i = 0; i < snapshot.items.length; i++) {
    if (isAborted?.()) throw new Error('Import cancelled')
    const item = snapshot.items[i]
    const label = item.path || item.name || `item ${item.id}`
    const itemOldId = jellyfinOldId(prefix, 'item', item.id)

    try {
      if (!item.path && !mediaByOldId.has(itemOldId)) {
        if (!createMissingMedia || !item.path) {
          counts.mediaSkipped += 1
          report('items', i + 1, snapshot.items.length, label)
          continue
        }
      }

      let mediaRow = findMediaForItem(mediaRepo, mediaByOldId, itemOldId, item.path)
      let created = false

      if (!mediaRow) {
        if (!createMissingMedia || !item.path) {
          counts.mediaSkipped += 1
          report('items', i + 1, snapshot.items.length, label)
          continue
        }

        const storedPath = normalizeMediaPath(item.path) || item.path
        const parsed = parseMediaFilePath(storedPath)
        const result = mediaRepo.findOrCreateByPath(storedPath, {
          basename: parsed.basename || path.basename(storedPath),
          name: item.name || parsed.name || path.parse(storedPath).name,
          ext: parsed.ext || path.extname(storedPath).replace(/^\./, ''),
          filesize: item.filesize,
          mediaTypeId: videoMediaTypeId,
        })
        mediaRow = result.row
        created = result.created
        if (created) counts.mediaCreated += 1
        else counts.mediaMatched += 1
      } else {
        counts.mediaMatched += 1
      }

      mediaRepo.updateById(mediaRow.id, {
        name: item.name || mediaRow.name,
        filesize: item.filesize || mediaRow.filesize,
        rating: mapJellyfinRatingToMediaChips(item.communityRating),
        views: Math.max(Number(mediaRow.views) || 0, item.playCount),
        viewedAt: item.lastPlayedDate || mediaRow.viewedAt,
        oldId: itemOldId,
        mediaTypeId: videoMediaTypeId,
      })
      mediaByOldId.set(itemOldId, mediaRow.id)
      counts.mediaUpdated += 1

      if (item.duration != null || item.width != null || item.codec) {
        videoMetadataRepo.upsert({
          mediaId: mediaRow.id,
          duration: item.duration ?? 0,
          width: item.width ?? 0,
          height: item.height ?? 0,
          bitrate: item.bitrate ?? 0,
          fps: 0,
          codec: item.codec,
        })
      }

      const links: Array<{mediaId: number; tagId: number; metaId: number}> = []
      for (const personId of item.personIds) {
        const tagId = personIdMap.get(personId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.performers})
      }
      for (const genreId of item.genreIds) {
        const tagId = genreIdMap.get(genreId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.tags})
      }
      for (const studioId of item.studioIds) {
        const tagId = studioIdMap.get(studioId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.studios})
      }
      if (item.seriesId) {
        const tagId = seriesIdMap.get(item.seriesId)
        if (tagId) links.push({mediaId: mediaRow.id, tagId, metaId: metaIds.series})
      }
      if (links.length) {
        tagsInMediaRepo.bulkCreate(links)
        counts.links += links.length
      }

      counts.markers += importChapters(marksRepo, mediaRow.id, item.chapters)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      counts.errors.push(`${label}: ${message}`)
    }

    if (i % 10 === 0 || i === snapshot.items.length - 1) {
      report('items', i + 1, snapshot.items.length, label)
    }
  }

  return {...counts, ok: true}
}
