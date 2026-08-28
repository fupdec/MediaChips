import {
  MAX_META_TREE_DEPTH,
  MAX_TAG_TREE_DEPTH,
  ancestorIds,
  breadcrumbIds,
  buildChildrenMap,
  buildForest,
  buildParentMap,
  collectDescendantIds,
  flattenForest,
  nodeDepth,
  normalizeParentId,
  subtreeHeight,
} from '@shared/hierarchyTree'
import type {Meta} from '@/types/stores'
import type {Tag} from '@shared/entities/meta'

export {MAX_META_TREE_DEPTH, MAX_TAG_TREE_DEPTH, normalizeParentId}

export type TagLike = Pick<Tag, 'id' | 'parentTagId' | 'name' | 'metaId'>
export type MetaLike = Pick<Meta, 'id' | 'parentMetaId' | 'name' | 'type' | 'hidden' | 'order' | 'icon'>

export function tagParentMap(tags: TagLike[]) {
  return buildParentMap(tags.map((tag) => ({
    id: Number(tag.id),
    parentId: tag.parentTagId as number | null | undefined,
  })))
}

export function tagDepth(tagId: number, tags: TagLike[]): number {
  return nodeDepth(tagId, tagParentMap(tags))
}

export function tagBreadcrumbIds(tagId: number, tags: TagLike[]): number[] {
  return breadcrumbIds(tagId, tagParentMap(tags))
}

export function tagDescendantIds(tagId: number, tags: TagLike[]): number[] {
  return collectDescendantIds(tagId, buildChildrenMap(tagParentMap(tags)))
}

export function isValidTagParent(tagId: number, parentId: number, tags: TagLike[]): boolean {
  if (tagId === parentId) return false
  return !tagDescendantIds(tagId, tags).includes(parentId)
}

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

export function categoryPathLabel(metaId: number, all: MetaLike[]): string {
  const byId = new Map(all.map((item) => [Number(item.id), item]))
  return breadcrumbIds(metaId, buildParentMap(all
    .filter((item) => item.type === 'array')
    .map((item) => ({
      id: Number(item.id),
      parentId: item.parentMetaId as number | null | undefined,
    }))))
    .map((id) => String(byId.get(id)?.name || id))
    .join(' › ')
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

export function canReparentTag(
  tagId: number,
  parentId: number | null,
  tags: TagLike[],
): boolean {
  if (parentId == null) return true
  if (!isValidTagParent(tagId, parentId, tags)) return false
  const parentById = tagParentMap(tags)
  parentById.set(tagId, parentId)
  const children = buildChildrenMap(parentById)
  return nodeDepth(tagId, parentById) + subtreeHeight(tagId, children) <= MAX_TAG_TREE_DEPTH
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

export type FlatTag = {
  tag: TagLike
  depth: number
  isGroup: boolean
}

export function flattenTagsInCategory(tags: TagLike[]): FlatTag[] {
  const forest = buildForest(
    tags,
    (item) => Number(item.id),
    (item) => normalizeParentId(item.parentTagId),
  )
  const sortNodes = (nodes: typeof forest) => {
    nodes.sort((a, b) => String(a.node.name || '').localeCompare(String(b.node.name || '')))
    for (const node of nodes) sortNodes(node.children)
  }
  sortNodes(forest)
  return flattenForest(forest).map((node) => ({
    tag: node.node,
    depth: node.depth,
    isGroup: node.children.length > 0,
  }))
}

export function validTagParents(tagId: number, tags: TagLike[]): TagLike[] {
  return flattenTagsInCategory(tags)
    .filter((row) => isValidTagParent(tagId, Number(row.tag.id), tags))
    .map((row) => row.tag)
}
