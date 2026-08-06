import {describe, expect, it} from 'vitest'
import {
  buildBooleanEntityColumnClause,
  buildBooleanMetaValueClause,
  buildTypedEntityColumnClause,
  buildTypedMetaValueClause,
} from './filterTypedColumnSql'

describe('filterTypedColumnSql', () => {
  it('builds boolean clauses with correct empty defaults', () => {
    expect(buildBooleanMetaValueClause('v', '=')).toContain("COALESCE(v, '')")
    expect(buildBooleanEntityColumnClause('media.favorite', '!=')).toContain('COALESCE(media.favorite, 0)')
  })

  it('builds typed number/string meta clauses', () => {
    const params: unknown[] = []
    const nextParam = (value: unknown) => {
      params.push(value)
      return `:p${params.length}`
    }
    expect(buildTypedMetaValueClause('v', {type: 'number', cond: '>', val: 3} as never, nextParam))
      .toContain('CAST(v AS REAL)')
    expect(buildTypedEntityColumnClause('media.name', {type: 'string', cond: 'equal', val: 'Hi'} as never, nextParam))
      .toContain('LOWER(media.name)')
  })

  it('falls back unknown types to string comparisons', () => {
    const params: unknown[] = []
    const nextParam = (value: unknown) => {
      params.push(value)
      return `:p${params.length}`
    }
    expect(buildTypedMetaValueClause('v', {type: 'text', cond: 'includes', val: 'x'} as never, nextParam))
      .toContain('LOWER(v) LIKE')
    expect(buildTypedEntityColumnClause('media.oshash', {type: 'url', cond: 'equal', val: 'abc'} as never, nextParam))
      .toContain('LOWER(media.oshash) = LOWER')
    expect(params).toEqual(['%x%', 'abc'])
  })
})
