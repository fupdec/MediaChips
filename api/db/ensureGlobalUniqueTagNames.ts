import type Database from 'better-sqlite3'
import { buildTrashTagName, isTrashTagName } from '../../shared/entityTrash'
import { normalizeTagName } from '../services/tagMoveToCategory'

export const TAGS_NAME_NORMALIZED_UNIQUE_INDEX = 'tags_name_normalized_unique'

export const TAGS_NAME_NORMALIZED_UNIQUE_INDEX_WHERE =
  `"deletedAt" IS NULL OR "deletedAt" = ''`

export type TagNameOwner = {
  name?: unknown
  metaId?: unknown
}

type TagNameRow = {
  id: number
  name: string
  metaId: number | null
}

/**
 * Keep both tags when names collide across categories: the first row keeps the
 * bare name; others become "Name (Category)" (with numeric suffixes if needed).
 * Mutates `.name` in place. Idempotent once names are unique under normalizeTagName.
 */
export function assignUniqueNormalizedTagNames<T extends TagNameOwner>(
  rows: T[],
  metaNameById: Map<number, string>,
): number {
  if (rows.length < 2) return 0

  const groups = new Map<string, number[]>()
  for (let index = 0; index < rows.length; index += 1) {
    const key = normalizeTagName(rows[index]?.name)
    const list = groups.get(key)
    if (list) list.push(index)
    else groups.set(key, [index])
  }

  const taken = new Map<string, number>()
  for (let index = 0; index < rows.length; index += 1) {
    const key = normalizeTagName(rows[index]?.name)
    if (!taken.has(key)) taken.set(key, index)
  }

  let renamed = 0

  for (const [, group] of groups) {
    if (group.length < 2) continue

    const [, ...dupes] = group
    for (const index of dupes) {
      const dupe = rows[index]
      if (!dupe) continue

      const metaId = dupe.metaId == null || dupe.metaId === ''
        ? null
        : Number(dupe.metaId)
      const categoryName = metaId != null && Number.isFinite(metaId)
        ? (metaNameById.get(metaId) || `Category ${metaId}`)
        : 'Uncategorized'
      const baseName = String(dupe.name ?? '').trim() || 'Tag'
      let candidate = `${baseName} (${categoryName})`
      let suffix = 2
      while (true) {
        const key = normalizeTagName(candidate)
        const ownerIndex = taken.get(key)
        if (ownerIndex == null || ownerIndex === index) break
        candidate = `${baseName} (${categoryName}) ${suffix}`
        suffix += 1
      }

      if (candidate === dupe.name) {
        taken.set(normalizeTagName(candidate), index)
        continue
      }

      dupe.name = candidate
      taken.set(normalizeTagName(candidate), index)
      renamed += 1
    }
  }

  return renamed
}

/**
 * Keep both tags when names collide across categories: the lowest id keeps the
 * bare name; others become "Name (Category)" (with numeric suffixes if needed).
 * Idempotent once names are unique under normalizeTagName.
 * Soft-deleted tags are ignored so trash rows cannot rename live names.
 */
export function renameDuplicateTagNames(sqlite: Database.Database): number {
  if (!hasTable(sqlite, 'tags')) return 0

  const rows = sqlite.prepare(selectActiveTagNamesSql(sqlite)).all() as TagNameRow[]

  if (rows.length < 2) return 0

  const metaNameById = new Map<number, string>()
  if (hasTable(sqlite, 'meta')) {
    const metas = sqlite.prepare(`SELECT id, name FROM meta`).all() as Array<{id: number; name: string | null}>
    for (const meta of metas) {
      metaNameById.set(Number(meta.id), String(meta.name ?? '').trim() || `Category ${meta.id}`)
    }
  }

  const originalNames = rows.map((row) => row.name)
  const renamed = assignUniqueNormalizedTagNames(rows, metaNameById)
  if (!renamed) return 0

  const update = sqlite.prepare(
    `UPDATE tags SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
  )

  const run = sqlite.transaction(() => {
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index]
      if (!row || row.name === originalNames[index]) continue
      update.run(row.name, row.id)
    }
  })

  run()
  return renamed
}

/** Move leftover trashed tags off the live name so recreating the original name works. */
export function rewriteTrashedTagNames(sqlite: Database.Database): number {
  if (!hasTable(sqlite, 'tags') || !hasColumn(sqlite, 'tags', 'deletedAt')) return 0

  const hasTrashOriginalName = hasColumn(sqlite, 'tags', 'trashOriginalName')
  const rows = sqlite.prepare(`
    SELECT id, name${hasTrashOriginalName ? ', trashOriginalName' : ''}
    FROM tags
    WHERE deletedAt IS NOT NULL AND deletedAt != ''
  `).all() as Array<{id: number; name: string; trashOriginalName?: string | null}>

  if (!rows.length) return 0

  const update = hasTrashOriginalName
    ? sqlite.prepare(`
        UPDATE tags SET name = ?, trashOriginalName = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
      `)
    : sqlite.prepare(`
        UPDATE tags SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?
      `)

  let rewritten = 0
  const run = sqlite.transaction(() => {
    for (const row of rows) {
      if (isTrashTagName(row.name)) continue
      const originalName = String(row.trashOriginalName || row.name || '')
      const trashName = buildTrashTagName(row.id, originalName)
      if (hasTrashOriginalName) update.run(trashName, originalName || null, row.id)
      else update.run(trashName, row.id)
      rewritten += 1
    }
  })
  run()
  return rewritten
}

export function ensureTagsNameNormalizedUniqueIndex(sqlite: Database.Database): boolean {
  if (!hasTable(sqlite, 'tags')) return false

  rewriteTrashedTagNames(sqlite)

  const wantsPartial = hasColumn(sqlite, 'tags', 'deletedAt')
  const existingSql = getIndexSql(sqlite, TAGS_NAME_NORMALIZED_UNIQUE_INDEX)
  const isPartial = Boolean(existingSql && /deletedAt/i.test(existingSql))
  if (existingSql && (!wantsPartial || isPartial)) return false

  if (existingSql) {
    sqlite.exec(`DROP INDEX IF EXISTS "${TAGS_NAME_NORMALIZED_UNIQUE_INDEX}"`)
  }

  renameDuplicateTagNames(sqlite)
  sqlite.exec(buildTagsNameNormalizedUniqueIndexSql(wantsPartial))
  return true
}

export function buildTagsNameNormalizedUniqueIndexSql(partial: boolean): string {
  const whereClause = partial ? ` WHERE ${TAGS_NAME_NORMALIZED_UNIQUE_INDEX_WHERE}` : ''
  return `CREATE UNIQUE INDEX IF NOT EXISTS "${TAGS_NAME_NORMALIZED_UNIQUE_INDEX}" ON "tags" (lower(trim("name")))${whereClause}`
}

function selectActiveTagNamesSql(sqlite: Database.Database): string {
  if (!hasColumn(sqlite, 'tags', 'deletedAt')) {
    return `SELECT id, name, metaId FROM tags ORDER BY id ASC`
  }
  return `
    SELECT id, name, metaId FROM tags
    WHERE deletedAt IS NULL OR deletedAt = ''
    ORDER BY id ASC
  `
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined
  return Boolean(row)
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  if (!hasTable(sqlite, tableName)) return false
  const columns = sqlite.pragma(`table_info(${tableName})`) as Array<{name: string}>
  return columns.some((column) => column.name === columnName)
}

function getIndexSql(sqlite: Database.Database, indexName: string): string | null {
  const row = sqlite.prepare(
    `SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`,
  ).get(indexName) as {sql: string | null} | undefined
  return row?.sql ?? null
}
