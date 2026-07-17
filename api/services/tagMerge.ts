import {and, eq, inArray} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {tags} from '../db/schema/tags'
import {tagsInMedia} from '../db/schema/tagsInMedia'
import {tagsInTags} from '../db/schema/tagsInTag'
import {tagsInFilterRows} from '../db/schema/tagsInFilterRows'
import {valuesInTags} from '../db/schema/valuesInTag'
import {marks} from '../db/schema/marks'
import {tabs} from '../db/schema/tabs'
import {savedFilters} from '../db/schema/savedFilters'
import {pageSettings} from '../db/schema/pageSettings'
import {nowIso} from '../db/utils/timestamps'
import {deleteTagGeneratedAssets} from './localAssetCleanup'
import type {TagRow} from '../db/repositories/tags'

export class TagMergeError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'TagMergeError'
    this.status = status
  }
}

export interface MergeTagsInput {
  metaId: number
  survivorId: number
  sourceIds: number[]
}

export interface MergeTagsResult {
  survivor: TagRow
  deletedIds: number[]
  migrated: {
    mediaLinks: number
    nestedAsChild: number
    nestedAsParent: number
    nestedNameDeduped: number
    filterRows: number
    values: number
    marks: number
    tabs: number
    savedFilters: number
    pageSettings: number
  }
}

type MergeTx = Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0]

/**
 * After parent links are moved onto the survivor, collapse nested children
 * that share the same name within one category (e.g. two "Real" under Boobs).
 * Prefers links that already belonged to the survivor before the merge.
 * Also removes exact duplicate rows when the DB has no unique index.
 */
export function dedupeNestedTagsByName(
  tx: MergeTx,
  survivorId: number,
  preferredChildIds: Set<number>,
): number {
  const exactLinks = tx.select()
    .from(tagsInTags)
    .where(eq(tagsInTags.parentTagId, survivorId))
    .all()

  const exactUnique = uniqueByKey(exactLinks, (link) => `${link.tagId}:${link.metaId}`)
  let removed = exactLinks.length - exactUnique.length

  if (removed > 0) {
    tx.delete(tagsInTags).where(eq(tagsInTags.parentTagId, survivorId)).run()
    if (exactUnique.length) {
      tx.insert(tagsInTags)
        .values(exactUnique.map((link) => ({
          parentTagId: survivorId,
          tagId: link.tagId,
          metaId: link.metaId,
        })))
        .run()
    }
  }

  const links = removed > 0
    ? exactUnique
    : exactLinks

  if (links.length < 2) return removed

  const childIds = [...new Set(links.map((row) => row.tagId))]
  const childRows = tx.select({id: tags.id, name: tags.name})
    .from(tags)
    .where(inArray(tags.id, childIds))
    .all()
  const nameById = new Map(
    childRows.map((row) => [row.id, String(row.name ?? '').trim().toLowerCase()]),
  )

  const groups = new Map<string, typeof links>()
  for (const link of links) {
    const name = nameById.get(link.tagId)
    if (!name) continue
    const key = `${link.metaId}:${name}`
    const group = groups.get(key)
    if (group) group.push(link)
    else groups.set(key, [link])
  }

  for (const group of groups.values()) {
    const unique = [...new Map(group.map((link) => [link.tagId, link])).values()]
    if (unique.length < 2) continue

    unique.sort((a, b) => {
      const aPreferred = preferredChildIds.has(a.tagId) ? 0 : 1
      const bPreferred = preferredChildIds.has(b.tagId) ? 0 : 1
      if (aPreferred !== bPreferred) return aPreferred - bPreferred
      return a.tagId - b.tagId
    })

    for (const link of unique.slice(1)) {
      tx.delete(tagsInTags)
        .where(and(
          eq(tagsInTags.parentTagId, survivorId),
          eq(tagsInTags.tagId, link.tagId),
          eq(tagsInTags.metaId, link.metaId),
        ))
        .run()
      removed += 1
    }
  }

  return removed
}

