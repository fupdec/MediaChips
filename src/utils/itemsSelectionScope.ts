import type {FilterObject} from '@/types/common'

interface SelectionScope {
  type: string
  environment: unknown
  filters: FilterObject[]
  filtersJoin: string
  find_duplicates: boolean
  duplicates_by: string | null
  listScopeIds: number[] | null
  namePrefix: string | null
  colorFilter: string | null
}

/** Only criteria that change membership; pagination, order and layout are excluded. */
export function itemsSelectionScopeKey(store: SelectionScope): string {
  return JSON.stringify([
    store.type,
    store.environment,
    store.filters.filter(filter => filter.active && !filter.removed).map(filter => [
      filter.param, filter.type, filter.cond, filter.val,
    ]),
    store.filtersJoin,
    store.find_duplicates,
    store.find_duplicates ? store.duplicates_by : null,
    store.listScopeIds,
    store.namePrefix,
    store.colorFilter,
  ])
}
