import type {ApiDb, FilterLike} from '../types/db'
import type {SqlParamBinder} from '../types/mediaFilter'
import {queryAll} from '../db/utils/rawQuery'
import {invalidateMediaDerivedCaches} from './mediaCacheInvalidation'
import {parseCatalogSourceFilterValues} from '../utils/catalogSourceFilterValues'

// Catalog observations only. None of these expressions opens a source or its vault.
const fallbackKind = `CASE
  WHEN media.path LIKE 'nas://%' THEN 'nas'
  WHEN media.path LIKE 'gdrive://%' THEN 'gdrive'
  WHEN media.path LIKE 'https://%' OR media.path LIKE 'http://%' THEN 'web'
  ELSE 'local' END`
const fallbackConnection = `CASE
  WHEN media.path LIKE 'nas://%' THEN 'connection:' || substr(media.path, 7, 36)
  WHEN media.path LIKE 'gdrive://%' THEN 'connection:google-drive'
  ELSE NULL END`
const storedTokens = `SELECT sc.provider AS value FROM mediaLocations ml
  JOIN sourceConnections sc ON sc.id = ml.connectionId WHERE ml.mediaId = media.id
  UNION SELECT 'connection:' || ml.connectionId FROM mediaLocations ml WHERE ml.mediaId = media.id`
const noLocations = `NOT EXISTS (SELECT 1 FROM mediaLocations ml WHERE ml.mediaId = media.id)`
export const CATALOG_SOURCE_TOKENS_SQL = `(SELECT json_group_array(value) FROM (
  ${storedTokens}
  UNION SELECT ${fallbackKind} WHERE ${noLocations} OR ${fallbackKind} = 'local'
  UNION SELECT ${fallbackConnection} WHERE ${noLocations} AND ${fallbackConnection} IS NOT NULL
))`

// A card is usable if any original was available; unverified alternatives remain unknown.
// Local and legacy remote paths have no persisted availability observation.
export const CATALOG_AVAILABILITY_SQL = `CASE
  WHEN EXISTS (SELECT 1 FROM mediaLocations ml WHERE ml.mediaId = media.id AND ml.availability = 'available') THEN 'available'
  WHEN ${noLocations} OR ${fallbackKind} = 'local' OR EXISTS (SELECT 1 FROM mediaLocations ml WHERE ml.mediaId = media.id AND ml.availability = 'unknown') THEN 'unknown'
  ELSE 'unavailable' END`

export function buildCatalogSourceClause(filter: FilterLike, nextParam: SqlParamBinder): string | null {
  const values = parseCatalogSourceFilterValues(filter.val)
  const tokens = filter.param === 'source'
    ? CATALOG_SOURCE_TOKENS_SQL
    : `json_array(${CATALOG_AVAILABILITY_SQL})`
  if (filter.cond === 'is null') return `json_array_length(${tokens}) = 0`
  if (filter.cond === 'not null') return `json_array_length(${tokens}) > 0`
  if (!values.length) {
    if (['in', 'in all', 'in only'].includes(String(filter.cond))) return '0 = 1'
    if (['not in', 'not in all'].includes(String(filter.cond))) return '1 = 1'
    return null
  }
  const keys = values.map(nextParam)
  const any = `EXISTS (SELECT 1 FROM json_each(${tokens}) WHERE value IN (${keys.join(', ')}))`
  const all = keys.map(key => `EXISTS (SELECT 1 FROM json_each(${tokens}) WHERE value = ${key})`).join(' AND ')
  switch (filter.cond) {
    case 'in': return any
    case 'not in': return `NOT ${any}`
    case 'in all': return `(${all})`
    case 'not in all': return `NOT (${all})`
    case 'in only': return `(json_array_length(${tokens}) = ${keys.length} AND ${all})`
    default: return null
  }
}

export function listCatalogSources(db: ApiDb): Array<{value: string; name: string}> {
  return queryAll(db, `SELECT id, CASE WHEN json_valid(config) THEN json_extract(config, '$.name') END AS name
    FROM sourceConnections ORDER BY id`).map(row => ({
      value: `connection:${row.id}`, name: String(row.name || row.id),
    }))
}

export function markCatalogSourceDisconnected(db: ApiDb, connectionId: string): void {
  db.sqlite.prepare("UPDATE mediaLocations SET availability = 'unavailable' WHERE connectionId = ?").run(connectionId)
  invalidateMediaDerivedCaches()
}
