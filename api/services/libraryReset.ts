import fs from 'fs'
import path from 'path'
import type {ApiDb} from '../types/db'
import {queryAll} from '../db/utils/rawQuery'
import {createMediaRepository} from '../db/repositories/media'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import {createMarksRepository} from '../db/repositories/marks'
import {createMetaRepository} from '../db/repositories/meta'
import {createMetaInMediaTypesRepository} from '../db/repositories/metaInMediaTypes'
import {createPinnedMetaRepository} from '../db/repositories/pinnedMeta'
import {createTagsRepository} from '../db/repositories/tags'
import {
  deleteMediaGeneratedAssets,
  deleteTagGeneratedAssets,
  unlinkResolvedPath,
} from './localAssetCleanup'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {softDeleteMedia} from './mediaTrash'
import {softDeleteTag} from './entityTrash'
import {MEDIA_NOT_IN_TRASH_SQL} from '../../shared/mediaTrash'
import {notInTrashSql} from '../../shared/entityTrash'
import {isVirtualZipPath} from '../../shared/zipPath'
import type {LibraryResetCounts, LibraryResetStreamEvent} from '@shared/api/payloads'

const YIELD_EVERY = 25
const TAGS_NOT_IN_TRASH_SQL = notInTrashSql('tags')

export type LibraryResetMediaOptions = {
  mediaTypeId: number | 'all'
  permanent?: boolean
  withFile?: boolean
}

export type LibraryResetTagsOptions = {
  metaId: number | 'all'
  permanent?: boolean
}

type MediaResetRow = {
  id: number
  path: string | null
  basename: string | null
  name: string | null
  mediaTypeId: number | null
  trashOriginalPath: string | null
  trashPurgeFile: number | boolean | null
  deletedAt: string | null
}

type TagResetRow = {
  id: number
  metaId: number | null
  name: string | null
  trashOriginalName: string | null
  deletedAt: string | null
}

function asPositiveId(value: unknown): number | null {
  const id = Number(value)
  return Number.isFinite(id) && id > 0 ? id : null
}

function rowLabel(row: {name?: string | null; basename?: string | null}): string {
  return String(row.name || row.basename || '').trim()
}

async function* yieldProgress(
  event: LibraryResetStreamEvent,
  processed: number,
): AsyncGenerator<LibraryResetStreamEvent> {
  if (processed === 0 || processed % YIELD_EVERY === 0) {
    yield event
  }
}

function listMediaForReset(
  db: ApiDb,
  mediaTypeId: number | 'all',
  includeTrashed: boolean,
): MediaResetRow[] {
  const typeClause = mediaTypeId === 'all' ? '1=1' : 'media.mediaTypeId = :mediaTypeId'
  const trashClause = includeTrashed ? '1=1' : MEDIA_NOT_IN_TRASH_SQL
  return queryAll<MediaResetRow>(db, `
    SELECT id, path, basename, name, mediaTypeId, trashOriginalPath, trashPurgeFile, deletedAt
    FROM media
    WHERE ${typeClause} AND ${trashClause}
    ORDER BY id
  `, mediaTypeId === 'all' ? {} : {mediaTypeId})
}

function listTagsForReset(
  db: ApiDb,
  metaIds: number[] | 'all',
  includeTrashed: boolean,
): TagResetRow[] {
  const metaClause = metaIds === 'all'
    ? '1=1'
    : (metaIds.length ? 'tags.metaId IN (:metaIds)' : '0=1')
  const trashClause = includeTrashed ? '1=1' : TAGS_NOT_IN_TRASH_SQL
  return queryAll<TagResetRow>(db, `
    SELECT id, metaId, name, trashOriginalName, deletedAt
    FROM tags
    WHERE ${metaClause} AND ${trashClause}
    ORDER BY id
  `, metaIds === 'all' || !metaIds.length ? {} : {metaIds})
}

