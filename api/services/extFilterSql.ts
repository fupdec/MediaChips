import type {FilterLike} from '../types/db'
import type {SqlParamBinder} from '../types/mediaFilter'
import {parseExtList} from '../utils/ext'

/** Extension array filter against media.ext. */
export function buildExtArrayClause(
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {cond, val} = filter
  const exts = parseExtList(val as string | string[] | null | undefined)

  if (cond === 'is null') {
    return `(media.ext IS NULL OR media.ext = '')`
  }
  if (cond === 'not null') {
    return `(media.ext IS NOT NULL AND media.ext != '')`
  }
  if (!exts.length) {
    if (cond === 'in' || cond === 'in all') return '0 = 1'
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') {
      return `(media.ext IS NOT NULL AND media.ext != '')`
    }
    return null
  }

  const extKeys = exts.map((ext: unknown) => nextParam(ext))
  const listExpr = extKeys.join(', ')
  const columnExpr = `LOWER(media.ext)`

  switch (cond) {
    case 'in':
      return `${columnExpr} IN (${listExpr})`
    case 'not in':
      return `(${columnExpr} NOT IN (${listExpr}) OR media.ext IS NULL OR media.ext = '')`
    case 'in all':
      if (exts.length === 1) return `${columnExpr} IN (${listExpr})`
      return '0 = 1'
    case 'not in all':
      if (exts.length === 1) {
        return `(${columnExpr} != ${extKeys[0]} OR media.ext IS NULL OR media.ext = '')`
      }
      return `(${columnExpr} NOT IN (${listExpr}) OR media.ext IS NULL OR media.ext = '')`
    default:
      return null
  }
}
