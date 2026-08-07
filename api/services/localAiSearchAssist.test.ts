import {describe, expect, it} from 'vitest'
import {
  buildSearchAssistPrompt,
  normalizeSearchAssistParsed,
  tokenizeSearchAssistQuery,
} from './localAiSearchAssist'

describe('localAiSearchAssist', () => {
  it('tokenizes ai:/ии: prefixes away', () => {
    expect(tokenizeSearchAssistQuery('ai: Lara neon')).toEqual(['Lara', 'neon'])
    expect(tokenizeSearchAssistQuery('ии: студия night')).toEqual(['студия', 'night'])
  })

  it('resolves tags only from candidates', () => {
    const parsed = normalizeSearchAssistParsed(
      {
        query: 'neon night',
        tags: ['Lara', 'Unknown Studio', 'lara'],
        explanation: 'Pinned Lara',
      },
      {
        candidateTags: [
          {id: 7, name: 'Lara', metaId: 1},
          {id: 9, name: 'Studio X', metaId: 2},
        ],
      },
    )
    expect(parsed).toEqual({
      query: 'neon night',
      tags: ['Lara'],
      tagIds: [7],
      explanation: 'Pinned Lara',
    })
  })

  it('returns null for empty parse', () => {
    expect(normalizeSearchAssistParsed(null)).toBeNull()
  })

  it('includes candidate names in the prompt', () => {
    const parts = buildSearchAssistPrompt({
      q: 'Lara neon',
      candidateTags: [{id: 1, name: 'Lara'}],
    })
    expect(parts.join('\n')).toContain('Lara')
    expect(parts.join('\n')).toContain('ONLY JSON')
  })
})
