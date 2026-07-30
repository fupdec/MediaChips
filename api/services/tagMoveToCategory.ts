import fs from 'fs'
import path from 'path'
import {and, eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {media} from '../db/schema/media'
import {mediaTypes} from '../db/schema/mediaTypes'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInFolders} from '../db/schema/folderPaths'
import {tagsInTags} from '../db/schema/tagsInTag'
import {tagsInFilterRows} from '../db/schema/tagsInFilterRows'
import {nowIso} from '../db/utils/timestamps'
import {deleteTagGeneratedAssets} from './localAssetCleanup'
import {mergeTagsInCategoryTx} from './tagMerge'
import type {TagRow} from '../db/repositories/tags'

export interface TagNameConflict {
  tagId: number
  name: string
  existingTagId: number
}

export interface UnassignedMediaTypeInfo {
  id: number
  name: string
}

export class TagMoveToCategoryError extends Error {
  status: number
  code?: string
  conflicts?: TagNameConflict[]
  unassignedMediaTypes?: UnassignedMediaTypeInfo[]

  constructor(
    message: string,
    status = 400,
    extras?: {
      code?: string
      conflicts?: TagNameConflict[]
      unassignedMediaTypes?: UnassignedMediaTypeInfo[]
    },
  ) {
    super(message)
    this.name = 'TagMoveToCategoryError'
    this.status = status
    this.code = extras?.code
    this.conflicts = extras?.conflicts
    this.unassignedMediaTypes = extras?.unassignedMediaTypes
  }
}

export type TagNameConflictScope = 'category' | 'global'

export type TagMoveOnConflict = 'merge' | 'abort'

export interface MoveTagsToCategoryInput {
  tagIds: number[]
  targetMetaId: number
  onConflict: TagMoveOnConflict
}

export interface MoveTagsToCategoryResult {
  movedIds: number[]
  mergedIds: number[]
  targetMetaId: number
  survivors: TagRow[]
}

type MoveTx = Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0]

export function normalizeTagName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

