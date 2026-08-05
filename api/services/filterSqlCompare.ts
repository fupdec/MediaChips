import type {FilterCondition, SqlParamBinder} from '../types/mediaFilter'
import {buildFolderPathLikePatterns} from '../utils/watcherFolderPaths'

export function compareNumberSql(
  columnExpr: string,
  cond: FilterCondition,
  valueKey: string,
): string | null {
  const valueExpr = `CAST(${columnExpr} AS REAL)`
  switch (cond) {
    case 'equal':
    case '=':
      return `${valueExpr} = CAST(${valueKey} AS REAL)`
    case 'not equal':
    case '!==':
      return `${valueExpr} != CAST(${valueKey} AS REAL)`
    case 'greater than':
    case '>':
      return `${valueExpr} > CAST(${valueKey} AS REAL)`
    case 'less than':
    case '<':
      return `${valueExpr} < CAST(${valueKey} AS REAL)`
    case 'greater than or equal':
    case '>=':
      return `${valueExpr} >= CAST(${valueKey} AS REAL)`
    case 'less than or equal':
    case '<=':
      return `${valueExpr} <= CAST(${valueKey} AS REAL)`
    default:
      return null
  }
}

export function buildDateComparison(
  columnExpr: string,
  cond: FilterCondition,
  value: unknown,
  nextParam: SqlParamBinder,
): string | null {
  const valueKey = nextParam(value)
  const columnTime = `CAST(strftime('%s', ${columnExpr}) AS INTEGER)`
  const filterTime = `CAST(strftime('%s', ${valueKey}) AS INTEGER)`

  switch (cond) {
    case 'equal':
    case '=':
      return `${columnTime} = ${filterTime}`
    case 'not equal':
    case '!==':
      return `${columnTime} != ${filterTime}`
    case 'greater than':
    case '>':
      return `${columnTime} > ${filterTime}`
    case 'less than':
    case '<':
      return `${columnTime} < ${filterTime}`
    case 'greater than or equal':
    case '>=':
      return `${columnTime} >= ${filterTime}`
    case 'less than or equal':
    case '<=':
      return `${columnTime} <= ${filterTime}`
    default:
      return null
  }
}

export function stringFilterValue(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? '')
  return String(val ?? '')
}

export function buildStringComparison(
  columnExpr: string,
  cond: FilterCondition,
  val: unknown,
  nextParam: SqlParamBinder,
): string | null {
  if (cond === 'is null') {
    return `(${columnExpr} IS NULL OR ${columnExpr} = '')`
  }
  if (cond === 'not null') {
    return `(${columnExpr} IS NOT NULL AND ${columnExpr} != '')`
  }
  if (cond === 'regex') {
    const patternKey = nextParam(stringFilterValue(val))
    return `regexp(${patternKey}, ${columnExpr})`
  }

  if (cond === 'equal' || cond === '=') {
    const valueKey = nextParam(stringFilterValue(val))
    return `LOWER(${columnExpr}) = LOWER(${valueKey})`
  }
  if (cond === 'not equal' || cond === '!==') {
    const valueKey = nextParam(stringFilterValue(val))
    return `(${columnExpr} IS NULL OR LOWER(${columnExpr}) != LOWER(${valueKey}))`
  }

  if (cond === 'under folder') {
    const patterns = buildFolderPathLikePatterns(stringFilterValue(val))
    if (!patterns.length) return '0 = 1'
    const clauses = patterns.map((pattern) => `${columnExpr} LIKE ${nextParam(pattern)}`)
    return `(${clauses.join(' OR ')})`
  }

  if (cond === 'starts with') {
    const prefix = stringFilterValue(val).toLowerCase().trim()
    if (!prefix) return '0 = 1'
    const patternKey = nextParam(`${prefix}%`)
    return `LOWER(${columnExpr}) LIKE ${patternKey}`
  }

  const normalized = stringFilterValue(val).toLowerCase().trim()
  const patternKey = nextParam(`%${normalized}%`)

  if (cond === 'includes' || cond === 'like') {
    return `LOWER(${columnExpr}) LIKE ${patternKey}`
  }
  if (cond === 'excludes' || cond === 'not like') {
    return `(${columnExpr} IS NULL OR LOWER(${columnExpr}) NOT LIKE ${patternKey})`
  }

  return null
}