function uniqueByKey<T>(items: T[], keyFn: (item: T) => string): T[] {
  const map = new Map<string, T>()
  for (const item of items) map.set(keyFn(item), item)
  return [...map.values()]
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

export function mergeSynonymLists(
  survivorName: string,
  survivorSynonyms: string | null | undefined,
  sources: Array<{name?: string | null; synonyms?: string | null}>,
): string | null {
  const byLower = new Map<string, string>()

  const addToken = (raw: string | null | undefined) => {
    if (!raw) return
    for (const part of String(raw).split(',')) {
      const trimmed = part.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (!byLower.has(key)) byLower.set(key, trimmed)
    }
  }

  addToken(survivorSynonyms)
  for (const source of sources) {
    addToken(source.name)
    addToken(source.synonyms)
  }

  const survivorKey = survivorName.trim().toLowerCase()
  if (survivorKey) byLower.delete(survivorKey)

  if (!byLower.size) return null
  return [...byLower.values()].join(', ')
}

/**
 * Merge tags inside an existing transaction (used by category merge too).
 * Caller is responsible for asset cleanup of deletedIds.
 */
export function mergeTagsInCategoryTx(
  tx: MergeTx,
  input: MergeTagsInput,
): MergeTagsResult {
  const metaId = Number(input.metaId)
  const survivorId = Number(input.survivorId)
  const sourceIds = uniquePositiveIds(input.sourceIds).filter((id) => id !== survivorId)

  if (!Number.isFinite(metaId) || metaId <= 0) {
    throw new TagMergeError('metaId is required')
  }
  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new TagMergeError('survivorId is required')
  }
  if (!sourceIds.length) {
    throw new TagMergeError('At least one source tag is required')
  }

  const allIds = [survivorId, ...sourceIds]
  const tagRows = tx.select().from(tags).where(inArray(tags.id, allIds)).all()
  if (tagRows.length !== allIds.length) {
    throw new TagMergeError('One or more tags were not found', 404)
  }

  for (const row of tagRows) {
    if (Number(row.metaId) !== metaId) {
      throw new TagMergeError('All tags must belong to the same category')
    }
  }

  const survivor = tagRows.find((row) => row.id === survivorId)!
  const sources = tagRows.filter((row) => row.id !== survivorId)
  const migrated = {
    mediaLinks: 0,
    nestedAsChild: 0,
    nestedAsParent: 0,
    nestedNameDeduped: 0,
    filterRows: 0,
    values: 0,
    marks: 0,
    tabs: 0,
    savedFilters: 0,
    pageSettings: 0,
  }

  const preferredNestedChildIds = new Set(
    tx.select({tagId: tagsInTags.tagId})
      .from(tagsInTags)
      .where(eq(tagsInTags.parentTagId, survivorId))
      .all()
      .map((row) => row.tagId),
  )

  // tagsInMedia: move links to survivor, drop PK collisions
  const mediaLinks = tx.select()
    .from(tagsInMedia)
    .where(inArray(tagsInMedia.tagId, sourceIds))
    .all()

  if (mediaLinks.length) {
    const mediaRows = uniqueByKey(
      mediaLinks.map((row) => ({
        mediaId: row.mediaId,
        tagId: survivorId,
        metaId: row.metaId,
      })),
      (row) => `${row.mediaId}:${row.tagId}:${row.metaId}`,
    )
    const inserted = tx.insert(tagsInMedia)
      .values(mediaRows)
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.mediaLinks = inserted.length || mediaRows.length
    tx.delete(tagsInMedia).where(inArray(tagsInMedia.tagId, sourceIds)).run()
  }

  // tagsInTags as child (tagId)
  const nestedAsChild = tx.select()
    .from(tagsInTags)
    .where(inArray(tagsInTags.tagId, sourceIds))
    .all()

  if (nestedAsChild.length) {
    const childRows = uniqueByKey(
      nestedAsChild
        .filter((row) => row.parentTagId !== survivorId)
        .map((row) => ({
          parentTagId: row.parentTagId,
          tagId: survivorId,
          metaId: row.metaId,
        })),
      (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
    )

    if (childRows.length) {
      const inserted = tx.insert(tagsInTags)
        .values(childRows)
        .onConflictDoNothing()
        .returning()
        .all()
      migrated.nestedAsChild = inserted.length || childRows.length
    }
    tx.delete(tagsInTags).where(inArray(tagsInTags.tagId, sourceIds)).run()
  }

  // tagsInTags as parent (parentTagId)
  const nestedAsParent = tx.select()
    .from(tagsInTags)
    .where(inArray(tagsInTags.parentTagId, sourceIds))
    .all()

  if (nestedAsParent.length) {
    const parentRows = uniqueByKey(
      nestedAsParent
        .filter((row) => row.tagId !== survivorId)
        .map((row) => ({
          parentTagId: survivorId,
          tagId: row.tagId,
          metaId: row.metaId,
        })),
      (row) => `${row.parentTagId}:${row.tagId}:${row.metaId}`,
    )

    if (parentRows.length) {
      const inserted = tx.insert(tagsInTags)
        .values(parentRows)
        .onConflictDoNothing()
        .returning()
        .all()
      migrated.nestedAsParent = inserted.length || parentRows.length
    }
    tx.delete(tagsInTags).where(inArray(tagsInTags.parentTagId, sourceIds)).run()
  }

  // Drop self-links that may already exist or were created earlier
  tx.delete(tagsInTags)
    .where(and(
      eq(tagsInTags.parentTagId, survivorId),
      eq(tagsInTags.tagId, survivorId),
    ))
    .run()

  // Same-name nested tags in one category (e.g. Real + Real after merging performers)
  migrated.nestedNameDeduped = dedupeNestedTagsByName(tx, survivorId, preferredNestedChildIds)

  // tagsInFilterRows
  const filterLinks = tx.select()
    .from(tagsInFilterRows)
    .where(inArray(tagsInFilterRows.tagId, sourceIds))
    .all()

  if (filterLinks.length) {
    const inserted = tx.insert(tagsInFilterRows)
      .values(filterLinks.map((row) => ({
        tagId: survivorId,
        rowId: row.rowId,
        metaId: row.metaId,
      })))
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.filterRows = inserted.length
    tx.delete(tagsInFilterRows).where(inArray(tagsInFilterRows.tagId, sourceIds)).run()
  }

  // valuesInTags: keep survivor on conflict; only move unique metaIds
  const survivorValues = tx.select()
    .from(valuesInTags)
    .where(eq(valuesInTags.tagId, survivorId))
    .all()
  const survivorMetaIds = new Set(survivorValues.map((row) => row.metaId))

  const sourceValues = tx.select()
    .from(valuesInTags)
    .where(inArray(valuesInTags.tagId, sourceIds))
    .all()

  const valuesToInsert = []
  const seenMetaIds = new Set<number>()
  for (const row of sourceValues) {
    if (survivorMetaIds.has(row.metaId) || seenMetaIds.has(row.metaId)) continue
    seenMetaIds.add(row.metaId)
    valuesToInsert.push({
      tagId: survivorId,
      metaId: row.metaId,
      value: row.value,
    })
  }

  if (valuesToInsert.length) {
    const inserted = tx.insert(valuesInTags)
      .values(valuesToInsert)
      .onConflictDoNothing()
      .returning()
      .all()
    migrated.values = inserted.length
  }
  tx.delete(valuesInTags).where(inArray(valuesInTags.tagId, sourceIds)).run()

  // marks
  const markUpdate = tx.update(marks)
    .set({tagId: survivorId})
    .where(inArray(marks.tagId, sourceIds))
    .run()
  migrated.marks = Number(markUpdate.changes ?? 0)

  // tabs / savedFilters / pageSettings
  const tabsUpdate = tx.update(tabs)
    .set({tagId: survivorId})
    .where(inArray(tabs.tagId, sourceIds))
    .run()
  migrated.tabs = Number(tabsUpdate.changes ?? 0)

  const filtersUpdate = tx.update(savedFilters)
    .set({tagId: survivorId})
    .where(inArray(savedFilters.tagId, sourceIds))
    .run()
  migrated.savedFilters = Number(filtersUpdate.changes ?? 0)

  const pageSettingsUpdate = tx.update(pageSettings)
    .set({tagId: survivorId})
    .where(inArray(pageSettings.tagId, sourceIds))
    .run()
  migrated.pageSettings = Number(pageSettingsUpdate.changes ?? 0)

  const mergedSynonyms = mergeSynonymLists(survivor.name, survivor.synonyms, sources)
  tx.update(tags)
    .set({
      synonyms: mergedSynonyms,
      updatedAt: nowIso(),
    })
    .where(eq(tags.id, survivorId))
    .run()

  tx.delete(tags).where(inArray(tags.id, sourceIds)).run()

  const updatedSurvivor = tx.select().from(tags).where(eq(tags.id, survivorId)).get()!
  return {
    survivor: updatedSurvivor,
    deletedIds: sourceIds,
    migrated,
  }
}

export async function mergeTagsInCategory(
  db: ApiDb,
  input: MergeTagsInput,
): Promise<MergeTagsResult> {
  const metaId = Number(input.metaId)
  const survivorId = Number(input.survivorId)
  const sourceIds = uniquePositiveIds(input.sourceIds).filter((id) => id !== survivorId)

  if (!Number.isFinite(metaId) || metaId <= 0) {
    throw new TagMergeError('metaId is required')
  }
  if (!Number.isFinite(survivorId) || survivorId <= 0) {
    throw new TagMergeError('survivorId is required')
  }
  if (!sourceIds.length) {
    throw new TagMergeError('At least one source tag is required')
  }

  const runMerge = db.drizzle.transaction((tx) =>
    mergeTagsInCategoryTx(tx, {
      metaId,
      survivorId,
      sourceIds,
    }),
  )

  if (db.path) {
    await Promise.all(
      sourceIds.map((tagId) => deleteTagGeneratedAssets(db.path!, metaId, tagId)),
    )
  }

  return runMerge
}
