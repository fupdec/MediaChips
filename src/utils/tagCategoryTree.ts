import {
  MAX_META_TREE_DEPTH,
  ancestorIds,
  breadcrumbIds,
  buildChildrenMap,
  buildForest,
  buildParentMap,
  flattenForest,
  nodeDepth,
  normalizeParentId,
  subtreeHeight,
} from '@shared/hierarchyTree'
import type {Meta} from '@/types/stores'

export {MAX_META_TREE_DEPTH, normalizeParentId}

export type MetaLike = Pick<Meta, 'id' | 'parentMetaId' | 'name' | 'type' | 'hidden' | 'order' | 'icon'>

export function isTagCategoryGroup(meta: MetaLike, all: MetaLike[]): boolean {
  const id = Number(meta.id)
  return all.some((item) => item.type === 'array' && Number(item.parentMetaId) === id)
}

export function isTagCategoryLeaf(meta: MetaLike, all: MetaLike[]): boolean {
  return meta.type === 'array' && !isTagCategoryGroup(meta, all)
}

export function tagCategoryLeaves(all: MetaLike[]): MetaLike[] {
  return all.filter((item) => isTagCategoryLeaf(item, all))
}

export type FlatCategory = {
  meta: MetaLike
  depth: number
  isGroup: boolean
}

export function flattenTagCategories(all: MetaLike[]): FlatCategory[] {
  const rows = all.filter((item) => item.type === 'array')
  const forest = buildForest(
    rows,
    (item) => Number(item.id),
    (item) => normalizeParentId(item.parentMetaId),
  )
  const sortNodes = (nodes: typeof forest) => {
    nodes.sort((a, b) => {
      const orderA = Number(a.node.order ?? 0)
      const orderB = Number(b.node.order ?? 0)
      if (orderA !== orderB) return orderA - orderB
      return String(a.node.name || '').localeCompare(String(b.node.name || ''))
    })
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(forest)
  return flattenForest(forest).map((node) => ({
    meta: node.node,
    depth: node.depth,
    isGroup: node.children.length > 0,
  }))
}

export function categoryAncestorIds(metaId: number, all: MetaLike[]): number[] {
  const parentById = buildParentMap(all
    .filter((item) => item.type === 'array')
    .map((item) => ({
      id: Number(item.id),
      parentId: item.parentMetaId as number | null | undefined,
    })))
  return ancestorIds(metaId, parentById)
}

export function isValidCategoryParent(
  metaId: number,
  parentId: number,
  all: MetaLike[],
): boolean {
  if (metaId === parentId) return false
  return !categoryAncestorIds(parentId, all).includes(metaId)
}

function categoryDisplayName(id: number, byId: Map<number, MetaLike>): string {
  return String(byId.get(id)?.name ?? '').trim()
}

export function categoryPathLabel(metaId: number, all: MetaLike[]): string {
  const byId = new Map(all.map((item) => [Number(item.id), item]))
  const names = breadcrumbIds(metaId, buildParentMap(all
    .filter((item) => item.type === 'array')
    .map((item) => ({
      id: Number(item.id),
      parentId: item.parentMetaId as number | null | undefined,
    }))))
    .map((id) => categoryDisplayName(id, byId))
    .filter(Boolean)
  if (names.length) return names.join(' › ')
  return categoryDisplayName(metaId, byId)
}

export function leafCategoryOptions(all: MetaLike[]): Array<MetaLike & {pickerTitle: string}> {
  return flattenTagCategories(all)
    .filter((row) => !row.isGroup)
    .map((row) => ({
      ...row.meta,
      pickerTitle: categoryPathLabel(Number(row.meta.id), all),
    }))
}

export function canNestCategoryUnder(
  parent: MetaLike,
  all: MetaLike[],
  tagsInParent: number,
): boolean {
  if (isTagCategoryGroup(parent, all)) return true
  return Number(tagsInParent) === 0
}

/** Empty or already-grouped categories that can receive a nested child. */
export function hasEmptyCategoryNestTarget(
  all: MetaLike[],
  tagCountByMetaId: Record<number, number>,
): boolean {
  return all.some((category) =>
    category.type === 'array'
    && canNestCategoryUnder(category, all, tagCountByMetaId[Number(category.id)] || 0),
  )
}

export function canReparentCategory(
  metaId: number,
  parentId: number | null,
  all: MetaLike[],
  tagsInParent: number,
): boolean {
  if (parentId == null) return true
  if (!isValidCategoryParent(metaId, parentId, all)) return false
  const parent = all.find((item) => Number(item.id) === parentId)
  if (!parent) return false
  if (!canNestCategoryUnder(parent, all, tagsInParent)) return false
  const parentById = buildParentMap(all
    .filter((item) => item.type === 'array')
    .map((item) => ({
      id: Number(item.id),
      parentId: item.parentMetaId as number | null | undefined,
    })))
  parentById.set(metaId, parentId)
  const children = buildChildrenMap(parentById)
  return nodeDepth(metaId, parentById) + subtreeHeight(metaId, children) <= MAX_META_TREE_DEPTH
}
