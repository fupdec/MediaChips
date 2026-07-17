import fs from 'fs'
import path from 'path'
import {eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {meta} from '../db/schema/meta'
import {metaSettings} from '../db/schema/metaSettings'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {pinnedMetas} from '../db/schema/pinnedMeta'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {tagsInFilterRows} from '../db/schema/tagsInFilterRows'
import {filterRows} from '../db/schema/filterRows'
import {tabs} from '../db/schema/tabs'
import {savedFilters} from '../db/schema/savedFilters'
import {pageSettings} from '../db/schema/pageSettings'
import {nowIso} from '../db/utils/timestamps'
import type {MetaRow} from '../db/repositories/meta'
import {deleteTagGeneratedAssets} from './localAssetCleanup'
import {mergeTagsInCategoryTx} from './tagMerge'

export class MetaCategoryMergeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'MetaCategoryMergeError'
    this.status = status
  }
}

export interface MergeCategoriesInput {
  survivorId: number
  sourceIds: number[]
}

export interface MergeCategoriesResult {
  survivor: MetaRow
  deletedIds: number[]
  autoMergedTagIds: number[]
  migrated: {
    tags: number
    mediaLinks: number
    nestedLinks: number
    filterRows: number
    filterRowTags: number
    tabs: number
    savedFilters: number
    pageSettings: number
    mediaTypeAssignments: number
    pinnedFields: number
    autoMergedTagPairs: number
  }
}

type MergeTx = Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0]

const OR_META_FLAGS = [
  'synonyms',
  'nested',
  'marks',
  'bookmark',
  'parser',
  'country',
  'career',
  'scraper',
  'rating',
  'favorite',
  'chipLabel',
  'color',
  'autoColorFromImage',
  'isLink',
] as const

const OR_SETTING_FLAGS = [
  'synonyms',
  'nested',
  'marks',
  'bookmark',
  'parser',
  'country',
  'career',
  'scraper',
  'rating',
  'favorite',
  'chipOutlined',
  'chipLabel',
  'color',
  'isLink',
] as const

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

function tagNameKey(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase()
}

function uniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(keyFn(item), item)
  return [...map.values()]
}

