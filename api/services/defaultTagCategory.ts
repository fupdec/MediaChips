import type Database from 'better-sqlite3'

export const DEFAULT_TAG_CATEGORY_SETTING = 'defaultTagCategoryId'

type ArrayMetaRow = {
  id: number
  name: string | null
  parser: number | boolean | null
}

function normalizeName(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName) as {name: string} | undefined
  return Boolean(row)
}

function findHeuristicDefaultTagCategoryId(rows: ArrayMetaRow[]): number | null {
  if (!rows.length) return null

  const parser = rows.find((row) => Boolean(row.parser))
  if (parser) return Number(parser.id)

  const named = rows.find((row) => normalizeName(row.name) === 'tags')
  if (named) return Number(named.id)

  return Number(rows[0].id)
}

/** Prefer configured setting, then parser-enabled Tags, then name "tags", then first array. */
export function findDefaultTagCategoryId(sqlite: Database.Database): number | null {
  if (!hasTable(sqlite, 'meta')) return null

  const rows = sqlite.prepare(
    `SELECT id, name, parser FROM meta WHERE type = 'array' ORDER BY id ASC`,
  ).all() as ArrayMetaRow[]

  if (!rows.length) return null

  if (hasTable(sqlite, 'settings')) {
    const configured = sqlite.prepare(
      `SELECT value FROM settings WHERE option = ? LIMIT 1`,
    ).get(DEFAULT_TAG_CATEGORY_SETTING) as {value: string | null} | undefined
    const configuredId = Number(configured?.value)
    if (Number.isFinite(configuredId) && configuredId > 0) {
      const match = rows.find((row) => Number(row.id) === configuredId)
      if (match) return Number(match.id)
    }
  }

  return findHeuristicDefaultTagCategoryId(rows)
}
