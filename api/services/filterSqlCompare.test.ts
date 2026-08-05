import {describe, expect, it} from 'vitest'
import {
  buildDateComparison,
  buildStringComparison,
  compareNumberSql,
  stringFilterValue,
} from './filterSqlCompare'

describe('filterSqlCompare', () => {
  it('builds number comparisons', () => {
    expect(compareNumberSql('media.rating', '>', ':v')).toBe(
      'CAST(media.rating AS REAL) > CAST(:v AS REAL)',
    )
    expect(compareNumberSql('media.rating', 'bogus' as never, ':v')).toBeNull()
  })

  it('builds date comparisons with binder', () => {
    const params: unknown[] = []
    const nextParam = (value: unknown) => {
      params.push(value)
      return `:p${params.length}`
    }
    expect(buildDateComparison('media.createdAt', '>=', '2024-01-01', nextParam)).toBe(
      "CAST(strftime('%s', media.createdAt) AS INTEGER) >= CAST(strftime('%s', :p1) AS INTEGER)",
    )
    expect(params).toEqual(['2024-01-01'])
  })

  it('normalizes string filter values and comparisons', () => {
    expect(stringFilterValue(['Abc', 'x'])).toBe('Abc')
    expect(stringFilterValue(null)).toBe('')

    const params: unknown[] = []
    const nextParam = (value: unknown) => {
      params.push(value)
      return `:p${params.length}`
    }
    expect(buildStringComparison('media.name', 'equal', 'Hi', nextParam)).toBe(
      'LOWER(media.name) = LOWER(:p1)',
    )
    expect(buildStringComparison('media.name', 'is null', null, nextParam)).toBe(
      "(media.name IS NULL OR media.name = '')",
    )
    expect(buildStringComparison('media.name', 'includes', 'Clip', nextParam)).toBe(
      'LOWER(media.name) LIKE :p2',
    )
    expect(params).toEqual(['Hi', '%clip%'])
  })
})
