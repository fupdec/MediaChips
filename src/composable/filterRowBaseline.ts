import type {InjectionKey, Ref} from 'vue'
import isEqual from 'lodash/isEqual'
import type {FilterObject} from '@/types/common'

export interface FilterRowBaseline {
  cond: string | null
  val: unknown
}

export type FilterRowBaselines = Record<string, FilterRowBaseline>

/** Last applied (or loaded) state of every saved row, so edits can be offered for undo. */
export const FILTER_ROW_BASELINE_KEY: InjectionKey<Ref<FilterRowBaselines>> = Symbol('filterRowBaseline')

const normalizeValue = (val: unknown): unknown => {
  if (val == null || val === '') return null
  if (Array.isArray(val) && val.length === 0) return null
  return val
}

export const buildFilterBaselines = (filters: FilterObject[]): FilterRowBaselines => {
  const result: FilterRowBaselines = {}
  for (const filter of filters) {
    const key = String(filter.id ?? filter.clientKey ?? '')
    if (!key) continue
    result[key] = {
      cond: filter.cond ?? null,
      val: JSON.parse(JSON.stringify(filter.val ?? null)),
    }
  }
  return result
}

export const isFilterRowModified = (filter: FilterObject, baseline: FilterRowBaseline | undefined): boolean => {
  if (!baseline) return false
  if ((filter.cond ?? null) !== baseline.cond) return true
  return !isEqual(normalizeValue(filter.val), normalizeValue(baseline.val))
}
