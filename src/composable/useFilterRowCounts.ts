import {onUnmounted, ref, watch} from 'vue'
import type {InjectionKey, Ref} from 'vue'
import {typedApi} from '@/services/typedApi'
import type {FilterObject} from '@/types/common'

export interface FilterRowCount {
  matched: number
  total: number
}

export type FilterRowCounts = Record<string, FilterRowCount>

export interface FilterRowCountsContext {
  url: string
  mediaTypeId?: number
  metaId?: number
}

export const FILTER_ROW_COUNTS_KEY: InjectionKey<Ref<FilterRowCounts>> = Symbol('filterRowCounts')

export const filterRowKey = (filter: FilterObject): string => String(filter.id ?? filter.clientKey ?? '')

const DEBOUNCE_MS = 450
const VALUELESS_CONDITIONS = ['is null', 'not null']

const hasUsableValue = (filter: FilterObject): boolean => {
  if (filter.type === 'boolean') return true
  if (VALUELESS_CONDITIONS.includes(String(filter.cond ?? ''))) return true
  const val = filter.val
  if (Array.isArray(val)) return val.length > 0
  return val != null && val !== ''
}

const isCountable = (filter: FilterObject): boolean =>
  Boolean(filter.active) && !filter.removed && Boolean(filter.cond) && hasUsableValue(filter)

const signatureOf = (filter: FilterObject): string =>
  JSON.stringify([filter.param, filter.type, filter.cond, filter.val, filter.metaId ?? null])

/**
 * Counts how many items each active filter row matches on its own, so the user can see
 * which condition narrows the list the most. Runs only while `enabled` is true.
 */
export function useFilterRowCounts(
  filters: Ref<FilterObject[]>,
  context: Ref<FilterRowCountsContext | null>,
  enabled: Ref<boolean>,
) {
  const counts = ref<FilterRowCounts>({})
  const cache = new Map<string, FilterRowCount>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let runId = 0

  const run = async () => {
    const ctx = context.value
    const myRun = ++runId
    if (!ctx || !enabled.value) return

    const rows = filters.value.filter(isCountable)
    const next: FilterRowCounts = {}

    for (const row of rows) {
      if (myRun !== runId) return
      const cacheKey = JSON.stringify([ctx.url, ctx.mediaTypeId ?? null, ctx.metaId ?? null, signatureOf(row)])
      let result = cache.get(cacheKey)
      if (!result) {
        try {
          const response = await typedApi.postItemsList(ctx.url, {
            ...(ctx.mediaTypeId != null ? {mediaTypeId: ctx.mediaTypeId} : {}),
            ...(ctx.metaId != null ? {metaId: ctx.metaId} : {}),
            filters: [{...row, active: true, removed: false}],
            filtersJoin: 'and',
            sortBy: 'id',
            direction: 'desc',
            find_duplicates: false,
            ids: [],
            page: 1,
            limit: 1,
            includeNavigation: false,
          })
          const matched = Number(response.data.totalFiltered)
          const total = Number(response.data.total)
          if (!Number.isFinite(matched)) continue
          result = {matched, total: Number.isFinite(total) ? total : matched}
          cache.set(cacheKey, result)
        } catch {
          continue
        }
      }
      if (myRun !== runId) return
      next[filterRowKey(row)] = result
      counts.value = {...counts.value, [filterRowKey(row)]: result}
    }

    if (myRun === runId) counts.value = next
  }

  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(run, DEBOUNCE_MS)
  }

  watch(
    () => [
      enabled.value,
      JSON.stringify(context.value),
      filters.value.filter(isCountable).map((row) => [filterRowKey(row), signatureOf(row)]),
    ],
    schedule,
    {deep: true, immediate: true},
  )

  onUnmounted(() => {
    runId += 1
    if (timer) clearTimeout(timer)
  })

  return counts
}
