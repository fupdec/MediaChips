import { describe, expect, it } from 'vitest'
import {
  buildFtsMatchQuery,
  buildTagFtsMatchQuery,
  matchesGlobalSearchName,
  resolveGlobalSearchTagMatch,
} from './ftsQuery'

describe('buildFtsMatchQuery', () => {
  it('returns null for empty input', () => {
    expect(buildFtsMatchQuery('')).toBeNull()
    expect(buildFtsMatchQuery('   ')).toBeNull()
  })

  it('builds prefix match for a single token', () => {
    expect(buildFtsMatchQuery('actor')).toBe('"actor"*')
  })

  it('builds AND prefix match for multiple tokens', () => {
    expect(buildFtsMatchQuery('john smith')).toBe('"john"* AND "smith"*')
  })

  it('escapes double quotes in tokens', () => {
    expect(buildFtsMatchQuery('a"b')).toBe('"a""b"*')
  })

  it('can disable prefix matching', () => {
    expect(buildFtsMatchQuery('actor', { allowPrefix: false })).toBe('"actor"')
  })
})

describe('buildTagFtsMatchQuery', () => {
  it('searches both name and synonyms columns', () => {
    expect(buildTagFtsMatchQuery('anal')).toBe('({name} : "anal"*) OR ({synonyms} : "anal"*)')
  })
})

describe('matchesGlobalSearchName', () => {
  it('matches exact and short-prefix tokens', () => {
    expect(matchesGlobalSearchName('Action Hero', 'act')).toBe(true)
    expect(matchesGlobalSearchName('Anal Gape', 'anal')).toBe(true)
  })

  it('matches CamelCase tag names by word prefix', () => {
    expect(matchesGlobalSearchName('JulesJordan', 'jule')).toBe(true)
    expect(matchesGlobalSearchName('JulesJordan', 'jordan')).toBe(true)
    expect(matchesGlobalSearchName('JulesJordan', 'jules')).toBe(true)
  })

  it('matches LIKE substrings without stem heuristics', () => {
    expect(matchesGlobalSearchName('Lana Analise', 'anal')).toBe(true)
    expect(matchesGlobalSearchName('YasmiButt', 'anal')).toBe(false)
    expect(matchesGlobalSearchName('Mountain Peak', 'moun')).toBe(true)
    expect(matchesGlobalSearchName('Mountain Peak', 'mount')).toBe(true)
  })

  it('requires every query token to match', () => {
    expect(matchesGlobalSearchName('Lana Analise', 'lana anal')).toBe(true)
    expect(matchesGlobalSearchName('Lana Storm', 'lana storm')).toBe(true)
    expect(matchesGlobalSearchName('Lana Storm', 'lana missing')).toBe(false)
  })

  it('matches non-ascii names and queries', () => {
    expect(matchesGlobalSearchName('Актер', 'акт')).toBe(true)
    expect(matchesGlobalSearchName('Драма ночь', 'драма')).toBe(true)
    expect(matchesGlobalSearchName('北京故事', '北京')).toBe(true)
    expect(matchesGlobalSearchName('Action Hero', 'акт')).toBe(false)
  })
})

describe('resolveGlobalSearchTagMatch', () => {
  it('matches tags by synonyms and reports matched synonym text', () => {
    const result = resolveGlobalSearchTagMatch('YasmiButt', 'anal, gape', 'anal')
    expect(result.matched).toBe(true)
    expect(result.matchSource).toBe('synonym')
    expect(result.matchedSynonyms).toEqual(['anal'])
  })

  it('matches performer names with LIKE substrings', () => {
    expect(resolveGlobalSearchTagMatch('Lana Analise', null, 'anal').matched).toBe(true)
    expect(resolveGlobalSearchTagMatch('Anal Gape', null, 'anal').matched).toBe(true)
  })

  it('matches tags by bookmark notes', () => {
    const result = resolveGlobalSearchTagMatch('Director', null, 'vacation', 'watched on vacation')
    expect(result.matched).toBe(true)
    expect(result.matchSource).toBe('bookmark')
    expect(result.matchedBookmark).toBe('watched on vacation')
  })

  it('reports both when name and bookmark match', () => {
    const result = resolveGlobalSearchTagMatch('Actor', null, 'act', 'favorite actor note')
    expect(result.matched).toBe(true)
    expect(result.matchSource).toBe('both')
    expect(result.matchedBookmark).toBe('favorite actor note')
  })
})
