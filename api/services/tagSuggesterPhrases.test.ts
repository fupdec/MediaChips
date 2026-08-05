import {describe, expect, it} from 'vitest'
import {
  countPathTokens,
  filterExistingTags,
  getCandidatePhrases,
} from './tagSuggesterPhrases'

describe('tagSuggesterPhrases', () => {
  it('builds phrase candidates from path tokens', () => {
    const phrases = getCandidatePhrases('/Movies/Alice Studio/clip_one.mp4', {maxWords: 2})
    expect(phrases.some((p) => p.word.includes('alice') || p.word.includes('studio'))).toBe(true)
  })

  it('counts tokens across media and filters existing tags', () => {
    const counts = countPathTokens([
      {path: '/Movies/Alice/a.mp4'},
      {path: '/Movies/Alice/b.mp4'},
    ] as never)
    expect(counts.some((c) => normalizeIncludes(c.word, 'alice'))).toBe(true)

    const filtered = filterExistingTags(
      [{word: 'Alice', occurrences: 2, words: 1}, {word: 'NewTag', occurrences: 1, words: 1}],
      [{name: 'alice'}] as never,
    )
    expect(filtered.map((c) => c.word)).toEqual(['NewTag'])
  })
})

function normalizeIncludes(word: string, needle: string) {
  return word.toLowerCase().includes(needle)
}
