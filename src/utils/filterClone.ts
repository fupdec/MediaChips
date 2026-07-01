import type { FilterObject } from '@/types/common'

function cloneFilterValue(val: unknown): unknown {
  if (Array.isArray(val)) return [...val]
  if (val && typeof val === 'object') return {...val as Record<string, unknown>}
  return val
}

export function cloneFilters(filters: FilterObject[] | null | undefined): FilterObject[] {
  if (!filters?.length) return []

  return filters.map((filter) => ({
    ...filter,
    val: cloneFilterValue(filter.val),
  }))
}

export function filtersEqual(
  left: FilterObject[] | null | undefined,
  right: FilterObject[] | null | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? [])
}
