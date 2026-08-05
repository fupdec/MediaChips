/** Shared filtered-list COUNT / id SELECT SQL builders (media + tags). */

export function buildEntityIdSelect(idColumn: string, needsDistinct: boolean): string {
  return needsDistinct
    ? `SELECT DISTINCT ${idColumn}`
    : `SELECT ${idColumn}`
}

export function buildMediaIdSelect(needsDistinct: boolean): string {
  return buildEntityIdSelect('media.id', needsDistinct)
}

export function buildTagIdSelect(needsDistinct: boolean): string {
  return buildEntityIdSelect('tags.id', needsDistinct)
}

export function buildFilteredCountSql(
  fromClause: string,
  whereClause: string,
  needsDistinct: boolean,
  idColumn = 'media.id',
): string {
  if (!needsDistinct) {
    return `SELECT COUNT(*) AS totalFiltered
      ${fromClause}
      ${whereClause}`
  }

  return `SELECT COUNT(*) AS totalFiltered
    FROM (
      SELECT DISTINCT ${idColumn}
      ${fromClause}
      ${whereClause}
    )`
}

export function buildFilteredTotalsSql(
  fromClause: string,
  whereClause: string,
  needsDistinct: boolean,
  options: {idColumn?: string; filesizeColumn?: string} = {},
): string {
  const idColumn = options.idColumn ?? 'media.id'
  const filesizeColumn = options.filesizeColumn ?? 'media.filesize'

  if (!needsDistinct) {
    return `SELECT COUNT(*) AS totalFiltered,
      COALESCE(SUM(${filesizeColumn}), 0) AS totalFilesize
      ${fromClause}
      ${whereClause}`
  }

  return `SELECT COUNT(*) AS totalFiltered,
    COALESCE(SUM(filesize), 0) AS totalFilesize
    FROM (
      SELECT DISTINCT ${idColumn}, ${filesizeColumn} AS filesize
      ${fromClause}
      ${whereClause}
    )`
}
