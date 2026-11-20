import type Database from 'better-sqlite3'

const COUNTRY_DELIMITER = '\x1E'

/** Country names that were renamed in the country list: old name -> new name. */
export const RENAMED_COUNTRIES: Record<string, string> = {
  'Serbia and Montenegro': 'Serbia',
}

function hasTable(sqlite: Database.Database, tableName: string): boolean {
  return Boolean(sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`,
  ).get(tableName))
}

function hasColumn(sqlite: Database.Database, tableName: string, columnName: string): boolean {
  const columns = sqlite.pragma(`table_info(${tableName})`) as Array<{name: string}>
  return columns.some((column) => column.name === columnName)
}

/** Replaces renamed country names in a stored value (\x1E-separated or legacy comma-joined). */
export function renameStoredCountries(stored: string): string {
  if (stored.includes(COUNTRY_DELIMITER)) {
    return stored
      .split(COUNTRY_DELIMITER)
      .map((name) => RENAMED_COUNTRIES[name] ?? name)
      .join(COUNTRY_DELIMITER)
  }

  let result = stored
  for (const [from, to] of Object.entries(RENAMED_COUNTRIES)) {
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(`(^|,)${escaped}(?=,|$)`, 'g'), `$1${to}`)
  }
  return result
}

function renameInColumn(
  sqlite: Database.Database,
  table: string,
  column: string,
  where: string,
): number {
  if (!hasTable(sqlite, table) || !hasColumn(sqlite, table, column)) return 0

  const names = Object.keys(RENAMED_COUNTRIES)
  const likeClause = names.map(() => `"${column}" LIKE ?`).join(' OR ')
  const rows = sqlite.prepare(
    `SELECT id, "${column}" AS value FROM "${table}" WHERE (${where}) AND (${likeClause})`,
  ).all(...names.map((name) => `%${name}%`)) as Array<{id: number; value: string}>

  const update = sqlite.prepare(`UPDATE "${table}" SET "${column}" = ? WHERE id = ?`)
  let changed = 0

  for (const row of rows) {
    const next = renameStoredCountries(String(row.value))
    if (next !== row.value) {
      update.run(next, row.id)
      changed += 1
    }
  }

  return changed
}

/**
 * Country names are stored as text, so a rename in the country list leaves old
 * values behind. Rewrite them in tags and in saved country filters.
 */
export function renameLegacyCountryNames(sqlite: Database.Database): number {
  const run = sqlite.transaction(() => (
    renameInColumn(sqlite, 'tags', 'country', '1 = 1')
    + renameInColumn(sqlite, 'filterRows', 'val', `"param" = 'country'`)
  ))
  return run()
}
