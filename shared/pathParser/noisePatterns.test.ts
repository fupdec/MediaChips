import {describe, expect, it} from 'vitest'
import {
  PATH_NOISE_PATTERNS_SHARED,
  PATH_NOISE_PATTERNS_TOKENIZER,
  PATH_NOISE_PATTERNS_TOKENIZER_EXTRA,
  matchesPathNoise,
} from './noisePatterns'

describe('path noise patterns', () => {
  it.each([
    ['2019'],
    ['1080p'],
    ['4k'],
    ['x264'],
    ['h265'],
    ['hevc'],
    ['mkv'],
    ['mp4'],
    ['webm'],
  ])('shared patterns match %s', (token) => {
    expect(matchesPathNoise(token)).toBe(true)
  })

  it('does not treat meaningful words as shared noise', () => {
    expect(matchesPathNoise('alice')).toBe(false)
    expect(matchesPathNoise('studio')).toBe(false)
  })

  it('keeps tokenizer extras out of the shared list', () => {
    for (const pattern of PATH_NOISE_PATTERNS_TOKENIZER_EXTRA) {
      expect(PATH_NOISE_PATTERNS_SHARED.some((shared) => shared.source === pattern.source)).toBe(false)
    }
    expect(matchesPathNoise('jpg')).toBe(false)
    expect(matchesPathNoise('http')).toBe(false)
    expect(matchesPathNoise('jpg', PATH_NOISE_PATTERNS_TOKENIZER)).toBe(true)
    expect(matchesPathNoise('http', PATH_NOISE_PATTERNS_TOKENIZER)).toBe(true)
  })

  it('tokenizer list is shared + extras', () => {
    expect(PATH_NOISE_PATTERNS_TOKENIZER).toHaveLength(
      PATH_NOISE_PATTERNS_SHARED.length + PATH_NOISE_PATTERNS_TOKENIZER_EXTRA.length,
    )
  })
})
