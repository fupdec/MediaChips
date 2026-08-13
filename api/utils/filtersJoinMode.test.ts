import {describe, expect, it} from 'vitest'
import {joinFilterClauses, normalizeFiltersJoinMode} from './filtersJoinMode'

describe('filtersJoinMode', () => {
  it('normalizes unknown values to and', () => {
    expect(normalizeFiltersJoinMode('or')).toBe('or')
    expect(normalizeFiltersJoinMode('and')).toBe('and')
    expect(normalizeFiltersJoinMode(undefined)).toBe('and')
    expect(normalizeFiltersJoinMode('xor')).toBe('and')
  })

  it('joins clauses with AND or OR', () => {
    expect(joinFilterClauses(['a', 'b'])).toBe('(a AND b)')
    expect(joinFilterClauses(['a', 'b'], 'or')).toBe('(a OR b)')
    expect(joinFilterClauses(['a'], 'or')).toBe('a')
    expect(joinFilterClauses([])).toBe('')
  })
})