async function hardDeleteMediaRow(
  db: ApiDb,
  row: MediaResetRow,
  options: {withFile?: boolean; mediaType?: string},
): Promise<void> {
  const mediaRepo = createMediaRepository(db.drizzle)
  const dbPath = db.path || ''

  await deleteMediaGeneratedAssets(db, dbPath, {id: row.id}, options.mediaType || '')

  const purgePath = String(row.trashOriginalPath || row.path || '')
  const shouldUnlink = Boolean(options.withFile || row.trashPurgeFile)
    && Boolean(purgePath)
    && !isVirtualZipPath(purgePath)

  if (shouldUnlink) {
    try {
      await unlinkResolvedPath(purgePath)
    } catch (error) {
      console.error(`Failed to delete media file ${purgePath}:`, error)
    }
  }

  mediaRepo.deleteById(row.id)
}

async function hardDeleteTagRow(
  db: ApiDb,
  row: TagResetRow,
): Promise<void> {
  const tagsRepo = createTagsRepository(db.drizzle, db.sqlite)
  const marksRepo = createMarksRepository(db.drizzle)
  const displayName = String(row.trashOriginalName || row.name || '').trim()
  marksRepo.convertMetaMarksToBookmarksByTagId(row.id, displayName)
  if (row.metaId) {
    await deleteTagGeneratedAssets(db.path || '', row.metaId, row.id)
  }
  tagsRepo.deleteById(row.id)
}

function deleteCategoryMeta(db: ApiDb, metaId: number): void {
  const metaRepo = createMetaRepository(db.drizzle)
  const metaInMediaTypesRepo = createMetaInMediaTypesRepository(db.drizzle)
  const pinnedMetaRepo = createPinnedMetaRepository(db.drizzle)

  metaInMediaTypesRepo.deleteByMetaId(metaId)
  pinnedMetaRepo.deleteByMetaId(metaId)
  metaRepo.deleteById(metaId)

  const dbPath = String(db.path || '')
  if (!dbPath) return

  const dir = path.join(dbPath, 'meta', String(metaId))
  try {
    if (!fs.existsSync(dir) || !fs.lstatSync(dir).isDirectory()) return
    fs.rmSync(dir, {recursive: true, force: true})
  } catch (error) {
    console.error(`Failed to remove meta folder ${dir}:`, error)
  }
}

export function getLibraryResetCounts(db: ApiDb): LibraryResetCounts {
  const mediaRows = queryAll<{mediaTypeId: number | null; count: number}>(db, `
    SELECT mediaTypeId, COUNT(*) AS count
    FROM media
    WHERE ${MEDIA_NOT_IN_TRASH_SQL}
    GROUP BY mediaTypeId
  `)
  const tagRows = queryAll<{metaId: number | null; count: number}>(db, `
    SELECT metaId, COUNT(*) AS count
    FROM tags
    WHERE ${TAGS_NOT_IN_TRASH_SQL}
    GROUP BY metaId
  `)

  const mediaByType: Record<number, number> = {}
  let mediaTotal = 0
  for (const row of mediaRows) {
    const count = Number(row.count) || 0
    mediaTotal += count
    const id = Number(row.mediaTypeId)
    if (Number.isFinite(id) && id > 0) mediaByType[id] = count
  }

  const tagsByMeta: Record<number, number> = {}
  let tagsTotal = 0
  for (const row of tagRows) {
    const count = Number(row.count) || 0
    tagsTotal += count
    const id = Number(row.metaId)
    if (Number.isFinite(id) && id > 0) tagsByMeta[id] = count
  }

  return {mediaByType, mediaTotal, tagsByMeta, tagsTotal}
}

