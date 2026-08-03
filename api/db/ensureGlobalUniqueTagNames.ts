import type Database from 'better-sqlite3'
import { normalizeTagName } from '../services/tagMoveToCategory'

export const TAGS_NAME_NORMALIZED_UNIQUE_INDEX = 'tags_name_normalized_unique'

type TagNameRow = {
  id: number
  name: string
  metaId: number | null
}

/**
 * Keep both tags when names collide across categories: the lowest id keeps the
 * bare name; others become "Name (Category)" (with numeric suffixes if needed).
 * Idempotent once names are unique under normalizeTagName.
 */
export function renameDuplicateTagNames(sqlite: Database.Database): number {
  if (!hasTable(sqlite, 'tags')) return 0

  const rows = sqlite.prepare(
    `SELECT id, name, metaId FROM tags ORDER BY id ASC`,
  ).all() as TagNameRow[]

  if (rows.length < 2) return 0

  const metaNameById = new Map<number, string>()
  if (hasTable(sqlite, 'meta')) {
    const metas = sqlite.prepare(`SELECT id, name FROM meta`).all() as Array<{id: number; name: string | null}>
    for (const meta of metas) {
      metaNameById.set(Number(meta.id), String(meta.name ?? '').trim() || `Category ${meta.id}`)
    }
  }

  const groups = new Map<string, TagNameRow[]>()
  for (const row of rows) {
    const key = normalizeTagName(row.name)
    if (!key) continue
    const list = groups.get(key)
    if (list) list.push(row)
    else groups.set(key, [row])
  }

  const taken = new Map<string, number>()
  for (const row of rows) {
    const key = normalizeTagName(row.name)
    if (!key) continue
    if (!taken.has(key)) taken.set(key, row.id)
  }

  const update = sqlite.prepare(
    `UPDATE tags SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`,
  )

  let renamed = 0

  const run = sqlite.transaction(() => {
    for (const [, group] of groups) {
      if (group.length < 2) continue

      const [, ...dupes] = group
      for (const dupe of dupes) {
        const categoryName = dupe.metaId != null
          ? (metaNameById.get(Number(dupe.metaId)) || `Category ${dupe.metaId}`)
          : 'Uncategorized'
        const baseName = String(dupe.name ?? '').trim() || 'Tag'
        let candidate = `${baseName} (${categoryName})`
        let suffix = 2
        while (true) {
          const key = normalizeTagName(candidate)
          const ownerId = taken.get(key)
          if (!ownerId || ownerId === dupe.id) break
          candidate = `${baseName} (${categoryName}) ${suffix}`
          suffix += 1
        }

        if (candidate === dupe.name) {
          taken.set(normalizeTagName(candidate), dupe.id)
          continue
        }

        update.run(candidate, dupe.id)
        taken.set(normalizeTagName(candidate), dupe.id)
        renamed += 1
      }
    }
  })

  run()
  return renamed
}

export function ensureTagsNameNormalizedUniqueIndex(sqlite: Database.Database): boolean {
  if (!hasTable(sqlite, 'tags')) return false
  if (hasIndex(sqlite, TAGS_NAME_NORMALIZED_UNIQUE_INDEX)) return false

  renameDuplicateTagNames(sqlite)
  sqlite.exec(
    `CREATE UNIQUE INDEX IF NOT EXISTS "${TAGS_NAME_NORMALIZED_UNIQUE_INDEX}" ON "tags" (lower(trim("name")))`,
  )
  return true
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined
  return Boolean(row)
}

function hasIndex(sqlite: Database.Database, indexName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`,
  ).get(indexName) as {name: string} | undefined
  return Boolean(row)
}
