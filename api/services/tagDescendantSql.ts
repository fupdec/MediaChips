export interface TagLinkContext {
  table: string
  idColumn: string
  entityRef: string
}

export function descendantMediaCountJoinSql(options: {
  linkTable: string
  alias: string
  extraJoins?: string
  extraWhere?: string
}): string {
  const extraJoins = options.extraJoins ? `\n  ${options.extraJoins}` : ''
  const extraWhere = options.extraWhere ? `\n    AND ${options.extraWhere}` : ''
  return `LEFT JOIN (
  SELECT ${options.linkTable}.tagId AS id, COUNT(*) AS cnt
  FROM ${options.linkTable}${extraJoins}
  INNER JOIN tags scoped ON scoped.id = ${options.linkTable}.tagId AND scoped.metaId = :metaId
  WHERE 1 = 1${extraWhere}
  GROUP BY ${options.linkTable}.tagId
) AS ${options.alias} ON ${options.alias}.id = tags.id`
}
