import {and, eq, inArray, isNull, or} from 'drizzle-orm'
import type {ApiDb} from '../types/db'
import {HttpError} from '../types/errors'
import {meta} from '../db/schema/meta'
import {metaInMediaTypes} from '../db/schema/metaInMediaTypes'
import {tags} from '../db/schema/tags'
import {nowIso} from '../db/utils/timestamps'
import {
  MAX_META_TREE_DEPTH,
  buildChildrenMap,
  buildParentMap,
  nodeDepth,
  normalizeParentId,
  subtreeHeight,
  wouldCreateCycle,
} from '../../shared/hierarchyTree'

export {MAX_META_TREE_DEPTH}

type TreeTx = Parameters<Parameters<ApiDb['drizzle']['transaction']>[0]>[0]

const notDeleted = or(isNull(tags.deletedAt), eq(tags.deletedAt, ''))

export class TagCategoryTreeError extends HttpError {
  constructor(status: number, message: string, code?: string) {
    super(status, message, code ? {code} : {})
    this.name = 'TagCategoryTreeError'
  }
}

function asPositiveId(value: unknown): number | null {
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function loadMetaParentMap(tx: TreeTx) {
  const rows = tx.select({
    id: meta.id,
    parentMetaId: meta.parentMetaId,
    type: meta.type,
  }).from(meta).all()

  const arrayIds = new Set(
    rows.filter((row) => row.type === 'array').map((row) => row.id),
  )
  return {
    parentById: buildParentMap(rows.map((row) => ({
      id: row.id,
      parentId: row.parentMetaId,
    }))),
    arrayIds,
    rows,
  }
}

export function metaHasChildCategories(tx: TreeTx, metaId: number): boolean {
  const child = tx.select({id: meta.id})
    .from(meta)
    .where(eq(meta.parentMetaId, metaId))
    .get()
  return Boolean(child)
}

export function metaHasActiveTags(tx: TreeTx, metaId: number): boolean {
  const row = tx.select({id: tags.id})
    .from(tags)
    .where(and(eq(tags.metaId, metaId), notDeleted))
    .get()
  return Boolean(row)
}

export function assertMetaIsTagLeaf(tx: TreeTx, metaId: number, message?: string) {
  const row = tx.select().from(meta).where(eq(meta.id, metaId)).get()
  if (!row) {
    throw new TagCategoryTreeError(404, 'Tag category was not found', 'not_found')
  }
  if (row.type !== 'array') {
    throw new TagCategoryTreeError(400, 'Target must be a tag category (type array)', 'not_array')
  }
  if (metaHasChildCategories(tx, metaId)) {
    throw new TagCategoryTreeError(
      400,
      message || 'Parent tag categories cannot hold tags or be assigned to media',
      'category_is_group',
    )
  }
}

export function assertMetaCanHoldTags(tx: TreeTx, metaId: number) {
  assertMetaIsTagLeaf(tx, metaId, 'Parent tag categories cannot hold tags')
}

function assertMetaCanBecomeGroup(tx: TreeTx, metaId: number) {
  if (metaHasActiveTags(tx, metaId)) {
    throw new TagCategoryTreeError(
      409,
      'Move or delete tags in this category before nesting another category under it',
      'group_has_tags',
    )
  }
  const assigned = tx.select({mediaTypeId: metaInMediaTypes.mediaTypeId})
    .from(metaInMediaTypes)
    .where(eq(metaInMediaTypes.metaId, metaId))
    .get()
  if (assigned) {
    throw new TagCategoryTreeError(
      409,
      'Unpin this category from media types before using it as a group',
      'group_has_media_types',
    )
  }
}

export function assertNewMetaParent(tx: TreeTx, parentMetaId: number) {
  const parent = tx.select().from(meta).where(eq(meta.id, parentMetaId)).get()
  if (!parent) {
    throw new TagCategoryTreeError(404, 'Parent category was not found', 'parent_not_found')
  }
  if (parent.type !== 'array') {
    throw new TagCategoryTreeError(400, 'Parent must be a tag category', 'parent_not_array')
  }
  if (!metaHasChildCategories(tx, parentMetaId)) {
    assertMetaCanBecomeGroup(tx, parentMetaId)
  }
  const {parentById} = loadMetaParentMap(tx)
  if (nodeDepth(parentMetaId, parentById) + 1 > MAX_META_TREE_DEPTH) {
    throw new TagCategoryTreeError(
      400,
      `Category tree cannot be deeper than ${MAX_META_TREE_DEPTH} levels`,
      'max_depth',
    )
  }
}

export function assertValidMetaParent(tx: TreeTx, metaId: number, parentMetaId: number | null) {
  const row = tx.select().from(meta).where(eq(meta.id, metaId)).get()
  if (!row) {
    throw new TagCategoryTreeError(404, 'Tag category was not found', 'not_found')
  }
  // Clearing / confirming a null parent is a no-op for non-categories (e.g. meta
  // field Apply payloads that accidentally include parentMetaId: null).
  if (row.type !== 'array') {
    if (parentMetaId == null) return
    throw new TagCategoryTreeError(400, 'Only tag categories can be nested', 'not_array')
  }
  if (parentMetaId == null) return

  const parent = tx.select().from(meta).where(eq(meta.id, parentMetaId)).get()
  if (!parent) {
    throw new TagCategoryTreeError(404, 'Parent category was not found', 'parent_not_found')
  }
  if (parent.type !== 'array') {
    throw new TagCategoryTreeError(400, 'Parent must be a tag category', 'parent_not_array')
  }

  const {parentById} = loadMetaParentMap(tx)
  if (wouldCreateCycle(metaId, parentMetaId, parentById)) {
    throw new TagCategoryTreeError(400, 'Cannot nest a category under its descendant', 'cycle')
  }

  if (!metaHasChildCategories(tx, parentMetaId)) {
    assertMetaCanBecomeGroup(tx, parentMetaId)
  }

  const nextMap = new Map(parentById)
  nextMap.set(metaId, parentMetaId)
  const children = buildChildrenMap(nextMap)
  if (nodeDepth(metaId, nextMap) + subtreeHeight(metaId, children) > MAX_META_TREE_DEPTH) {
    throw new TagCategoryTreeError(
      400,
      `Category tree cannot be deeper than ${MAX_META_TREE_DEPTH} levels`,
      'max_depth',
    )
  }
}

export function reparentMeta(tx: TreeTx, metaId: number, parentMetaId: number | null) {
  const id = asPositiveId(metaId)
  if (id == null) {
    throw new TagCategoryTreeError(400, 'Category id is required')
  }
  const nextParent = normalizeParentId(parentMetaId)
  assertValidMetaParent(tx, id, nextParent)
  tx.update(meta)
    .set({parentMetaId: nextParent, updatedAt: nowIso()})
    .where(eq(meta.id, id))
    .run()
}

export function reparentMetaChildrenTo(
  tx: TreeTx,
  sourceIds: number[],
  nextParentId: number | null,
) {
  const ids = sourceIds.filter((id) => Number.isFinite(id) && id > 0)
  if (!ids.length) return
  tx.update(meta)
    .set({parentMetaId: nextParentId, updatedAt: nowIso()})
    .where(inArray(meta.parentMetaId, ids))
    .run()
}

export function parseOptionalParentId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined
  return normalizeParentId(value)
}
