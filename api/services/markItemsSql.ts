import type {ApiDb} from '../types/db'
import {queryAll, queryGet} from '../db/utils/rawQuery'
import {escapeLikePattern} from './globalSearchMerge'

const MARKS_FROM = `
FROM marks
LEFT JOIN tags ON tags.id = marks.tagId
LEFT JOIN media ON media.id = marks.mediaId
`

export type MarkListQueryOptions = {
  types?: Array<number | string>
  search?: string
  sortBy?: string
  sortDir?: string
  limit?: number
  offset?: number
  /** Only marks with a ranged end time (Clip Studio clips). */
  clipsOnly?: boolean
}

function buildMarkTypeSql(
  types: Array<number | string>,
  replacements: Record<string, unknown>,
): string {
  if (!types.length) return '0 = 1'

  const clauses: string[] = []
  if (types.includes('favorite')) {
    clauses.push(`marks.type = 'favorite'`)
  }
  if (types.includes('bookmark')) {
    // Plain bookmarks: type=bookmark and not the chapter icon (null icon counts as bookmark).
    clauses.push(`(
      marks.type = 'bookmark'
      AND COALESCE(marks.icon, 'bookmark') != 'movie-open-outline'
    )`)
  }
  if (types.includes('chapter') || types.includes('scene')) {
    clauses.push(`(
      (marks.type = 'bookmark' AND marks.icon = 'movie-open-outline' AND marks.tagId IS NULL)
      OR (lower(COALESCE(marks.type, '')) = 'scene' AND marks.tagId IS NULL)
    )`)
  }

  const metaIds = [...new Set(
    types
      .map((type) => Number(type))
      .filter((id) => Number.isFinite(id) && id > 0),
  )]
  if (metaIds.length) {
    replacements.markMetaIds = metaIds
    clauses.push(`(marks.type = 'meta' AND tags.metaId IN (:markMetaIds))`)
  }

  return clauses.length ? `(${clauses.join(' OR ')})` : '0 = 1'
}

function buildMarkSearchSql(
  search: string,
  replacements: Record<string, unknown>,
): string | null {
  const trimmed = String(search || '').trim()
  if (!trimmed) return null
  replacements.markSearch = `%${escapeLikePattern(trimmed.toLowerCase())}%`
  return `(
    LOWER(COALESCE(marks.text, '')) LIKE :markSearch ESCAPE '\\'
    OR LOWER(COALESCE(media.name, '')) LIKE :markSearch ESCAPE '\\'
    OR LOWER(COALESCE(media.basename, '')) LIKE :markSearch ESCAPE '\\'
    OR LOWER(COALESCE(tags.name, '')) LIKE :markSearch ESCAPE '\\'
  )`
}

function buildMarkOrderSql(sortBy: string, sortDir: string): string {
  const dir = sortDir === 'asc' ? 'ASC' : 'DESC'
  if (sortBy === 'shuffle') {
    return 'RANDOM()'
  }

  let expr = 'COALESCE(marks.time, 0)'
  switch (sortBy) {
    case 'id':
      expr = 'marks.id'
      break
    case 'type':
      expr = `LOWER(COALESCE(marks.type, ''))`
      break
    case 'videoName':
      expr = `LOWER(COALESCE(media.name, media.basename, ''))`
      break
    case 'tagName':
      expr = `LOWER(COALESCE(tags.name, ''))`
      break
    case 'time':
    default:
      expr = 'COALESCE(marks.time, 0)'
      break
  }

  return `${expr} ${dir}, marks.id ASC`
}

function buildMarkFilterWhere(
  options: MarkListQueryOptions,
  replacements: Record<string, unknown>,
): string {
  const clauses = [
    buildMarkTypeSql(options.types || [], replacements),
  ]
  const searchSql = buildMarkSearchSql(options.search || '', replacements)
  if (searchSql) clauses.push(searchSql)
  if (options.clipsOnly) {
    clauses.push('marks.end IS NOT NULL')
  }
  return clauses.join(' AND ')
}

export function countMarksFiltered(db: ApiDb, options: MarkListQueryOptions = {}): number {
  const replacements: Record<string, unknown> = {}
  const whereSql = buildMarkFilterWhere(options, replacements)
  const row = queryGet<{count: number}>(db, `
    SELECT COUNT(*) AS count
    ${MARKS_FROM}
    WHERE ${whereSql}
  `, replacements)
  return Number(row?.count ?? 0)
}

export function queryMarkPageIds(db: ApiDb, options: MarkListQueryOptions = {}): number[] {
  const replacements: Record<string, unknown> = {
    limit: Math.max(1, Math.min(Number(options.limit) || 24, 100)),
    offset: Math.max(0, Number(options.offset) || 0),
  }
  const whereSql = buildMarkFilterWhere(options, replacements)
  const orderSql = buildMarkOrderSql(
    String(options.sortBy || 'time'),
    String(options.sortDir || 'desc'),
  )
  const rows = queryAll<{id: number}>(db, `
    SELECT marks.id AS id
    ${MARKS_FROM}
    WHERE ${whereSql}
    ORDER BY ${orderSql}
    LIMIT :limit OFFSET :offset
  `, replacements)
  return rows.map((row) => Number(row.id)).filter((id) => Number.isFinite(id))
}

export {
  buildMarkTypeSql,
  buildMarkSearchSql,
  buildMarkOrderSql,
}
