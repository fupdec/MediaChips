/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildTagFilterQuery,
  getTagFilterSqlFallbackReason,
  getTagSortExpression,
  getTagSortPlan,
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

    expect(result.whereSql).toBe("tags.metaId = :metaId AND (tags.deletedAt IS NULL OR tags.deletedAt = '')")
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

  it('keeps needsDistinct false for multi-tag in joins that are already unique-keyed', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'in', val: [1050, 1051] },
    ], { metaId: 17 })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.needsDistinct).toBe(false)
    expect(result.joinSql).toContain('tagsInTags')
    expect(result.joinSql).toContain('SELECT DISTINCT parentTagId')
    expect(result.joinSql).toContain('tagId IN (:f1)')
    expect(result.replacements).toMatchObject({metaId: 17, f0: 3, f1: [1050, 1051]})
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

  it('ORs relation filters via WHERE clauses without INNER JOIN', () => {
    const result = buildTagFilterQuery([
      { active: true, param: 3, type: 'array', cond: 'in', val: [1050] },
      { active: true, param: 'rating', type: 'rating', cond: '>=', val: 4 },
    ], { metaId: 17, filtersJoin: 'or' })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.joinSql).toBe('')
    expect(result.whereSql).toContain(' OR ')
    expect(result.whereSql).toMatch(/tags\.id IN/)
    expect(result.whereSql).toMatch(/tags\.rating.*>=/)
    expect(result.whereSql).toMatch(/^tags\.metaId = :metaId AND \(/)
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

    expect(result.whereSql).toBe("tags.metaId = :metaId AND (tags.deletedAt IS NULL OR tags.deletedAt = '')")
  })
})

describe('getTagSortPlan', () => {
  it('sorts by assignment count via pre-aggregated joins', () => {
    for (const key of ['mediaCount', 'numberOfMedia', 'assignmentCount'] as const) {
      const plan = getTagSortPlan(key)
      expect(plan.expression).toContain('tag_sort_media_assign')
      expect(plan.expression).toContain('tag_sort_tag_assign')
      expect(plan.joinSql).toContain('tagsInMedia')
      expect(plan.joinSql).toContain('tagsInTags')
      expect(plan.joinSql).toContain('GROUP BY')
      expect(plan.joinSql).toContain(':metaId')
    }
  })

  it('sorts by video / image media counts via type-scoped joins', () => {
    for (const key of ['videoCount', 'numberOfVideos'] as const) {
      const plan = getTagSortPlan(key)
      expect(plan.expression).toContain('tag_sort_type_count')
      expect(plan.joinSql).toContain("mediaTypes.type = 'video'")
      expect(plan.joinSql).toContain('GROUP BY')
    }
    for (const key of ['imageCount', 'numberOfImages'] as const) {
      const plan = getTagSortPlan(key)
      expect(plan.expression).toContain('tag_sort_type_count')
      expect(plan.joinSql).toContain("mediaTypes.type = 'image'")
      expect(plan.joinSql).toContain('GROUP BY')
    }
  })

  it('sorts by nested assigned tag count via parent aggregate', () => {
    for (const key of ['tagCount', 'numberOfTags', 'assignedTagCount'] as const) {
      const plan = getTagSortPlan(key)
      expect(plan.expression).toContain('tag_sort_nested_count')
      expect(plan.joinSql).toContain('parentTagId')
      expect(plan.joinSql).toContain('GROUP BY')
    }
  })

  it('keeps plain column sorts without joins', () => {
    const plan = getTagSortPlan('name')
    expect(plan.expression).toContain('tags.name')
    expect(plan.joinSql).toBe('')
  })
})

describe('getTagSortExpression', () => {
  it('returns the plan expression for assignment counts', () => {
    expect(getTagSortExpression('mediaCount')).toBe(getTagSortPlan('mediaCount').expression)
  })
})
