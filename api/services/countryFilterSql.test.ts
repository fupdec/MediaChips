import {describe, expect, it} from 'vitest'
import {
  buildMediaCountryArrayClause,
  buildTagCountryArrayClause,
  buildTagCountryMatchSql,
} from './countryFilterSql'

function binder() {
  let n = 0
  const replacements: Record<string, unknown> = {}
  return {
    nextParam: (value: unknown) => {
      const key = `:p${++n}`
      replacements[key.slice(1)] = value
      return key
    },
    replacements,
  }
}

describe('countryFilterSql', () => {
  it('builds delimiter-aware country match SQL', () => {
    const sql = buildTagCountryMatchSql('t', ':c')
    expect(sql).toContain('t.country = :c')
    expect(sql).toContain("LIKE :c || char(")
  })

  it('builds media country existence and match clauses', () => {
    const {nextParam} = binder()
    expect(buildMediaCountryArrayClause({cond: 'is null', val: []}, nextParam)).toContain('NOT EXISTS')
    expect(buildMediaCountryArrayClause({cond: 'in', val: ['US']}, nextParam)).toContain('EXISTS')
    expect(buildMediaCountryArrayClause({cond: 'in', val: []}, nextParam)).toBe('0 = 1')
  })

  it('builds tag-column country clauses', () => {
    const {nextParam} = binder()
    expect(buildTagCountryArrayClause({cond: 'not null', val: []}, nextParam)).toContain('tags.country')
    const inSql = buildTagCountryArrayClause({cond: 'in', val: ['JP', 'KR']}, nextParam)
    expect(inSql).toContain(' OR ')
    expect(inSql).toContain('tags.country')
  })

  it('builds in only as exact country set for tags and media', () => {
    const {nextParam} = binder()
    const tagOnly = buildTagCountryArrayClause({cond: 'in only', val: ['US', 'JP']}, nextParam)
    expect(tagOnly).toContain(' AND ')
    expect(tagOnly).toContain('= 2')

    const mediaOnly = buildMediaCountryArrayClause({cond: 'in only', val: ['US']}, nextParam)
    expect(mediaOnly).toContain('EXISTS')
    expect(mediaOnly).toContain('NOT EXISTS')
    expect(mediaOnly).toContain('<')
  })
})
