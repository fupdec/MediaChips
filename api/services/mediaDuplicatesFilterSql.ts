export type DuplicateColumn = 'path' | 'oshash' | 'visualHash' | 'contentHash' | 'filesize'

export function resolveDuplicateColumn(duplicatesBy: string): DuplicateColumn {
  if (duplicatesBy === 'path') return 'path'
  if (duplicatesBy === 'fingerprint' || duplicatesBy === 'oshash') return 'oshash'
  if (duplicatesBy === 'visualHash' || duplicatesBy === 'visual') return 'visualHash'
  if (duplicatesBy === 'contentHash') return 'contentHash'
  return 'filesize'
}

/**
 * Duplicate value groups among candidates only (current filters + media type).
 * DISTINCT by media.id avoids join fan-out inflating HAVING COUNT(*).
 */
export function buildDuplicateValuesSubquery(
  duplicatesBy: string,
  joinSql: string,
  whereSql: string,
): string {
  const column = resolveDuplicateColumn(duplicatesBy)
  const fromSql = joinSql ? `media\n${joinSql}` : 'media'
  const valueNotEmpty = column === 'filesize'
    ? 'media.filesize > 0'
    : `media.${column} IS NOT NULL AND media.${column} != ''`

  return `SELECT dupVal
    FROM (
      SELECT DISTINCT media.id AS id, media.${column} AS dupVal
      FROM ${fromSql}
      WHERE ${whereSql}
        AND ${valueNotEmpty}
    ) AS scoped_candidates
    GROUP BY dupVal
    HAVING COUNT(*) > 1`
}

/** Extra WHERE clauses that restrict media rows to duplicate values. */
export function buildDuplicateMatchClauses(
  duplicatesBy: string,
  duplicateValuesSubquery: string,
): string[] {
  const column = resolveDuplicateColumn(duplicatesBy)
  if (column === 'filesize') {
    return [
      'media.filesize > 0',
      `media.filesize IN (${duplicateValuesSubquery})`,
    ]
  }
  return [
    `media.${column} IS NOT NULL AND media.${column} != ''`,
    `media.${column} IN (${duplicateValuesSubquery})`,
  ]
}
