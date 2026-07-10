/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTagFilterQuery,
  getTagFilterSqlFallbackReason,
  resolveTagFilterQuery,
} from './tagFilterSql'

describe('getTagFilterSqlFallbackReason', () => {
  it('returns reason when metaId is missing', () => {
    expect(getTagFilterSqlFallbackReason({ filters: [] })).toBe('Missing metaId')
  })

  it('returns null for a simple SQL-compatible query', () => {
    expect(getTagFilterSqlFallbackReason({
      metaId: 17,
      filters: [],
    })).toBeNull()
  })

  it('ignores find_duplicates and keeps SQL path for tags', () => {
    expect(getTagFilterSqlFallbackReason({
      metaId: 17,
      find_duplicates: true,
    })).toBeNull()
  })
})

describe('buildTagFilterQuery', () => {
  it('scopes tags to metaId', () => {
    const result = buildTagFilterQuery([], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toBe('tags.metaId = :metaId')
    expect(result.replacements).toMatchObject({ metaId: 17 })
  })

  it('builds tag relation join for meta array in-filter', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'in', val: [1050] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('tagsInTags')
    expect(result.joinSql).toContain('parentTagId = tags.id')
    expect(result.replacements).toMatchObject({ metaId: 17, f0: 3, f1: 1050 })
  })

  it('builds rating filter on tag column', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 'rating', type: 'number', cond: '>=', val: 4 },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('tags.rating')
  })

  it('builds country filter on tag column', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 'country', type: 'array', cond: 'in', val: ['US'] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('tags.country')
  })

  it('builds tag relation join for in only filter', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'in only', val: [1050, 1051] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('tagsInTags')
    expect(result.joinSql).toContain('GROUP BY parentTagId')
    expect(result.joinSql).toContain('COUNT(DISTINCT CASE WHEN tagId IN')
  })

  it('builds not in all without correlated subquery', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'not in all', val: [1050, 1051] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('LEFT JOIN')
    expect(result.joinSql).toContain('HAVING COUNT(DISTINCT tagId)')
    expect(result.whereSql).toContain('tf0.parentTagId IS NULL')
  })

  it('builds not in as anti-join for tag relations', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'not in', val: [1050] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toContain('LEFT JOIN')
    expect(result.whereSql).toContain('tf0.parentTagId IS NULL')
  })
})

describe('resolveTagFilterQuery', () => {
  it('adds ids constraint when provided', () => {
    const result = resolveTagFilterQuery({ metaId: 17, ids: [1, 2, 3] })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toContain('tags.id IN (:ids)')
    expect(result.replacements.ids).toEqual([1, 2, 3])
  })

  it('ignores find_duplicates and still builds SQL', () => {
    const result = resolveTagFilterQuery({ metaId: 17, find_duplicates: true })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.whereSql).toBe('tags.metaId = :metaId')
  })
})
