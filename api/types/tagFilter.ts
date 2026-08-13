import type { FilterLike, AnyRecord } from './db'
import type { MediaFilterQueryResult, SqlParamBinder, FilterCondition } from './mediaFilter'

export interface TagFilterOptions {
  metaId?: number | string
  ids?: Array<number | string>
  filters?: FilterLike[]
  find_duplicates?: boolean
  sortBy?: string
  /** How active filter rows combine: all (AND, default) or any (OR). */
  filtersJoin?: 'and' | 'or'
}

export type TagFilterQueryResult = MediaFilterQueryResult

export type { SqlParamBinder, AnyRecord, FilterCondition }
