import type {ApiDb} from '../types/db'
import {queryAll} from '../db/utils/rawQuery'
import {escapeLikePattern} from './globalSearchMerge'

export function resolveAssistantToolQuery(args: Record<string, unknown>): string {
  return String(args.query || args.q || '')
}

export function clampAssistantToolLimit(
  value: unknown,
  {max, fallback}: {max: number; fallback: number},
): number {
  const raw = Number(value)
  if (!Number.isFinite(raw)) return fallback
  return Math.min(max, Math.max(1, Math.round(raw) || fallback))
}

export function filterMediaRowsByQuery<T extends {name?: string | null; path?: string | null}>(
  rows: T[],
  query: string,
  limit: number,
): T[] {
  const normalized = String(query || '').trim().toLowerCase()
  if (!normalized) return []
  return rows
    .filter((row) => {
      const hay = `${row.name || ''} ${row.path || ''}`.toLowerCase()
      return hay.includes(normalized)
    })
    .slice(0, limit)
}

export function filterTagRowsByQuery<T extends {name?: string | null}>(
  rows: T[],
  query: string,
  limit: number,
): T[] {
  const normalized = String(query || '').trim().toLowerCase()
  return rows
    .filter((row) => !normalized || String(row.name || '').toLowerCase().includes(normalized))
    .slice(0, limit)
}

export type AssistantMediaHit = {id: number; name: string | null; path: string | null}
export type AssistantTagHit = {id: number; name: string | null; metaId: number | null}

/** SQL-limited media search (name/path substring). Empty query → []. */
export function searchMediaRowsByQuery(
  db: ApiDb,
  query: string,
  limit: number,
): AssistantMediaHit[] {
  const trimmed = String(query || '').trim()
  if (!trimmed) return []
  const pattern = `%${escapeLikePattern(trimmed)}%`
  return queryAll<AssistantMediaHit>(db, `
    SELECT id, name, path
    FROM media
    WHERE name LIKE :pattern ESCAPE '\\'
       OR path LIKE :pattern ESCAPE '\\'
    LIMIT :limit
  `, {pattern, limit})
}

/** SQL-limited tag listing; optional name substring. Empty query → first N rows. */
export function searchTagRowsByQuery(
  db: ApiDb,
  query: string,
  limit: number,
): AssistantTagHit[] {
  const trimmed = String(query || '').trim()
  if (!trimmed) {
    return queryAll<AssistantTagHit>(db, `
      SELECT id, name, metaId
      FROM tags
      LIMIT :limit
    `, {limit})
  }
  const pattern = `%${escapeLikePattern(trimmed)}%`
  return queryAll<AssistantTagHit>(db, `
    SELECT id, name, metaId
    FROM tags
    WHERE name LIKE :pattern ESCAPE '\\'
    LIMIT :limit
  `, {pattern, limit})
}

export function projectMetaRowsForAssistant<T extends {
  id?: unknown
  name?: string | null
  type?: string | null
}>(rows: T[], limit = 100): Array<{id: unknown; name: string | null | undefined; type: string | null | undefined}> {
  return rows.slice(0, limit).map((row) => ({
    id: row.id,
    name: row.name,
    type: row.type,
  }))
}
