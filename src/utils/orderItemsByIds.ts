/** Stable reorder of items to match the given id order (unknown ids stay at end). */
export function orderItemsByIds<T extends {id?: number | string | null}>(
  items: T[],
  ids: number[],
): T[] {
  if (!items.length || !ids.length) return items

  const byId = new Map<number, T>()
  for (const item of items) {
    const id = Number(item.id)
    if (!Number.isFinite(id)) continue
    if (!byId.has(id)) byId.set(id, item)
  }

  const ordered: T[] = []
  const seen = new Set<number>()
  for (const id of ids) {
    const item = byId.get(Number(id))
    if (!item || seen.has(Number(id))) continue
    seen.add(Number(id))
    ordered.push(item)
  }

  for (const item of items) {
    const id = Number(item.id)
    if (!Number.isFinite(id) || seen.has(id)) continue
    seen.add(id)
    ordered.push(item)
  }

  return ordered
}
