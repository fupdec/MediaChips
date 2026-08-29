import {describe, expect, it} from 'vitest'
import {
  matchesGlobalSearchName,
  splitGlobalSearchTokens,
  tokenMatchesQueryPart,
} from './globalSearchMatch'

describe('globalSearchMatch', () => {
  it('splits CamelCase and matches LIKE substrings', () => {
    expect(splitGlobalSearchTokens('JulesJordan')).toEqual(
      expect.arrayContaining(['julesjordan', 'jules', 'jordan']),
    )
    expect(tokenMatchesQueryPart('action', 'act')).toBe(true)
    expect(tokenMatchesQueryPart('analise', 'anal')).toBe(true)
    expect(matchesGlobalSearchName('JulesJordan', 'jordan')).toBe(true)
    expect(matchesGlobalSearchName('Lana Analise', 'anal')).toBe(true)
  })

  it('keeps progressive prefixes for longer words', () => {
    for (const part of ['m', 'mo', 'mou', 'moun', 'mount', 'mounta', 'mountai', 'mountain']) {
      expect(tokenMatchesQueryPart('mountain', part)).toBe(true)
      expect(matchesGlobalSearchName('Mountain Peak', part)).toBe(true)
    }
  })
})