function remapTagsInMediaMetaId(
  tx: MergeTx,
  sourceMetaId: number,
  survivorMetaId: number,
): number {
  const rows = tx.select().from(tagsInMedia).where(eq(tagsInMedia.metaId, sourceMetaId)).all()
  if (!rows.length) return 0

  const remapped = uniqueByKey(
    rows.map((row) => ({
      mediaId: row.mediaId,
      tagId: row.tagId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
  )
  tx.insert(tagsInMedia).values(remapped).onConflictDoNothing().run()
  tx.delete(tagsInMedia).where(eq(tagsInMedia.metaId, sourceMetaId)).run()
  return remapped.length
}

function remapTagsInTagsMetaId(
  tx: MergeTx,
  sourceMetaId: number,
  survivorMetaId: number,
): number {
  const rows = tx.select().from(tagsInTags).where(eq(tagsInTags.metaId, sourceMetaId)).all()
  if (!rows.length) return 0

  const remapped = uniqueByKey(
    rows.map((row) => ({
      parentTagId: row.parentTagId,
      tagId: row.tagId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
  )
  tx.insert(tagsInTags).values(remapped).onConflictDoNothing().run()
  tx.delete(tagsInTags).where(eq(tagsInTags.metaId, sourceMetaId)).run()
  return remapped.length
}

function remapTagsInFilterRowsMetaId(
  tx: MergeTx,
  sourceMetaId: number,
  survivorMetaId: number,
): number {
  const rows = tx.select()
    .from(tagsInFilterRows)
    .where(eq(tagsInFilterRows.metaId, sourceMetaId))
    .all()
  if (!rows.length) return 0

  const remapped = uniqueByKey(
    rows.map((row) => ({
      tagId: row.tagId,
      rowId: row.rowId,
      metaId: survivorMetaId,
    })),
    (row) => `${row.tagId}:${row.rowId}:${row.metaId}`,
  )
  tx.insert(tagsInFilterRows).values(remapped).onConflictDoNothing().run()
  tx.delete(tagsInFilterRows).where(eq(tagsInFilterRows.metaId, sourceMetaId)).run()
  return remapped.length
}

function orBooleanFlags<T extends Record<string, unknown>>(
  survivor: T,
  sources: T[],
  keys: readonly string[],
): Partial<T> {
  const patch: Record<string, unknown> = {}
  for (const key of keys) {
    const anyEnabled = Boolean(survivor[key]) || sources.some((row) => Boolean(row[key]))
    if (anyEnabled !== Boolean(survivor[key])) {
      patch[key] = anyEnabled
    } else if (anyEnabled) {
      patch[key] = true
    }
  }
  return patch as Partial<T>
}

async function moveTagAssetsToSurvivor(
  dbPath: string,
  sourceMetaId: number,
  survivorMetaId: number,
  tagIds: number[],
) {
  if (!tagIds.length) return
  const sourceDir = path.join(dbPath, 'meta', String(sourceMetaId))
  const survivorDir = path.join(dbPath, 'meta', String(survivorMetaId))
  if (!fs.existsSync(sourceDir)) return
  if (!fs.existsSync(survivorDir)) fs.mkdirSync(survivorDir, {recursive: true})

  const files = await fs.promises.readdir(sourceDir)
  const prefixes = tagIds.map((id) => `${id}_`)

  for (const file of files) {
    if (!prefixes.some((prefix) => file.startsWith(prefix))) continue
    if (!/\.(jpg|jpeg|png|webp)$/i.test(file)) continue

    const from = path.join(sourceDir, file)
    const to = path.join(survivorDir, file)
    if (fs.existsSync(to)) {
      fs.unlinkSync(from)
      continue
    }
    fs.renameSync(from, to)
  }
}

export async function mergeTagCategories(
  db: ApiDb,
  input: MergeCategoriesInput,
): Promise<MergeCategoriesResult> {
  const survivorId = Number(input.survivorId)
  const sourceIds = uniquePositiveIds(input.sourceIds).filter((id) => id !== survivorId)

  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new MetaCategoryMergeError('survivorId is required')
  }
  if (!sourceIds.length) {
    throw new MetaCategoryMergeError('At least one source category is required')
  }

  const allIds = [survivorId, ...sourceIds]
  const movedTagIdsBySource = new Map<number, number[]>()
  const autoMergedTagIds: number[] = []

  const runMerge = db.drizzle.transaction((tx) => {
    const metaRows = tx.select().from(meta).where(inArray(meta.id, allIds)).all()
    if (metaRows.length !== allIds.length) {
      throw new MetaCategoryMergeError('One or more categories were not found', 404)
    }

    for (const row of metaRows) {
      if (row.type !== 'array') {
        throw new MetaCategoryMergeError('Only tag categories (type array) can be merged')
      }
    }

    const survivor = metaRows.find((row) => row.id === survivorId)!
    const sources = metaRows.filter((row) => row.id !== survivorId)

    const migrated = {
      tags: 0,
      mediaLinks: 0,
      nestedLinks: 0,
      filterRows: 0,
      filterRowTags: 0,
      tabs: 0,
      savedFilters: 0,
      pageSettings: 0,
      mediaTypeAssignments: 0,
      pinnedFields: 0,
      autoMergedTagPairs: 0,
    }

    const originalSurvivorTagIds = new Set(
      tx.select({id: tags.id})
        .from(tags)
        .where(eq(tags.metaId, survivorId))
        .all()
        .map((row) => row.id),
    )

    // OR-merge capability flags onto survivor
    const metaPatch = orBooleanFlags(
      survivor as unknown as Record<string, unknown>,
      sources as unknown as Array<Record<string, unknown>>,
      OR_META_FLAGS,
    )
    tx.update(meta)
      .set({
        ...metaPatch,
        updatedAt: nowIso(),
      })
      .where(eq(meta.id, survivorId))
      .run()

    const survivorSettings = tx.select()
      .from(metaSettings)
      .where(eq(metaSettings.metaId, survivorId))
      .get()
    const sourceSettings = tx.select()
      .from(metaSettings)
      .where(inArray(metaSettings.metaId, sourceIds))
      .all()

    if (survivorSettings && sourceSettings.length) {
      const settingsPatch = orBooleanFlags(
        survivorSettings as unknown as Record<string, unknown>,
        sourceSettings as unknown as Array<Record<string, unknown>>,
        OR_SETTING_FLAGS,
      )
      if (Object.keys(settingsPatch).length) {
        tx.update(metaSettings)
          .set(settingsPatch)
          .where(eq(metaSettings.metaId, survivorId))
          .run()
      }
    }

    for (const sourceMetaId of sourceIds) {
      migrated.mediaLinks += remapTagsInMediaMetaId(tx, sourceMetaId, survivorId)
      migrated.nestedLinks += remapTagsInTagsMetaId(tx, sourceMetaId, survivorId)
      migrated.filterRowTags += remapTagsInFilterRowsMetaId(tx, sourceMetaId, survivorId)

      const filterUpdate = tx.update(filterRows)
        .set({metaId: survivorId})
        .where(eq(filterRows.metaId, sourceMetaId))
        .run()
      migrated.filterRows += Number(filterUpdate.changes ?? 0)

      const tabsUpdate = tx.update(tabs)
        .set({metaId: survivorId})
        .where(eq(tabs.metaId, sourceMetaId))
        .run()
      migrated.tabs += Number(tabsUpdate.changes ?? 0)

      const filtersUpdate = tx.update(savedFilters)
        .set({metaId: survivorId})
        .where(eq(savedFilters.metaId, sourceMetaId))
        .run()
      migrated.savedFilters += Number(filtersUpdate.changes ?? 0)

      const pageUpdate = tx.update(pageSettings)
        .set({metaId: survivorId})
        .where(eq(pageSettings.metaId, sourceMetaId))
        .run()
      migrated.pageSettings += Number(pageUpdate.changes ?? 0)

      // media type assignments: union onto survivor
      const assignments = tx.select()
        .from(metaInMediaTypes)
        .where(eq(metaInMediaTypes.metaId, sourceMetaId))
        .all()
      if (assignments.length) {
        tx.insert(metaInMediaTypes)
          .values(assignments.map((row) => ({
            ...row,
            metaId: survivorId,
          })))
          .onConflictDoNothing()
          .run()
        migrated.mediaTypeAssignments += assignments.length
        tx.delete(metaInMediaTypes).where(eq(metaInMediaTypes.metaId, sourceMetaId)).run()
      }

      // pinned fields hosted on the category
      const pins = tx.select()
        .from(pinnedMetas)
        .where(eq(pinnedMetas.metaId, sourceMetaId))
        .all()
      if (pins.length) {
        tx.insert(pinnedMetas)
          .values(pins.map((row) => ({
            ...row,
            metaId: survivorId,
          })))
          .onConflictDoNothing()
          .run()
        migrated.pinnedFields += pins.length
        tx.delete(pinnedMetas).where(eq(pinnedMetas.metaId, sourceMetaId)).run()
      }

      // if a category was itself pinned onto something, retarget
      const pinnedAsField = tx.select()
        .from(pinnedMetas)
        .where(eq(pinnedMetas.pinnedMetaId, sourceMetaId))
        .all()
      if (pinnedAsField.length) {
        tx.insert(pinnedMetas)
          .values(pinnedAsField.map((row) => ({
            ...row,
            pinnedMetaId: survivorId,
          })))
          .onConflictDoNothing()
          .run()
        tx.delete(pinnedMetas).where(eq(pinnedMetas.pinnedMetaId, sourceMetaId)).run()
      }

      const sourceTagIds = tx.select({id: tags.id})
        .from(tags)
        .where(eq(tags.metaId, sourceMetaId))
        .all()
        .map((row) => row.id)

      if (sourceTagIds.length) {
        movedTagIdsBySource.set(sourceMetaId, sourceTagIds)
        const tagsUpdate = tx.update(tags)
          .set({metaId: survivorId, updatedAt: nowIso()})
          .where(eq(tags.metaId, sourceMetaId))
          .run()
        migrated.tags += Number(tagsUpdate.changes ?? 0)
      }

      tx.delete(metaSettings).where(eq(metaSettings.metaId, sourceMetaId)).run()
    }

    // Auto-merge same-named tags now living in the survivor category
    const categoryTags = tx.select({id: tags.id, name: tags.name})
      .from(tags)
      .where(eq(tags.metaId, survivorId))
      .all()

    const byName = new Map<string, number[]>()
    for (const tag of categoryTags) {
      const key = tagNameKey(tag.name)
      if (!key) continue
      const group = byName.get(key)
      if (group) group.push(tag.id)
      else byName.set(key, [tag.id])
    }

    for (const ids of byName.values()) {
      if (ids.length < 2) continue

      ids.sort((a, b) => {
        const aPreferred = originalSurvivorTagIds.has(a) ? 0 : 1
        const bPreferred = originalSurvivorTagIds.has(b) ? 0 : 1
        if (aPreferred !== bPreferred) return aPreferred - bPreferred
        return a - b
      })

      const keepId = ids[0]
      const mergeIds = ids.slice(1)
      const mergeResult = mergeTagsInCategoryTx(tx, {
        metaId: survivorId,
        survivorId: keepId,
        sourceIds: mergeIds,
      })
      autoMergedTagIds.push(...mergeResult.deletedIds)
      migrated.autoMergedTagPairs += mergeResult.deletedIds.length
    }

    tx.delete(meta).where(inArray(meta.id, sourceIds)).run()

    const updatedSurvivor = tx.select().from(meta).where(eq(meta.id, survivorId)).get()!
    return {
      survivor: updatedSurvivor,
      deletedIds: sourceIds,
      autoMergedTagIds,
      migrated,
    }
  })

  if (db.path) {
    for (const [sourceMetaId, tagIds] of movedTagIdsBySource) {
      const remaining = tagIds.filter((id) => !autoMergedTagIds.includes(id))
      await moveTagAssetsToSurvivor(db.path, sourceMetaId, survivorId, remaining)
    }

    await Promise.all(
      autoMergedTagIds.map((tagId) =>
        deleteTagGeneratedAssets(db.path!, survivorId, tagId),
      ),
    )

    for (const sourceMetaId of sourceIds) {
      const dir = path.join(db.path, 'meta', String(sourceMetaId))
      fs.rmSync(dir, {recursive: true, force: true})
    }
  }

  return runMerge
}
