import type Database from 'better-sqlite3'
import { HttpError } from '../types/errors'
import { normalizeTagName } from './tagMoveToCategory'

export class TagNameConflictError extends HttpError {
  code = 'name_conflict' as const
  conflictingTagId: number | null

  constructor(message: string, conflictingTagId: number | null = null) {
    super(409, message, {code: 'name_conflict', conflictingTagId})
    this.name = 'TagNameConflictError'
    this.conflictingTagId = conflictingTagId
  }
}

export function findTagIdByNormalizedName(
  sqlite: Database.Database,
  name: string,
  excludeTagId?: number | null,
): number | null {
  const key = normalizeTagName(name)
  if (!key) return null

  const row = sqlite.prepare(`
    SELECT id FROM tags
    WHERE lower(trim(name)) = ?
      AND (? IS NULL OR id != ?)
      AND (deletedAt IS NULL OR deletedAt = '')
    LIMIT 1
  `).get(key, excludeTagId ?? null, excludeTagId ?? null) as {id: number} | undefined

  return row?.id ?? null
}

export function assertTagNameAvailable(
  sqlite: Database.Database,
  name: string,
  excludeTagId?: number | null,
): void {
  const conflictingTagId = findTagIdByNormalizedName(sqlite, name, excludeTagId)
  if (conflictingTagId == null) return

  const row = sqlite.prepare(`
    SELECT t.name, m.name AS metaName
    FROM tags t
    LEFT JOIN meta m ON m.id = t.metaId
    WHERE t.id = ?
  `).get(conflictingTagId) as {name: string | null; metaName: string | null} | undefined

  const existingName = String(row?.name || name).trim()
  const categorySuffix = row?.metaName
    ? ` in “${String(row.metaName).trim()}”`
    : ''
  throw new TagNameConflictError(
    `Tag name “${existingName}” already exists${categorySuffix}`,
    conflictingTagId,
  )
}

export class TagNameInTrashError extends HttpError {
  code = 'name_in_trash' as const
  tags: TrashedTagConflictTag[]
  ids: number[]

  constructor(matches: TrashedTagNameMatch[]) {
    const summary = summarizeTrashedNameMatches(matches)
    const names = summary.newest.map((match) => match.originalName)
    const label = names.length === 1 ? names[0] : names.join(', ')
    super(409, `Tag name "${label}" is in Trash`, {
      code: 'name_in_trash',
      tags: summary.tags,
      ids: summary.ids,
    })
    this.name = 'TagNameInTrashError'
    this.tags = summary.tags
    this.ids = summary.ids
  }
}

export type TrashedTagNameMatch = {
  id: number
  name: string
  originalName: string
  metaId: number | null
  deletedAt: string
}

export type TrashedTagConflictTag = {
  id: number
  name: string
  metaId: number | null
  deletedAt: string
}

export function summarizeTrashedNameMatches(matches: TrashedTagNameMatch[]): {
  newest: TrashedTagNameMatch[]
  extraIds: number[]
  ids: number[]
  tags: TrashedTagConflictTag[]
} {
  const newest: TrashedTagNameMatch[] = []
  const extraIds: number[] = []
  const seen = new Set<string>()

  const sorted = [...matches].sort((left, right) => {
    const byDate = String(right.deletedAt || '').localeCompare(String(left.deletedAt || ''))
    return byDate !== 0 ? byDate : right.id - left.id
  })

  for (const match of sorted) {
    const key = normalizeTagName(match.originalName)
    if (!key) continue
    if (seen.has(key)) {
      extraIds.push(match.id)
      continue
    }
    seen.add(key)
    newest.push(match)
  }

  return {
    newest,
    extraIds,
    ids: [...new Set(matches.map((match) => match.id))],
    tags: newest.map((match) => ({
      id: match.id,
      name: match.originalName,
      metaId: match.metaId,
      deletedAt: match.deletedAt,
    })),
  }
}

export function findTrashedTagsByNormalizedNames(
  sqlite: Database.Database,
  names: string[],
): TrashedTagNameMatch[] {
  const keys = [...new Set(names.map((name) => normalizeTagName(name)).filter(Boolean))]
  if (!keys.length) return []

  const stmt = sqlite.prepare(`
    SELECT id, name, trashOriginalName, metaId, deletedAt
    FROM tags
    WHERE deletedAt IS NOT NULL AND deletedAt != ''
      AND (
        lower(trim(COALESCE(trashOriginalName, ''))) = ?
        OR (
          (trashOriginalName IS NULL OR trashOriginalName = '')
          AND lower(trim(name)) = ?
        )
      )
  `)

  const byId = new Map<number, TrashedTagNameMatch>()
  for (const key of keys) {
    const rows = stmt.all(key, key) as Array<{
      id: number
      name: string | null
      trashOriginalName: string | null
      metaId: number | null
      deletedAt: string | null
    }>
    for (const row of rows) {
      const originalName = String(row.trashOriginalName || row.name || '').trim()
      if (!originalName) continue
      byId.set(row.id, {
        id: row.id,
        name: String(row.name || ''),
        originalName,
        metaId: row.metaId == null ? null : Number(row.metaId),
        deletedAt: String(row.deletedAt || ''),
      })
    }
  }

  return [...byId.values()]
}

export function assertTagNamesAvailable(
  sqlite: Database.Database,
  names: string[],
): void {
  const seen = new Set<string>()
  for (const name of names) {
    const key = normalizeTagName(name)
    if (!key) continue
    if (seen.has(key)) {
      throw new TagNameConflictError(`Duplicate tag name "${String(name).trim()}" in request`)
    }
    seen.add(key)
    assertTagNameAvailable(sqlite, name)
  }
}
