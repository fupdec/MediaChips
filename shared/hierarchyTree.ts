export const MAX_TAG_TREE_DEPTH = 8
export const MAX_META_TREE_DEPTH = 3

export type HierarchyParentMap = Map<number, number | null>
export type HierarchyChildrenMap = Map<number, number[]>

export function normalizeParentId(value: unknown): number | null {
  if (value == null || value === '' || value === false) return null
  const id = Number(value)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

export function buildParentMap(
  rows: Array<{id: number; parentId?: number | null}>,
): HierarchyParentMap {
  const map: HierarchyParentMap = new Map()
  for (const row of rows) {
    map.set(row.id, normalizeParentId(row.parentId))
  }
  return map
}

export function buildChildrenMap(parentById: HierarchyParentMap): HierarchyChildrenMap {
  const children: HierarchyChildrenMap = new Map()
  for (const [id, parentId] of parentById) {
    if (parentId == null) continue
    const list = children.get(parentId) ?? []
    list.push(id)
    children.set(parentId, list)
  }
  return children
}

export function ancestorIds(
  id: number,
  parentById: HierarchyParentMap,
  limit = 64,
): number[] {
  const chain: number[] = []
  const seen = new Set<number>([id])
  let current = parentById.get(id) ?? null
  while (current != null && chain.length < limit) {
    if (seen.has(current)) break
    chain.push(current)
    seen.add(current)
    current = parentById.has(current) ? (parentById.get(current) ?? null) : null
  }
  return chain
}

export function wouldCreateCycle(
  id: number,
  newParentId: number | null,
  parentById: HierarchyParentMap,
): boolean {
  if (newParentId == null) return false
  if (newParentId === id) return true
  return ancestorIds(newParentId, parentById).includes(id)
}

export function collectDescendantIds(
  id: number,
  childrenByParent: HierarchyChildrenMap,
): number[] {
  const result: number[] = []
  const stack = [...(childrenByParent.get(id) ?? [])]
  const seen = new Set<number>()
  while (stack.length) {
    const next = stack.pop()!
    if (seen.has(next)) continue
    seen.add(next)
    result.push(next)
    const kids = childrenByParent.get(next)
    if (kids?.length) stack.push(...kids)
  }
  return result
}

export function collectSubtreeIds(
  ids: number[],
  childrenByParent: HierarchyChildrenMap,
): number[] {
  const result = new Set<number>()
  for (const id of ids) {
    if (!Number.isFinite(id) || id <= 0) continue
    result.add(id)
    for (const child of collectDescendantIds(id, childrenByParent)) {
      result.add(child)
    }
  }
  return [...result]
}

export function nodeDepth(id: number, parentById: HierarchyParentMap): number {
  return ancestorIds(id, parentById).length
}

export function subtreeHeight(id: number, childrenByParent: HierarchyChildrenMap): number {
  const kids = childrenByParent.get(id)
  if (!kids?.length) return 0
  let max = 0
  for (const child of kids) {
    max = Math.max(max, 1 + subtreeHeight(child, childrenByParent))
  }
  return max
}

export function breadcrumbIds(id: number, parentById: HierarchyParentMap): number[] {
  return [...ancestorIds(id, parentById).reverse(), id]
}

export type ForestNode<T> = {
  id: number
  node: T
  depth: number
  children: ForestNode<T>[]
}

export function buildForest<T>(
  rows: T[],
  getId: (row: T) => number,
  getParentId: (row: T) => number | null,
): ForestNode<T>[] {
  const byId = new Map<number, T>()
  const parentById: HierarchyParentMap = new Map()
  for (const row of rows) {
    const id = getId(row)
    byId.set(id, row)
    parentById.set(id, normalizeParentId(getParentId(row)))
  }

  const childrenByParent = buildChildrenMap(parentById)
  const makeNode = (id: number, depth: number): ForestNode<T> => ({
    id,
    node: byId.get(id)!,
    depth,
    children: (childrenByParent.get(id) ?? [])
      .filter((childId) => byId.has(childId))
      .map((childId) => makeNode(childId, depth + 1)),
  })

  const roots: ForestNode<T>[] = []
  for (const row of rows) {
    const id = getId(row)
    const parentId = parentById.get(id) ?? null
    if (parentId == null || !byId.has(parentId)) {
      roots.push(makeNode(id, 0))
    }
  }
  return roots
}

export function flattenForest<T>(forest: ForestNode<T>[]): ForestNode<T>[] {
  const out: ForestNode<T>[] = []
  const walk = (nodes: ForestNode<T>[]) => {
    for (const node of nodes) {
      out.push(node)
      if (node.children.length) walk(node.children)
    }
  }
  walk(forest)
  return out
}
