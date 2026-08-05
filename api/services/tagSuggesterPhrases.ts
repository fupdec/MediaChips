import type {MediaLike, TagLike} from '../types/db'
import type {PathToken, TokenizeOptions} from '../types/pathTokenizer'
import {tokenizeFilePath} from './pathTokenizer'
import {normalizeTagLookupName} from '@shared/tagLookupName'

export interface TagPhraseCandidate {
  word: string
  source: string
  sample: string
  words: number
  weight: number
  occurrences?: number
  cluster?: string[]
}

export interface PathTokenCount {
  word: string
  occurrences: number
  sample?: string
  words: number
}

export function getCandidatePhrases(
  filePath: string,
  options: TokenizeOptions & {maxWords?: number} = {},
) {
  const parsed = tokenizeFilePath(filePath, options)
  const grouped = new Map<string, PathToken[]>()

  for (const entry of parsed.tokens) {
    const key = `${entry.source}:${entry.segment}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(entry)
  }

  const candidates: TagPhraseCandidate[] = []
  for (const entries of grouped.values()) {
    const maxWords = Math.min(Number(options.maxWords || 3), 3)
    for (let size = 1; size <= maxWords; size++) {
      for (let i = 0; i <= entries.length - size; i++) {
        const phraseEntries = entries.slice(i, i + size)
        const word = phraseEntries.map((entry) => entry.token).join(' ')
        const weight = phraseEntries.reduce((sum, entry) => sum + entry.weight, 0) / size
        candidates.push({
          word,
          source: phraseEntries[0].source,
          sample: phraseEntries[0].segment,
          words: size,
          weight,
        })
      }
    }
  }

  return candidates
}

export function countPathTokens(
  media: MediaLike[],
  options: TokenizeOptions & {maxWords?: number} = {},
): PathTokenCount[] {
  const counts = new Map<string, number>()
  const samples = new Map<string, string>()
  const wordsCount = new Map<string, number>()

  for (const item of media) {
    for (const candidate of getCandidatePhrases(String(item.path), options)) {
      const current = counts.get(candidate.word) || 0
      counts.set(candidate.word, current + candidate.weight)
      if (!samples.has(candidate.word)) samples.set(candidate.word, candidate.sample)
      if (!wordsCount.has(candidate.word)) wordsCount.set(candidate.word, candidate.words)
    }
  }

  return [...counts.entries()]
    .map(([word, occurrences]) => ({
      word,
      occurrences,
      sample: samples.get(word),
      words: wordsCount.get(word) || 1,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
}

export function filterExistingTags(candidates: PathTokenCount[], tags: TagLike[] = []) {
  const existing = new Set(tags.map((tag) => normalizeTagLookupName(tag.name)).filter(Boolean))
  return candidates.filter((candidate) => !existing.has(normalizeTagLookupName(candidate.word)))
}
