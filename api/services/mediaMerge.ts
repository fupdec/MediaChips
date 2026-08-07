import {eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {media} from '../db/schema/media'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {valuesInMedia} from '../db/schema/valuesInMedia'
import {mediaInPlaylists} from '../db/schema/mediaInPlaylists'
import {marks} from '../db/schema/marks'
import {faces} from '../db/schema/faces'
import {videoMetadata} from '../db/schema/videoMetadata'
import {imageMetadata} from '../db/schema/imageMetadata'
import {textContent} from '../db/schema/textContent'
import {nowIso} from '../db/utils/timestamps'
import {uniquePositiveIds} from '../utils/uniqueIds'
import {createMediaTypesRepository} from '../db/repositories/mediaTypes'
import type {MediaRow} from '../db/repositories/media'
import {isVirtualZipPath} from '../../shared/zipPath'
import {apiErrorMessage} from '../types/errors'
import {deleteMediaGeneratedAssets, unlinkResolvedPath} from './localAssetCleanup'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {
  foldMediaPresetFields,
  planMediaValuesToInsert,
  planNearDuplicateMarkIdsToDelete,
  remapMediaTagLinksToSurvivor,
  remapPlaylistLinksToSurvivor,
} from './mediaMergeRemap'

export class MediaMergeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'MediaMergeError'
    this.status = status
  }
}

export interface MergeMediaInput {
  survivorId: number
  sourceIds: number[]
  withFile?: boolean
}

/** Real disk paths for losers; skip empty and virtual ZIP entry paths. */
export function loserPathsToUnlink(
  losers: Array<{path?: string | null}>,
): string[] {
  const paths: string[] = []
  for (const row of losers) {
    const filePath = String(row.path || '')
    if (!filePath || isVirtualZipPath(filePath)) continue
    paths.push(filePath)
  }
  return paths
}

export async function maybeUnlinkMergedLoserFiles(
  withFile: boolean,
  losers: Array<{path?: string | null}>,
  unlink: (filePath: string) => Promise<boolean> = unlinkResolvedPath,
): Promise<void> {
  if (!withFile) return

  for (const filePath of loserPathsToUnlink(losers)) {
    try {
      const deleted = await unlink(filePath)
      if (!deleted) {
        console.log(`${filePath} is unavailable.`)
      }
    } catch (error) {
      console.error(`Failed to delete media file ${filePath}:`, apiErrorMessage(error))
    }
  }
}

export interface MergeMediaResult {
  survivor: MediaRow
  deletedIds: number[]
  migrated: {
    tagLinks: number
    values: number
    marks: number
    playlists: number
  }
}

type MergeTx = Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0]

