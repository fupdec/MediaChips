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
