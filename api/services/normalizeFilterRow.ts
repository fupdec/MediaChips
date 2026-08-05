import type {FilterLike} from '../types/db'
import type {TagsByRowIdMap} from '../types/savedFilterMedia'
import {parseCountries} from '../utils/country'
import {normalizeMetaIdParam} from '../utils/metaId'
import {parseExtList} from '../utils/ext'

export function normalizeFilterRow(
  row: FilterLike,
  tagsByRowId: TagsByRowIdMap | null = null,
): FilterLike {
  const normalized: FilterLike = {...row}

  if (normalized.param != null) {
    normalized.param = normalizeMetaIdParam(normalized.param) as FilterLike['param']
  }

  if (normalized.type === 'number' || normalized.type === 'rating') {
    if (normalized.val !== null && normalized.val !== undefined && normalized.val !== '') {
      normalized.val = Number(normalized.val)
    }
  }

  if (typeof normalized.active !== 'undefined') {
    normalized.active = normalized.active === true || normalized.active === 1 || normalized.active === '1'
  }

  if (normalized.type === 'array' && normalized.param !== 'country' && normalized.param !== 'ext') {
    const tags = tagsByRowId?.get(Number(normalized.id)) || []
    normalized.val = tags.map((tag) => tag.tagId)
  } else if (normalized.param === 'country' && normalized.val) {
    normalized.val = parseCountries(String(normalized.val))
  } else if (normalized.param === 'ext' && normalized.val) {
    normalized.val = parseExtList(normalized.val as string | string[] | null | undefined)
  }

  const {...cleaned} = normalized
  return cleaned
}
