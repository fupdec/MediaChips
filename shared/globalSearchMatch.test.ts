import {describe, expect, it} from 'vitest'
import {
  matchesGlobalSearchName,
  splitGlobalSearchTokens,
  tokenMatchesQueryPart,
} from './globalSearchMatch'

describe('globalSearchMatch', () => {
  it('splits CamelCase and matches prefixes carefully', () => {
    expect(splitGlobalSearchTokens('JulesJordan')).toEqual(
      expect.arrayContaining(['julesjordan', 'jules', 'jordan']),
    )
    expect(tokenMatchesQueryPart('action', 'act')).toBe(true)
    expect(tokenMatchesQueryPart('analise', 'anal')).toBe(false)
    expect(matchesGlobalSearchName('JulesJordan', 'jordan')).toBe(true)
    expect(matchesGlobalSearchName('Lana Analise', 'anal')).toBe(false)
  })
})
