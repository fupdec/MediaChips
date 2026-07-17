import type { ApiDb, AnyRecord } from '../types/db'
import type {
  LowDbImportObject,
  LowDbTagsByMetaId,
  OldIdMapping,
  SettingOptionRow,
} from '../types/migration'
import { createMediaRepository } from '../db/repositories/media'
import { createVideoMetadataRepository } from '../db/repositories/videoMetadata'
import { createSettingsRepository } from '../db/repositories/settings'
import { createMetaRepository } from '../db/repositories/meta'
import { createTagsRepository } from '../db/repositories/tags'
import { createMetaInMediaTypesRepository } from '../db/repositories/metaInMediaTypes'
import { createPlaylistsRepository } from '../db/repositories/playlists'
import { createMediaInPlaylistsRepository } from '../db/repositories/mediaInPlaylists'
import { createMarksRepository } from '../db/repositories/marks'
import { createTagsInMediaRepository } from '../db/repositories/tagsInMedia'
import { createValuesInMediaRepository } from '../db/repositories/valuesInMedia'
import { createPinnedMetaRepository } from '../db/repositories/pinnedMeta'
import { createTagsInTagRepository } from '../db/repositories/tagsInTag'
import { createValuesInTagRepository } from '../db/repositories/valuesInTag'
import { createWatchedFoldersRepository } from '../db/repositories/watchedFolders'
import { createMediaTypesInWatchedFoldersRepository } from '../db/repositories/mediaTypesInWatchedFolders'
import { loadDefaultSettingsList } from '../utils/defaultSettings'

function sameOldId(a: unknown, b: unknown): boolean {
  const normalize = (value: unknown): string => {
    if (value == null || value === '') return ''
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Number.isInteger(value) ? String(value) : String(value)
    }
    const raw = String(value)
    return /^\d+\.0+$/.test(raw) ? String(Number.parseInt(raw, 10)) : raw
  }
  return normalize(a) === normalize(b)
}

