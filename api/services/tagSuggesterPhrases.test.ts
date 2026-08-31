import {describe, expect, it} from 'vitest'
import {
  compareSuggestions,
  countPathTokens,
  filterExistingTags,
  getCandidatePhrases,
  pickTopSuggestions,
  suggestionScore,
} from './tagSuggesterPhrases'

describe('tagSuggesterPhrases', () => {
  it('builds phrase candidates from path tokens', () => {
    const phrases = getCandidatePhrases('/Movies/Alice Studio/clip_one.mp4', {maxWords: 2})
    expect(phrases.some((p) => p.word === 'alice studio')).toBe(true)
    expect(phrases.some((p) => p.word === 'alice')).toBe(true)
    expect(phrases.some((p) => p.word === 'studio')).toBe(true)
  })

  it('builds multi-word phrases across consecutive folders', () => {
    const phrases = getCandidatePhrases('/Library/Eva/Angelina/scene.mp4', {maxWords: 2})
    expect(phrases.some((p) => p.word === 'eva angelina')).toBe(true)
  })

  it('counts tokens across media and filters existing tags', () => {
    const counts = countPathTokens([
      {path: '/Movies/Alice/a.mp4'},
      {path: '/Movies/Alice/b.mp4'},
    ] as never)
    expect(counts.some((c) => normalizeIncludes(c.word, 'alice'))).toBe(true)
    expect(counts.find((c) => c.word === 'alice')?.docs).toBe(2)

    const filtered = filterExistingTags(
      [{word: 'Alice', occurrences: 2, words: 1, docs: 2}, {word: 'NewTag', occurrences: 1, words: 1, docs: 1}],
      [{name: 'alice'}] as never,
    )
    expect(filtered.map((c) => c.word)).toEqual(['NewTag'])
  })

  it('ranks recurring multi-word phrases above numeric singles', () => {
    const multi = {word: 'eva angelina', occurrences: 4.5, words: 2, docs: 3}
    const numeric = {word: '001', occurrences: 6, words: 1, docs: 6}
    expect(suggestionScore(multi)).toBeGreaterThan(suggestionScore(numeric))
    expect(compareSuggestions(multi, numeric)).toBeLessThan(0)
  })

  it('reserves recurring multi-word phrases in the top list', () => {
    const candidates = [
      {word: 'volumes', occurrences: 20, words: 1, docs: 20},
      {word: 'pron', occurrences: 20, words: 1, docs: 20},
      {word: 'photo', occurrences: 20, words: 1, docs: 20},
      {word: '001', occurrences: 8, words: 1, docs: 8},
      {word: '002', occurrences: 8, words: 1, docs: 8},
      {word: '003', occurrences: 8, words: 1, docs: 8},
      {word: '004', occurrences: 8, words: 1, docs: 8},
      {word: '005', occurrences: 8, words: 1, docs: 8},
      {word: 'eva angelina', occurrences: 6, words: 2, docs: 4},
      {word: 'other girl', occurrences: 4.5, words: 2, docs: 3},
      {word: '25812 zip', occurrences: 3, words: 2, docs: 2},
    ]

    const picked = pickTopSuggestions(candidates, 6)
    const words = picked.map((item) => item.word)

    expect(words).toContain('eva angelina')
    expect(words).toContain('other girl')
    expect(words.filter((word) => word.includes(' ')).length).toBeGreaterThanOrEqual(2)
  })

  it('prefers multi-word names from real path batches', () => {
    const paths = [
      '/Volumes/pron/photo/Eva Angelina/25812.zip/001.jpg',
      '/Volumes/pron/photo/Eva Angelina/25812.zip/002.jpg',
      '/Volumes/pron/photo/Eva Angelina/25812.zip/003.jpg',
      '/Volumes/pron/photo/Other Girl/8784.zip/001.jpg',
      '/Volumes/pron/photo/Other Girl/8784.zip/002.jpg',
      '/Volumes/pron/photo/Noise/001.jpg',
      '/Volumes/pron/photo/Noise/002.jpg',
      '/Volumes/pron/photo/Noise/003.jpg',
      '/Volumes/pron/photo/Noise/004.jpg',
      '/Volumes/pron/photo/Noise/005.jpg',
    ].map((path) => ({path}))

    const counts = countPathTokens(paths as never, {maxWords: 3})
    const top = pickTopSuggestions(counts, 10).map((item) => item.word)

    expect(top).toContain('eva angelina')
    expect(top).toContain('other girl')
  })
  it('does not emit zip tokens from archive paths', () => {
    const paths = [
      '/Volumes/pron/_photo/#DogFart/allie_foster.zip!/001.jpg',
      '/Volumes/pron/_photo/#DogFart/allie_foster.zip!/002.jpg',
    ].map((path) => ({path}))

    const counts = countPathTokens(paths as never, {maxWords: 3})
    const words = counts.map((c) => c.word)

    expect(words).toContain('allie foster')
    expect(words.some((w) => w === 'zip' || w.includes('zip'))).toBe(false)
  })
})

function normalizeIncludes(word: string, needle: string) {
  return word.toLowerCase().includes(needle)
}
