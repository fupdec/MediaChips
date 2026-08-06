import type {FilterLike} from '../types/db'
import type {SqlParamBinder} from '../types/mediaFilter'
import {COUNTRY_DELIMITER} from '../utils/country'

const COUNTRY_DELIMITER_SQL = `char(${COUNTRY_DELIMITER.charCodeAt(0)})`

export function buildTagCountryMatchSql(tagAlias: string, countryKey: string) {
  const countryColumn = `${tagAlias}.country`

  return `(
    ${countryColumn} = ${countryKey}
    OR ${countryColumn} LIKE ${countryKey} || ${COUNTRY_DELIMITER_SQL} || '%'
    OR ${countryColumn} LIKE '%' || ${COUNTRY_DELIMITER_SQL} || ${countryKey} || ${COUNTRY_DELIMITER_SQL} || '%'
    OR ${countryColumn} LIKE '%' || ${COUNTRY_DELIMITER_SQL} || ${countryKey}
    OR ${countryColumn} LIKE ${countryKey} || ',%'
    OR ${countryColumn} LIKE '%,' || ${countryKey} || ',%'
    OR ${countryColumn} LIKE '%,' || ${countryKey}
  )`
}

/** Token count for delimiter/comma-separated country strings (non-empty → ≥ 1). */
function buildCountryTokenCountSql(countryColumn: string): string {
  return `(
    CASE
      WHEN ${countryColumn} IS NULL OR TRIM(${countryColumn}) = '' THEN 0
      ELSE 1 + LENGTH(${countryColumn})
        - LENGTH(REPLACE(REPLACE(${countryColumn}, ${COUNTRY_DELIMITER_SQL}, ''), ',', ''))
    END
  )`
}

function buildCountryMatchCountSql(
  countryMatchClauses: string[],
): string {
  return countryMatchClauses
    .map((clause) => `CASE WHEN (${clause}) THEN 1 ELSE 0 END`)
    .join(' + ')
}

function normalizeCountryValues(val: unknown): unknown[] {
  return Array.isArray(val)
    ? val.filter((entry: unknown) => entry !== null && entry !== undefined && entry !== '')
    : []
}

/** Country array filter against tags linked to media via tagsInMedia. */
export function buildMediaCountryArrayClause(
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {cond, val} = filter
  const countries = normalizeCountryValues(val)

  const countryExistsSql = `EXISTS (
    SELECT 1 FROM tagsInMedia tim
    INNER JOIN tags t ON t.id = tim.tagId
    WHERE tim.mediaId = media.id
      AND t.country IS NOT NULL
      AND t.country != ''
  )`

  if (cond === 'is null') {
    return `NOT ${countryExistsSql}`
  }

  if (cond === 'not null') {
    return countryExistsSql
  }

  if (!countries.length) {
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') {
      return countryExistsSql
    }
    return '0 = 1'
  }

  const countryMatchClauses = countries.map((country: unknown) => {
    const countryKey = nextParam(String(country))
    return buildTagCountryMatchSql('t', countryKey)
  })

  const countryMatchAnySql = `EXISTS (
    SELECT 1 FROM tagsInMedia tim
    INNER JOIN tags t ON t.id = tim.tagId
    WHERE tim.mediaId = media.id
      AND (${countryMatchClauses.join(' OR ')})
  )`

  const countryMatchAllSql = countryMatchClauses.map((clause) => `EXISTS (
    SELECT 1 FROM tagsInMedia tim
    INNER JOIN tags t ON t.id = tim.tagId
    WHERE tim.mediaId = media.id
      AND (${clause})
  )`).join(' AND ')

  if (cond === 'in') {
    return countryMatchAnySql
  }

  if (cond === 'not in') {
    return `NOT ${countryMatchAnySql}`
  }

  if (cond === 'in all') {
    return countryMatchAllSql
  }

  if (cond === 'not in all') {
    return `NOT (${countryMatchAllSql})`
  }

  if (cond === 'in only') {
    // Exact country set: every selected country appears, and no linked tag
    // carries a country token outside the selection.
    const matchCountSql = buildCountryMatchCountSql(countryMatchClauses)
    const tokenCountSql = buildCountryTokenCountSql('t.country')
    const noExtraCountriesSql = `NOT EXISTS (
      SELECT 1 FROM tagsInMedia tim
      INNER JOIN tags t ON t.id = tim.tagId
      WHERE tim.mediaId = media.id
        AND t.country IS NOT NULL
        AND t.country != ''
        AND (${matchCountSql}) < (${tokenCountSql})
    )`
    return `(${countryMatchAllSql}) AND (${noExtraCountriesSql})`
  }

  return null
}

/** Country array filter against the tags.country column directly. */
export function buildTagCountryArrayClause(
  filter: FilterLike,
  nextParam: SqlParamBinder,
): string | null {
  const {cond, val} = filter
  const countries = normalizeCountryValues(val)

  const countryExistsSql = `(tags.country IS NOT NULL AND tags.country != '')`

  if (cond === 'is null') {
    return `NOT ${countryExistsSql}`
  }

  if (cond === 'not null') {
    return countryExistsSql
  }

  if (!countries.length) {
    if (cond === 'not in') return '1 = 1'
    if (cond === 'not in all') return countryExistsSql
    return '0 = 1'
  }

  const countryMatchClauses = countries.map((country: unknown) => {
    const countryKey = nextParam(String(country))
    return buildTagCountryMatchSql('tags', countryKey)
  })

  const matchAllSql = countryMatchClauses.map((clause) => `(${clause})`).join(' AND ')

  if (cond === 'in') {
    return `(${countryMatchClauses.join(' OR ')})`
  }

  if (cond === 'not in') {
    return `NOT (${countryMatchClauses.join(' OR ')})`
  }

  if (cond === 'in all') {
    return matchAllSql
  }

  if (cond === 'not in all') {
    return `NOT (${matchAllSql})`
  }

  if (cond === 'in only') {
    const tokenCountSql = buildCountryTokenCountSql('tags.country')
    return `(${matchAllSql}) AND (${tokenCountSql}) = ${countries.length}`
  }

  return null
}

/** @deprecated Prefer buildMediaCountryArrayClause. */
export const buildCountryArrayClause = buildMediaCountryArrayClause
