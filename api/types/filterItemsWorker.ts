import type { FilterLike } from './db'
import type { ParsedItem } from '../../app/types/items'

export interface FilterItemsWorkerRequest {
  filters: FilterLike[]
  itemType: string
  items: ParsedItem[]
  sortBy: string
  direction: string
  find_duplicates: boolean
  duplicates_by?: string
  sortMetaType?: string | null
}

export interface FilterItemsWorkerSuccess {
  ok: true
  items: ParsedItem[]
  totalFiltered: number
  totalFilesize: number
}

export interface FilterItemsWorkerFailure {
  ok: false
  error: string
}

export type FilterItemsWorkerResponse = FilterItemsWorkerSuccess | FilterItemsWorkerFailure