function uniquePositiveIds(ids: unknown[]): number[] {
  const seen = new Set<number>()
  const result: number[] = []
  for (const raw of ids) {
    const id = Number(raw)
    if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

function uniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(keyFn(item), item)
  return [...map.values()]
}

/**
 * Find tags that would collide by normalized name.
 *
 * TODO(global-tag-names): switch call sites to scope:'global', migrate
 * cross-category duplicates, then add a UNIQUE constraint on normalized name.
 */
export function findTagNameConflicts(
  tx: MoveTx,
  opts: {
    candidates: Array<{tagId: number; name: string}>
    excludeTagIds?: number[]
    scope: TagNameConflictScope
    metaId?: number
  },
): TagNameConflict[] {
  const exclude = new Set(opts.excludeTagIds ?? [])
  const candidateKeys = opts.candidates
    .map((row) => ({
      tagId: row.tagId,
      name: row.name,
      key: normalizeTagName(row.name),
    }))
    .filter((row) => row.key.length > 0)

  if (!candidateKeys.length) return []

  let existingRows: Array<{id: number; name: string | null}>
  if (opts.scope === 'category') {
    const metaId = Number(opts.metaId)
    if (!Number.isFinite(metaId) || metaId <= 0) {
      throw new TagMoveToCategoryError('metaId is required for category scope')
    }
    existingRows = tx.select({id: tags.id, name: tags.name})
      .from(tags)
      .where(eq(tags.metaId, metaId))
      .all()
  } else {
    existingRows = tx.select({id: tags.id, name: tags.name}).from(tags).all()
  }

  const byName = new Map<string, number>()
  for (const row of existingRows) {
    if (exclude.has(row.id)) continue
    const key = normalizeTagName(row.name)
    if (!key || byName.has(key)) continue
    byName.set(key, row.id)
  }

  const conflicts: TagNameConflict[] = []
  const seen = new Set<number>()
  for (const candidate of candidateKeys) {
    if (seen.has(candidate.tagId)) continue
    const existingTagId = byName.get(candidate.key)
    if (!existingTagId || existingTagId === candidate.tagId) continue
    seen.add(candidate.tagId)
    conflicts.push({
      tagId: candidate.tagId,
      name: candidate.name,
      existingTagId,
    })
  }
  return conflicts
}

/**
 * Media types that already use these tags but do not have the target category assigned.
 */
export function findUnassignedMediaTypesForTags(
  tx: MoveTx,
  tagIds: number[],
  targetMetaId: number,
): UnassignedMediaTypeInfo[] {
  if (!tagIds.length) return []

  const links = tx.select({mediaId: tagsInMedia.mediaId})
    .from(tagsInMedia)
    .where(inArray(tagsInMedia.tagId, tagIds))
    .all()
  const mediaIds = uniquePositiveIds(links.map((row) => row.mediaId))
  if (!mediaIds.length) return []

  const mediaRows = tx.select({mediaTypeId: media.mediaTypeId})
    .from(media)
    .where(inArray(media.id, mediaIds))
    .all()
  const mediaTypeIds = uniquePositiveIds(mediaRows.map((row) => row.mediaTypeId))
  if (!mediaTypeIds.length) return []

  const assigned = tx.select({mediaTypeId: metaInMediaTypes.mediaTypeId})
    .from(metaInMediaTypes)
    .where(and(
      eq(metaInMediaTypes.metaId, targetMetaId),
      inArray(metaInMediaTypes.mediaTypeId, mediaTypeIds),
    ))
    .all()
  const assignedSet = new Set(assigned.map((row) => Number(row.mediaTypeId)))
  const missingIds = mediaTypeIds.filter((id) => !assignedSet.has(id))
  if (!missingIds.length) return []

  const typeRows = tx.select({id: mediaTypes.id, name: mediaTypes.name})
    .from(mediaTypes)
    .where(inArray(mediaTypes.id, missingIds))
    .all()

  return typeRows.map((row) => ({
    id: row.id,
    name: String(row.name ?? '').trim() || `Media type ${row.id}`,
  }))
}

function remapLinksForTags(
  tx: MoveTx,
  tagIds: number[],
  sourceMetaId: number,
  targetMetaId: number,
) {
  if (!tagIds.length || sourceMetaId === targetMetaId) return

  const mediaLinks = tx.select()
    .from(tagsInMedia)
    .where(and(
      inArray(tagsInMedia.tagId, tagIds),
      eq(tagsInMedia.metaId, sourceMetaId),
    ))
    .all()
  if (mediaLinks.length) {
    const remapped = uniqueByKey(
      mediaLinks.map((row) => ({
        mediaId: row.mediaId,
        tagId: row.tagId,
        metaId: targetMetaId,
      })),
      (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
    )
    tx.insert(tagsInMedia).values(remapped).onConflictDoNothing().run()
    tx.delete(tagsInMedia)
      .where(and(
        inArray(tagsInMedia.tagId, tagIds),
        eq(tagsInMedia.metaId, sourceMetaId),
      ))
      .run()
  }

  const folderLinks = tx.select()
    .from(tagsInFolders)
    .where(and(
      inArray(tagsInFolders.tagId, tagIds),
      eq(tagsInFolders.metaId, sourceMetaId),
    ))
    .all()
  if (folderLinks.length) {
    const remapped = uniqueByKey(
      folderLinks.map((row) => ({
        folderId: row.folderId,
        tagId: row.tagId,
        metaId: targetMetaId,
      })),
      (row) => `${row.folderId}:${row.tagId}:${row.metaId}`,
    )
    tx.insert(tagsInFolders).values(remapped).onConflictDoNothing().run()
    tx.delete(tagsInFolders)
      .where(and(
        inArray(tagsInFolders.tagId, tagIds),
        eq(tagsInFolders.metaId, sourceMetaId),
      ))
      .run()
  }

  const nestedAsChild = tx.select()
    .from(tagsInTags)
    .where(and(
      inArray(tagsInTags.tagId, tagIds),
      eq(tagsInTags.metaId, sourceMetaId),
    ))
    .all()
  if (nestedAsChild.length) {
    const remapped = uniqueByKey(
      nestedAsChild.map((row) => ({
        parentTagId: row.parentTagId,
        tagId: row.tagId,
        metaId: targetMetaId,
      })),
      (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
    )
    tx.insert(tagsInTags).values(remapped).onConflictDoNothing().run()
    tx.delete(tagsInTags)
      .where(and(
        inArray(tagsInTags.tagId, tagIds),
        eq(tagsInTags.metaId, sourceMetaId),
      ))
      .run()
  }

  const filterLinks = tx.select()
    .from(tagsInFilterRows)
    .where(and(
      inArray(tagsInFilterRows.tagId, tagIds),
      eq(tagsInFilterRows.metaId, sourceMetaId),
    ))
    .all()
  if (filterLinks.length) {
    const remapped = uniqueByKey(
      filterLinks.map((row) => ({
        tagId: row.tagId,
        rowId: row.rowId,
        metaId: targetMetaId,
      })),
      (row) => `${row.tagId}:${row.rowId}:${row.metaId}`,
    )
    tx.insert(tagsInFilterRows).values(remapped).onConflictDoNothing().run()
    tx.delete(tagsInFilterRows)
      .where(and(
        inArray(tagsInFilterRows.tagId, tagIds),
        eq(tagsInFilterRows.metaId, sourceMetaId),
      ))
      .run()
  }
}

function moveTagMetaId(
  tx: MoveTx,
  tagIds: number[],
  sourceMetaId: number,
  targetMetaId: number,
) {
  if (!tagIds.length) return
  remapLinksForTags(tx, tagIds, sourceMetaId, targetMetaId)
  tx.update(tags)
    .set({metaId: targetMetaId, updatedAt: nowIso()})
    .where(and(
      inArray(tags.id, tagIds),
      eq(tags.metaId, sourceMetaId),
    ))
    .run()
}

async function moveTagAssetsBetweenCategories(
  dbPath: string,
  sourceMetaId: number,
  targetMetaId: number,
  tagIds: number[],
) {
  if (!tagIds.length || sourceMetaId === targetMetaId) return
  const sourceDir = path.join(dbPath, 'meta', String(sourceMetaId))
  const targetDir = path.join(dbPath, 'meta', String(targetMetaId))
  if (!fs.existsSync(sourceDir)) return
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, {recursive: true})

  const files = await fs.promises.readdir(sourceDir)
  const prefixes = tagIds.map((id) => `${id}_`)

  for (const file of files) {
    if (!prefixes.some((prefix) => file.startsWith(prefix))) continue
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue

    const from = path.join(sourceDir, file)
    const to = path.join(targetDir, file)
    if (fs.existsSync(to)) {
      fs.unlinkSync(from)
      continue
    }
    fs.renameSync(from, to)
  }
}

export async function moveTagsToCategory(
  db: ApiDb,
  input: MoveTagsToCategoryInput,
): Promise<MoveTagsToCategoryResult> {
  const targetMetaId = Number(input.targetMetaId)
  const tagIds = uniquePositiveIds(input.tagIds)
  const onConflict = input.onConflict === 'merge' ? 'merge' : 'abort'

  if (!Number.isFinite(targetMetaId) || targetMetaId <= 0) {
    throw new TagMoveToCategoryError('targetMetaId is required')
  }
  if (!tagIds.length) {
    throw new TagMoveToCategoryError('At least one tag is required')
  }

  const assetMoves: Array<{sourceMetaId: number; tagIds: number[]}> = []
  const mergedAssetCleanups: Array<{metaId: number; tagIds: number[]}> = []

  const result = db.drizzle.transaction((tx) => {
    const targetMeta = tx.select().from(meta).where(eq(meta.id, targetMetaId)).get()
    if (!targetMeta) {
      throw new TagMoveToCategoryError('Target category was not found', 404)
    }
    if (targetMeta.type !== 'array') {
      throw new TagMoveToCategoryError('Target must be a tag category (type array)')
    }

    const tagRows = tx.select().from(tags).where(inArray(tags.id, tagIds)).all()
    if (tagRows.length !== tagIds.length) {
      throw new TagMoveToCategoryError('One or more tags were not found', 404)
    }

    const toMove = tagRows.filter((row) => Number(row.metaId) !== targetMetaId)
    if (!toMove.length) {
      return {
        movedIds: [] as number[],
        mergedIds: [] as number[],
        targetMetaId,
        survivors: [] as TagRow[],
      }
    }

    const toMoveIds = toMove.map((row) => row.id)
    const unassignedMediaTypes = findUnassignedMediaTypesForTags(tx, toMoveIds, targetMetaId)
    if (unassignedMediaTypes.length) {
      const names = unassignedMediaTypes.map((row) => row.name).join(', ')
      throw new TagMoveToCategoryError(
        `Target category is not assigned to media type(s): ${names}`,
        409,
        {
          code: 'unassigned_media_types',
          unassignedMediaTypes,
        },
      )
    }

    const conflicts = findTagNameConflicts(tx, {
      candidates: toMove.map((row) => ({tagId: row.id, name: String(row.name ?? '')})),
      excludeTagIds: toMoveIds,
      scope: 'category',
      metaId: targetMetaId,
    })

    if (conflicts.length && onConflict === 'abort') {
      throw new TagMoveToCategoryError(
        'One or more tags already exist in the target category',
        409,
        {
          code: 'name_conflicts',
          conflicts,
        },
      )
    }

    const conflictByTagId = new Map(conflicts.map((c) => [c.tagId, c]))
    const plainMove = toMove.filter((row) => !conflictByTagId.has(row.id))
    const mergeMove = toMove.filter((row) => conflictByTagId.has(row.id))

    const movedIds: number[] = []
    const mergedIds: number[] = []
    const survivors: TagRow[] = []
    const survivorIds = new Set<number>()

    const plainBySource = new Map<number, number[]>()
    for (const row of plainMove) {
      const sourceMetaId = Number(row.metaId)
      if (!Number.isFinite(sourceMetaId) || sourceMetaId <= 0) {
        throw new TagMoveToCategoryError(`Tag ${row.id} has no category`)
      }
      const list = plainBySource.get(sourceMetaId) ?? []
      list.push(row.id)
      plainBySource.set(sourceMetaId, list)
    }

    for (const [sourceMetaId, ids] of plainBySource) {
      moveTagMetaId(tx, ids, sourceMetaId, targetMetaId)
      movedIds.push(...ids)
      assetMoves.push({sourceMetaId, tagIds: ids})
    }

    const mergeBySource = new Map<number, typeof mergeMove>()
    for (const row of mergeMove) {
      const sourceMetaId = Number(row.metaId)
      if (!Number.isFinite(sourceMetaId) || sourceMetaId <= 0) {
        throw new TagMoveToCategoryError(`Tag ${row.id} has no category`)
      }
      const list = mergeBySource.get(sourceMetaId) ?? []
      list.push(row)
      mergeBySource.set(sourceMetaId, list)
    }

    for (const [sourceMetaId, rows] of mergeBySource) {
      const ids = rows.map((row) => row.id)
      moveTagMetaId(tx, ids, sourceMetaId, targetMetaId)
      assetMoves.push({sourceMetaId, tagIds: ids})

      // Group sources that share the same survivor in the target category.
      const bySurvivor = new Map<number, number[]>()
      for (const row of rows) {
        const conflict = conflictByTagId.get(row.id)!
        const list = bySurvivor.get(conflict.existingTagId) ?? []
        list.push(row.id)
        bySurvivor.set(conflict.existingTagId, list)
      }

      for (const [survivorId, sourceIds] of bySurvivor) {
        const mergeResult = mergeTagsInCategoryTx(tx, {
          metaId: targetMetaId,
          survivorId,
          sourceIds,
        })
        mergedIds.push(...mergeResult.deletedIds)
        if (!survivorIds.has(survivorId)) {
          survivorIds.add(survivorId)
          survivors.push(mergeResult.survivor)
        }
        mergedAssetCleanups.push({metaId: targetMetaId, tagIds: mergeResult.deletedIds})
      }
    }

    if (movedIds.length) {
      const remaining = tx.select()
        .from(tags)
        .where(and(
          inArray(tags.id, movedIds),
          eq(tags.metaId, targetMetaId),
        ))
        .all()
      for (const row of remaining) {
        if (!survivorIds.has(row.id)) {
          survivors.push(row)
        }
      }
    }

    return {movedIds, mergedIds, targetMetaId, survivors}
  })

  if (db.path) {
    for (const move of assetMoves) {
      await moveTagAssetsBetweenCategories(
        db.path,
        move.sourceMetaId,
        targetMetaId,
        move.tagIds,
      )
    }
    for (const cleanup of mergedAssetCleanups) {
      await Promise.all(
        cleanup.tagIds.map((tagId) =>
          deleteTagGeneratedAssets(db.path!, cleanup.metaId, tagId),
        ),
      )
    }
  }

  return result
}
