import { cloneFilters } from '@/utils/filterClone'
import type { FilterObject } from '@/types/common'
import type { SavedFilter } from '@/types/stores'

export function cloneItemsStoreFieldValue(field: string, value: unknown): unknown {
  if (field === 'filters') {
    return cloneFilters(value as FilterObject[])
  }

  if (field === 'filters_saved') {
    return (value as SavedFilter[]).map((entry) => ({
      ...entry,
      filters: cloneFilters(entry.filters),
    }))
  }

  if (Array.isArray(value)) {
    return [...value]
  }

  if (value && typeof value === 'object') {
    return {...value as Record<string, unknown>}
  }

  return value
}
