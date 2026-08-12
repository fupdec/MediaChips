export type FiltersJoinMode = 'and' | 'or'

export function normalizeFiltersJoinMode(value: unknown): FiltersJoinMode {
  return value === 'or' ? 'or' : 'and'
}

export function joinFilterClauses(
  clauses: string[],
  mode: FiltersJoinMode = 'and',
): string {
  if (!clauses.length) return ''
  if (clauses.length === 1) return clauses[0]
  const joiner = mode === 'or' ? ' OR ' : ' AND '
  return `(${clauses.join(joiner)})`
}
