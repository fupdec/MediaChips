import type {FilterLike} from '../types/db'
import type {FilterCondition, SqlParamBinder} from '../types/mediaFilter'
import {
  buildDateComparison,
  buildStringComparison,
  compareNumberSql,
} from './filterSqlCompare'

/** Boolean meta values stored as strings (empty = false). */
export function buildBooleanMetaValueClause(
  valueColumn: string,
  cond: FilterCondition,
): string {
  if (cond === '!=') {
    return `NOT (COALESCE(${valueColumn}, '') IN ('1', 1, 'true', 'TRUE'))`
  }
  return `COALESCE(${valueColumn}, '') IN ('1', 1, 'true', 'TRUE')`
}

/** Boolean entity columns stored as integers (0 = false). */
export function buildBooleanEntityColumnClause(
  columnExpr: string,
  cond: FilterCondition,
): string {
  if (cond === '!=') {
    return `NOT (COALESCE(${columnExpr}, 0) IN (1, '1', 'true', 'TRUE'))`
  }
  return `COALESCE(${columnExpr}, 0) IN (1, '1', 'true', 'TRUE')`
}

/** Typed comparisons for a meta value subquery / expression. */
export function buildTypedMetaValueClause(
  valueColumn: string,
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {type, cond, val} = filter

  if (type === 'boolean') {
    return buildBooleanMetaValueClause(valueColumn, cond)
  }

  if (type === 'date') {
    const clause = buildDateComparison(valueColumn, cond, val, nextParam)
    return clause ? `(${clause})` : null
  }

  if (type === 'number' || type === 'rating') {
    if (val === null || val === undefined || val === '') return '0 = 1'
    const valueKey = nextParam(val)
    const clause = compareNumberSql(
      `CAST(${valueColumn} AS REAL)`,
      cond,
      valueKey,
    )
    return clause
      ? `(${valueColumn} IS NOT NULL AND ${valueColumn} != '' AND ${clause})`
      : null
  }

  if (type === 'string') {
    const clause = buildStringComparison(valueColumn, cond, val, nextParam)
    return clause ? `(${clause})` : null
  }

  // Unknown / legacy meta types (text, url, …): treat as string so saved filters stay on SQL.
  const clause = buildStringComparison(valueColumn, cond, val, nextParam)
  return clause ? `(${clause})` : null
}

/** Typed comparisons for entity columns (media.* / tags.*). */
export function buildTypedEntityColumnClause(
  columnExpr: string,
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {type, cond, val} = filter

  if (type === 'boolean') {
    return buildBooleanEntityColumnClause(columnExpr, cond)
  }

  if (type === 'date') {
    const clause = buildDateComparison(columnExpr, cond, val, nextParam)
    return clause || null
  }

  if (type === 'number' || type === 'rating') {
    if (val === null || val === undefined || val === '') return '0 = 1'
    const valueKey = nextParam(val)
    const clause = compareNumberSql(columnExpr, cond, valueKey)
    return clause
      ? `(${columnExpr} IS NOT NULL AND ${columnExpr} != '' AND ${clause})`
      : null
  }

  if (type === 'string') {
    const clause = buildStringComparison(columnExpr, cond, val, nextParam)
    return clause || null
  }

  // Unknown column filter types: same string semantics (keeps SQL path).
  return buildStringComparison(columnExpr, cond, val, nextParam) || null
}