export function mergeMediaItemsTx(
  tx: MergeTx,
  input: MergeMediaInput,
): MergeMediaResult {
  const survivorId = Number(input.survivorId)
  const sourceIds = uniquePositiveIds(input.sourceIds).filter((id) => id !== survivorId)

  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new MediaMergeError('survivorId is required')
  }
  if (!sourceIds.length) {
    throw new MediaMergeError('At least one source media item is required')
  }

  const allIds = [survivorId, ...sourceIds]
  const mediaRows = tx.select().from(media).where(inArray(media.id, allIds)).all()
  if (mediaRows.length !== allIds.length) {
    throw new MediaMergeError('One or more media items were not found', 404)
  }

  const mediaTypeId = Number(mediaRows[0]?.mediaTypeId)
  if (!Number.isFinite(mediaTypeId) || mediaTypeId <= 0) {
    throw new MediaMergeError('Media type is required')
  }
  for (const row of mediaRows) {
    if (Number(row.mediaTypeId) !== mediaTypeId) {
      throw new MediaMergeError('All media items must belong to the same media type')
    }
  }

  const survivor = mediaRows.find((row) => row.id === survivorId)!
  const sources = mediaRows.filter((row) => row.id !== survivorId)
  const migrated = {
    tagLinks: 0,
    values: 0,
    marks: 0,
    playlists: 0,
  }

  // tagsInMedia: union onto survivor
  const tagLinks = tx.select()
    .from(tagsInMedia)
    .where(inArray(tagsInMedia.mediaId, sourceIds))
    .all()

  if (tagLinks.length) {
    const rows = remapMediaTagLinksToSurvivor(tagLinks, survivorId)
    const inserted = tx.insert(tagsInMedia)
      .values(rows)
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.tagLinks = inserted.length || rows.length
    tx.delete(tagsInMedia).where(inArray(tagsInMedia.mediaId, sourceIds)).run()
  }

  // valuesInMedia: survivor wins; copy missing metaIds only
  const survivorValues = tx.select()
    .from(valuesInMedia)
    .where(eq(valuesInMedia.mediaId, survivorId))
    .all()
  const survivorMetaIds = new Set(survivorValues.map((row) => row.metaId))

  const sourceValues = tx.select()
    .from(valuesInMedia)
    .where(inArray(valuesInMedia.mediaId, sourceIds))
    .all()

  const valuesToInsert = planMediaValuesToInsert(sourceValues, survivorId, survivorMetaIds)
  if (valuesToInsert.length) {
    const inserted = tx.insert(valuesInMedia)
      .values(valuesToInsert)
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.values = inserted.length
  }
  tx.delete(valuesInMedia).where(inArray(valuesInMedia.mediaId, sourceIds)).run()

  // mediaInPlaylists
  const playlistLinks = tx.select()
    .from(mediaInPlaylists)
    .where(inArray(mediaInPlaylists.mediaId, sourceIds))
    .all()

  if (playlistLinks.length) {
    const rows = remapPlaylistLinksToSurvivor(playlistLinks, survivorId)
    const inserted = tx.insert(mediaInPlaylists)
      .values(rows)
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.playlists = inserted.length || rows.length
    tx.delete(mediaInPlaylists).where(inArray(mediaInPlaylists.mediaId, sourceIds)).run()
  }

  // marks: move to survivor (thumbs keyed by mark id), then collapse near-duplicates
  const markUpdate = tx.update(marks)
    .set({mediaId: survivorId})
    .where(inArray(marks.mediaId, sourceIds))
    .run()
  migrated.marks = Number(markUpdate.changes ?? 0)

  const survivorMarks = tx.select().from(marks).where(eq(marks.mediaId, survivorId)).all()
  const duplicateMarkIds = planNearDuplicateMarkIdsToDelete(survivorMarks)
  if (duplicateMarkIds.length) {
    tx.delete(marks).where(inArray(marks.id, duplicateMarkIds)).run()
  }

  // Remap loser faces onto the survivor instead of discarding them
  tx.update(faces)
    .set({mediaId: survivorId})
    .where(inArray(faces.mediaId, sourceIds))
    .run()

  // Drop loser-only rows that are not remapped
  tx.delete(videoMetadata).where(inArray(videoMetadata.mediaId, sourceIds)).run()
  tx.delete(imageMetadata).where(inArray(imageMetadata.mediaId, sourceIds)).run()
  tx.delete(textContent).where(inArray(textContent.mediaId, sourceIds)).run()

  const folded = foldMediaPresetFields(survivor, sources)
  tx.update(media)
    .set({
      favorite: folded.favorite,
      rating: folded.rating,
      views: folded.views,
      viewedAt: folded.viewedAt,
      bookmark: folded.bookmark,
      createdAt: folded.createdAt,
      updatedAt: nowIso(),
    })
    .where(eq(media.id, survivorId))
    .run()

  tx.delete(media).where(inArray(media.id, sourceIds)).run()

  const updatedSurvivor = tx.select().from(media).where(eq(media.id, survivorId)).get()!
  return {
    survivor: updatedSurvivor,
    deletedIds: sourceIds,
    migrated,
  }
}

export async function mergeMediaItems(
  db: ApiDb,
  input: MergeMediaInput,
): Promise<MergeMediaResult> {
  const survivorId = Number(input.survivorId)
  const sourceIds = uniquePositiveIds(input.sourceIds).filter((id) => id !== survivorId)

  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new MediaMergeError('survivorId is required')
  }
  if (!sourceIds.length) {
    throw new MediaMergeError('At least one source media item is required')
  }

  const losers = db.drizzle.select().from(media).where(inArray(media.id, sourceIds)).all()
  const mediaTypesRepo = createMediaTypesRepository(db.drizzle)

  const result = db.drizzle.transaction((tx) =>
    mergeMediaItemsTx(tx, {survivorId, sourceIds}),
  )

  if (db.path) {
    await Promise.all(losers.map(async (row) => {
      const mediaType = row.mediaTypeId
        ? mediaTypesRepo.findById(Number(row.mediaTypeId))
        : undefined
      await deleteMediaGeneratedAssets(db, db.path!, row, mediaType?.type || '')
    }))
  }

  await maybeUnlinkMergedLoserFiles(Boolean(input.withFile), losers)

  invalidateMediaDerivedCaches()
  return result
}
