/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('../utils/country', () => ({
  COUNTRY_DELIMITER: '\x1E',
}))

import {
  buildMediaFilterQuery,
  canUseSqlMediaLoader,
  getMediaFilterSqlFallbackReason,
  normalizeActiveFilters,
  resolveMediaFilterQuery,
} from './mediaFilterSql'

describe('normalizeActiveFilters', () => {
  it('keeps only active filters with a condition', () => {
    const filters = [
      { active: true, cond: 'in', param: 17, type: 'array', val: [1] },
      { active: false, cond: 'in', param: 17, type: 'array', val: [2] },
      { active: 1, cond: 'equal', param: 'rating', type: 'number', val: 5 },
      { active: true, cond: undefined, param: 'name', type: 'string', val: 'x' },
    ]

    expect(normalizeActiveFilters(filters)).toHaveLength(2)
  })
})

describe('getMediaFilterSqlFallbackReason', () => {
  it('returns reason when mediaTypeId is missing', () => {
    expect(getMediaFilterSqlFallbackReason({ filters: [] })).toBe('Missing mediaTypeId')
  })

  it('returns null for a simple SQL-compatible query', () => {
    expect(getMediaFilterSqlFallbackReason({
      mediaTypeId: 1,
      filters: [],
    })).toBeNull()
  })
})

describe('buildMediaFilterQuery', () => {
  it('builds a tag join for active in-filter on meta param', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'in', val: [1050] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('media.mediaTypeId = :mediaTypeId')
    expect(result.joinSql).toContain('tagsInMedia')
    expect(result.joinSql).toContain('metaId = :f0')
    expect(result.joinSql).toContain('tagId = :f1')
    expect(result.replacements).toMatchObject({ mediaTypeId: 1, f0: 17, f1: 1050 })
  })

  it('ignores inactive filters', () => {
    const result = buildMediaFilterQuery([
      { active: false, param: 17, type: 'array', cond: 'in', val: [1050] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toBe('')
    expect(result.whereSql).toBe('media.mediaTypeId = :mediaTypeId')
  })

  it('treats empty ext in-list as no matches instead of failing', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 'ext', type: 'array', cond: 'in', val: [] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('0 = 1')
  })

  it('treats tag regex with non-array value as no matches', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'regex', val: 'foo' },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('0 = 1')
  })

  it('returns failure for unknown column param', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 'unknownField', type: 'string', cond: 'includes', val: 'x' },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(false)
    if (result.ok) return

    expect(result.reason).toContain('param=unknownField')
  })

  it('supports exact string match conditions', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 'name', type: 'string', cond: 'equal', val: 'Alpha' },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('LOWER(media.name) = LOWER')
  })

  it('supports under folder path prefix matching', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 'path', type: 'string', cond: 'under folder', val: '/media/videos' },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('media.path LIKE')
    expect(Object.values(result.replacements)).toEqual(
      expect.arrayContaining(['/media/videos/%', '/media/videos\\%']),
    )
  })

  it('supports starts with string matching', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 'path', type: 'string', cond: 'starts with', val: '/media/videos/' },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('LOWER(media.path) LIKE')
    expect(Object.values(result.replacements)).toContain('/media/videos/%')
  })

  it('builds not in as excludes-one-of anti-join (no listed tags allowed)', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'not in', val: [1, 2] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('LEFT JOIN')
    expect(result.joinSql).toContain('SELECT DISTINCT mediaId')
    expect(result.whereSql).toContain('tf0.mediaId IS NULL')
    expect(result.whereSql).not.toContain('NOT EXISTS')
  })

  it('builds not in all as excludes-all anti-join', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'not in all', val: [1, 2] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('LEFT JOIN')
    expect(result.joinSql).toContain('HAVING COUNT(DISTINCT tagId)')
    expect(result.whereSql).toContain('tf0.mediaId IS NULL')
  })

  it('builds is null and not null without correlated exists', () => {
    const emptyResult = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'is null', val: [] },
    ], { mediaTypeId: 1 })
    const filledResult = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'not null', val: [] },
    ], { mediaTypeId: 1 })

    expect(emptyResult.ok).toBe(true)
    expect(filledResult.ok).toBe(true)
    if (!emptyResult.ok || !filledResult.ok) return

    expect(emptyResult.joinSql).toContain('LEFT JOIN')
    expect(emptyResult.whereSql).toContain('tf0.mediaId IS NULL')
    expect(filledResult.joinSql).toContain('INNER JOIN')
    expect(emptyResult.whereSql).not.toContain('NOT EXISTS')
    expect(filledResult.whereSql).not.toContain('EXISTS')
  })

  it('builds in only as exact tag set join for meta', () => {
    const result = buildMediaFilterQuery([
      { active: true, param: 17, type: 'array', cond: 'in only', val: [5] },
    ], { mediaTypeId: 1 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('GROUP BY mediaId')
    expect(result.joinSql).toContain('COUNT(DISTINCT tagId)')
    expect(result.joinSql).toContain('COUNT(DISTINCT CASE WHEN tagId IN')
    expect(result.whereSql).not.toContain('SELECT COUNT(*)')
  })
})

describe('resolveMediaFilterQuery', () => {
  it('routes duplicate search to duplicate SQL builder', () => {
    const result = resolveMediaFilterQuery({
      mediaTypeId: 1,
      find_duplicates: true,
      duplicates_by: 'filesize',
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('GROUP BY filesize')
    expect(result.whereSql).toContain('HAVING COUNT(*) > 1')
    expect(result.whereSql).toContain('media.filesize IN')
  })

  it('matches canUseSqlMediaLoader', () => {
    const options = { mediaTypeId: 1, filters: [] as never[] }

    expect(canUseSqlMediaLoader(options)).toBe(true)
    expect(getMediaFilterSqlFallbackReason(options)).toBeNull()
  })
})