export async function* iterateLibraryResetMedia(
  db: ApiDb,
  options: LibraryResetMediaOptions,
  shouldStop: () => boolean = () => false,
): AsyncGenerator<LibraryResetStreamEvent> {
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)
  const permanent = Boolean(options.permanent)
  const withFile = Boolean(options.withFile)

  if (options.mediaTypeId !== 'all') {
    const mediaTypeId = asPositiveId(options.mediaTypeId)
    if (!mediaTypeId || !mediaTypesRepo.findById(mediaTypeId)) {
      throw new Error('Media type not found.')
    }
  }

  const rows = listMediaForReset(db, options.mediaTypeId, permanent)
  const total = rows.length
  let processed = 0
  let deleted = 0
  let failed = 0

  yield {type: 'progress', processed: 0, total, deleted: 0, failed: 0}

  const typeCache = new Map<number, string>()

  for (const row of rows) {
    if (shouldStop()) {
      invalidateMediaDerivedCaches()
      yield {
        type: 'complete',
        processed,
        total,
        deleted,
        failed,
        mediaDeleted: deleted,
        stopped: true,
      }
      return
    }

    try {
      if (permanent) {
        let mediaType = ''
        const typeId = asPositiveId(row.mediaTypeId)
        if (typeId) {
          if (!typeCache.has(typeId)) {
            typeCache.set(typeId, mediaTypesRepo.findById(typeId)?.type || '')
          }
          mediaType = typeCache.get(typeId) || ''
        }
        await hardDeleteMediaRow(db, row, {withFile, mediaType})
      } else {
        softDeleteMedia(db, row.id, {purgeFile: withFile})
      }
      deleted += 1
    } catch (error) {
      failed += 1
      console.error(`Library reset failed for media ${row.id}:`, error)
    }

    processed += 1
    yield* yieldProgress({
      type: 'progress',
      processed,
      total,
      deleted,
      failed,
      current: rowLabel(row),
    }, processed)
  }

  invalidateMediaDerivedCaches()
  yield {
    type: 'complete',
    processed,
    total,
    deleted,
    failed,
    mediaDeleted: deleted,
    stopped: false,
  }
}

export async function* iterateLibraryResetTags(
  db: ApiDb,
  options: LibraryResetTagsOptions,
  shouldStop: () => boolean = () => false,
): AsyncGenerator<LibraryResetStreamEvent> {
  const metaRepo = createMetaRepository(db.drizzle)
  const permanent = Boolean(options.permanent)

  let categoryIds: number[]
  let tagMetaFilter: number[] | 'all'

  if (options.metaId === 'all') {
    categoryIds = metaRepo.findArrayIds().map((row) => row.id)
    tagMetaFilter = 'all'
  } else {
    const metaId = asPositiveId(options.metaId)
    const meta = metaId ? metaRepo.findById(metaId) : undefined
    if (!metaId || !meta || meta.type !== 'array') {
      throw new Error('Tag category not found.')
    }
    categoryIds = [metaId]
    tagMetaFilter = [metaId]
  }

  const tagRows = listTagsForReset(db, tagMetaFilter, permanent)
  const total = tagRows.length + categoryIds.length
  let processed = 0
  let tagsDeleted = 0
  let metaDeleted = 0
  let failed = 0

  yield {type: 'progress', processed: 0, total, deleted: 0, failed: 0}

  for (const row of tagRows) {
    if (shouldStop()) {
      yield {
        type: 'complete',
        processed,
        total,
        deleted: tagsDeleted + metaDeleted,
        failed,
        tagsDeleted,
        metaDeleted,
        stopped: true,
      }
      return
    }

    try {
      if (permanent) {
        await hardDeleteTagRow(db, row)
      } else {
        softDeleteTag(db, row.id)
      }
      tagsDeleted += 1
    } catch (error) {
      failed += 1
      console.error(`Library reset failed for tag ${row.id}:`, error)
    }

    processed += 1
    yield* yieldProgress({
      type: 'progress',
      processed,
      total,
      deleted: tagsDeleted + metaDeleted,
      failed,
      current: rowLabel(row),
    }, processed)
  }

  for (const metaId of categoryIds) {
    if (shouldStop()) {
      yield {
        type: 'complete',
        processed,
        total,
        deleted: tagsDeleted + metaDeleted,
        failed,
        tagsDeleted,
        metaDeleted,
        stopped: true,
      }
      return
    }

    try {
      deleteCategoryMeta(db, metaId)
      metaDeleted += 1
    } catch (error) {
      failed += 1
      console.error(`Library reset failed for category ${metaId}:`, error)
    }

    processed += 1
    yield* yieldProgress({
      type: 'progress',
      processed,
      total,
      deleted: tagsDeleted + metaDeleted,
      failed,
    }, processed)
  }

  yield {
    type: 'complete',
    processed,
    total,
    deleted: tagsDeleted + metaDeleted,
    failed,
    tagsDeleted,
    metaDeleted,
    stopped: false,
  }
}