async function importLowDbData(db: ApiDb, obj: LowDbImportObject) {
  const mediaRepo = createMediaRepository(db.drizzle)
  const videoMetadataRepo = createVideoMetadataRepository(db.drizzle)
  const settingsRepo = createSettingsRepository(db.drizzle)
  const metaRepo = createMetaRepository(db.drizzle)
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const playlistsRepo = createPlaylistsRepository(db.drizzle)
  const mediaInPlaylistsRepo = createMediaInPlaylistsRepository(db.drizzle)
  const marksRepo = createMarksRepository(db.drizzle)
  const tagsInMediaRepo = createTagsInMediaRepository(db.drizzle)
  const valuesInMediaRepo = createValuesInMediaRepository(db.drizzle)
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)
  const tagsInTagRepo = createTagsInTagRepository(db.drizzle)
  const valuesInTagRepo = createValuesInTagRepository(db.drizzle)
  const watchedFoldersRepo = createWatchedFoldersRepository(db.drizzle)
  const mediaTypesInWatchedFoldersRepo = createMediaTypesInWatchedFoldersRepository(db.drizzle)

  mediaRepo.bulkCreate(obj.videos)
  const mediaIds: OldIdMapping[] = mediaRepo.findOldIdMappings()

  const videoMetadata = obj.videoMetadata
    .map((video: AnyRecord) => {
      const media = mediaIds.find((x) => sameOldId(x.oldId, video.oldId))
      if (!media) return null
      return {
        mediaId: media.id,
        duration: video.duration,
        width: video.width,
        height: video.height,
      }
    })
    .filter(Boolean)

  videoMetadataRepo.bulkCreate(videoMetadata as Parameters<typeof videoMetadataRepo.bulkCreate>[0])

  const settings = obj.settings
  const settingsList = loadDefaultSettingsList()
  const allowed = settingsList.map((i: SettingOptionRow) => i.option)
  const filteredOptions = Object.keys(settings)
    .filter((key: string) => allowed.includes(key))
    .reduce((acc: Record<string, unknown>, key: string) => {
      acc[key] = settings[key]
      return acc
    }, {})

  settingsRepo.bulkUpsertByOptions(
    Object.entries(filteredOptions).map(([option, value]) => ({option, value})),
  )

  for (const m of obj.meta) {
    try {
      const cm = metaRepo.create(m)
      if (cm.type === 'array') {
        metaRepo.ensureArrayMetaResources(cm.id)
      }
    } catch (e: unknown) {
      console.log(e)
    }
  }

  const metaIds = metaRepo.findOldIdMappings() as OldIdMapping[]

  for (const tags of obj.tags) {
    for (const i in tags) {
      const meta = metaIds.find((x) => sameOldId(x.oldId, i))
      if (!meta) continue

      const newTags = (tags as LowDbTagsByMetaId)[i].map((it: AnyRecord) => ({
        ...it,
        metaId: meta.id,
      }))
      tagsRepo.bulkCreate(newTags as Parameters<typeof tagsRepo.bulkCreate>[0])
    }
  }

  const tagsIds = tagsRepo.findOldIdMappings() as OldIdMapping[]

  const assignedMeta = Array.isArray(obj.settings.metaAssignedToVideos)
    ? obj.settings.metaAssignedToVideos as Array<{ id: unknown }>
    : []
  for (const i of assignedMeta) {
    const meta = metaIds.find((x) => sameOldId(x.oldId, i.id))
    if (!meta) continue
    metaInMediaTypesRepo.create({
      mediaTypeId: 1,
      metaId: Number(meta.id),
    })
  }

  playlistsRepo.bulkCreate(obj.playlists)

  for (const playlist of obj.playlists) {
    const p = playlistsRepo.findByOldId(playlist.oldId)
    if (!p) continue

    const playlistVideos = Array.isArray(playlist.videos) ? playlist.videos : []
    for (const videoOldId of playlistVideos) {
      const media = mediaIds.find((x) => sameOldId(x.oldId, videoOldId))
      if (!media) continue

      mediaInPlaylistsRepo.create({
        playlistId: p.id,
        mediaId: Number(media.id),
        order: playlistVideos.indexOf(videoOldId),
      })
    }
  }

  const marks: AnyRecord[] = []
  for (const mark of obj.marks) {
    const found = mediaIds.find((x) => sameOldId(x.oldId, mark.videoId))
    if (!found) continue

    const nextMark: AnyRecord = {...mark, mediaId: found.id}
    if (nextMark.type === 'favorite' && nextMark.text === '') nextMark.text = null
    else if (nextMark.type === 'meta') {
      const foundTag = tagsIds.find((x) => sameOldId(x.oldId, nextMark.oldTagId))
      if (!foundTag) continue
      nextMark.tagId = foundTag.id
    }
    marks.push(nextMark)
  }
  marksRepo.bulkCreate(marks)

  const tagsInMedia: AnyRecord[] = []
  const valuesInMedia: AnyRecord[] = []
  for (const videoMeta of obj.onlyMeta) {
    const mVideo = mediaIds.find((x) => sameOldId(x.oldId, videoMeta.id))
    if (!mVideo) continue

    const onlyMetaFields = Object.fromEntries(
      Object.entries(videoMeta).filter(([key]) => !key.includes('id')),
    )

    for (const fieldName in onlyMetaFields) {
      const m = metaIds.find((x) => sameOldId(x.oldId, fieldName))
      if (!m) continue

      const val = onlyMetaFields[fieldName]
      if (m.type === 'array') {
        const tagOldIds = Array.isArray(val) ? val : []
        for (const tag of tagOldIds) {
          const metaTag = tagsIds.find((x) => sameOldId(x.oldId, tag))
          if (!metaTag) continue
          tagsInMedia.push({
            metaId: m.id,
            mediaId: mVideo.id,
            tagId: metaTag.id,
          })
        }
      } else if (val !== null && val !== '' && val !== 0 && val !== '0') {
        valuesInMedia.push({
          value: String(val),
          metaId: m.id,
          mediaId: mVideo.id,
        })
      }
    }
  }

  if (tagsInMedia.length) tagsInMediaRepo.bulkCreate(tagsInMedia as Parameters<typeof tagsInMediaRepo.bulkCreate>[0])
  if (valuesInMedia.length) valuesInMediaRepo.bulkCreate(valuesInMedia as Parameters<typeof valuesInMediaRepo.bulkCreate>[0])

  const pinnedMeta: AnyRecord[] = []
  for (const c of obj.pinnedMeta) {
    const meta = metaIds.find((x) => sameOldId(x.oldId, c.metaId))
    if (!meta) continue

    for (const id of (c.pinnedMetaId as unknown[])) {
      const child = metaIds.find((x) => sameOldId(x.oldId, id))
      if (!child) continue

      pinnedMeta.push({
        metaId: meta.id,
        pinnedMetaId: child.id,
        scraper: null,
      })
    }
  }
  pinnedMetaRepo.bulkCreate(pinnedMeta as Parameters<typeof pinnedMetaRepo.bulkCreate>[0])

  const tagsInTag: AnyRecord[] = []
  const valuesInTag: AnyRecord[] = []
  for (const card of obj.metaInTags) {
    for (const cardId in card) {
      const metaTag = tagsIds.find((x) => sameOldId(x.oldId, cardId))
      if (!metaTag) continue

      for (const key in (card as Record<string, Record<string, unknown>>)[cardId]) {
        const metaOfTag = metaIds.find((x) => sameOldId(x.oldId, key))
        if (!metaOfTag) continue

        const val = (card as Record<string, Record<string, unknown>>)[cardId][key]
        if (metaOfTag.type === 'array') {
          const tagOldIds = Array.isArray(val) ? val : []
          for (const tagOldId of tagOldIds) {
            const tag = tagsIds.find((x) => sameOldId(x.oldId, tagOldId))
            if (tag) {
              tagsInTag.push({
                parentTagId: metaTag.id,
                tagId: tag.id,
                metaId: metaOfTag.id,
              })
            }
          }
        } else if (val !== null && val !== '' && val !== 0 && val !== '0') {
          valuesInTag.push({
            value: String(val),
            metaId: metaOfTag.id,
            tagId: metaTag.id,
          })
        }
      }
    }
  }

  if (tagsInTag.length) tagsInTagRepo.bulkCreate(tagsInTag as Parameters<typeof tagsInTagRepo.bulkCreate>[0])
  if (valuesInTag.length) valuesInTagRepo.bulkCreate(valuesInTag as Parameters<typeof valuesInTagRepo.bulkCreate>[0])

  for (const folder of obj.watchedFolders) {
    const {folder: folderRow} = watchedFoldersRepo.findOrCreateByPath(
      String(folder.path ?? ''),
      folder.name != null ? String(folder.name) : null,
    )
    watchedFoldersRepo.updateById(folderRow.id, {watch: Boolean(folder.watch)})
    mediaTypesInWatchedFoldersRepo.findOrCreate(folderRow.id, 1)
  }

  return {
    mediaIds,
    metaIds,
    tagsIds,
  }
}

export { importLowDbData }
