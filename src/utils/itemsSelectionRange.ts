/** Contiguous id range between two entity ids (inclusive), by list order. */
export function selectContiguousEntityIds(
  entities: Array<{id: number}>,
  fromId: number,
  toId: number,
): number[] {
  const indexFrom = entities.findIndex((item) => item.id === fromId)
  const indexTo = entities.findIndex((item) => item.id === toId)
  if (indexFrom < 0 || indexTo < 0) return [toId]
  const start = Math.min(indexFrom, indexTo)
  const end = Math.max(indexFrom, indexTo)
  return entities.slice(start, end + 1).map((item) => item.id)
}

/** Replace only this page's selection, retaining IDs selected on other pages. */
export function replacePageSelection(selected: number[], page: Array<{id: number}>, ids: number[]): number[] {
  const pageIds = new Set(page.map(item => item.id))
  return [...new Set([...selected.filter(id => !pageIds.has(id)), ...ids])]
}
