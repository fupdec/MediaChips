import type Database from 'better-sqlite3'
import { normalizeTagName } from './tagMoveToCategory'

export class TagNameConflictError extends Error {
  status = 409
  code = 'name_conflict' as const
  conflictingTagId: number | null

  constructor(message: string, conflictingTagId: number | null = null) {
    super(message)
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
  throw new TagNameConflictError(
    `Tag name "${String(name).trim()}" already exists`,
    conflictingTagId,
  )
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
