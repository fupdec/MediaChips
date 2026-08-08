import type {MediaLike, TagLike} from '../types/db'
import type {PathToken, TokenizeOptions} from '../types/pathTokenizer'
import {tokenizeFilePath} from './pathTokenizer'
import {normalizeTagLookupName} from '../../shared/tagLookupName'

export interface TagPhraseCandidate {
  word: string
  source: string
  sample: string
  words: number
  weight: number
  occurrences?: number
  docs?: number
  cluster?: string[]
}

export interface PathTokenCount {
  word: string
  occurrences: number
  sample?: string
  words: number
  /** Number of media paths that contained this phrase. */
  docs: number
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
  const maxWords = Math.min(Math.max(1, Number(options.maxWords || 3)), 3)

  for (const entries of grouped.values()) {
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

  // Bridge the two deepest single-token folders (`/Eva/Angelina/x.mp4` →
  // "eva angelina"). Multi-token folders are covered above; ignoring longer
  // root runs avoids noise like "volumes pron" / "pron photo".
  if (maxWords >= 2 && parsed.folders.length >= 2) {
    const lastTwo = parsed.folders.slice(-2)
    const left = parsed.tokens.filter(
      (entry) => entry.source === 'folder' && entry.segment === lastTwo[0],
    )
    const right = parsed.tokens.filter(
      (entry) => entry.source === 'folder' && entry.segment === lastTwo[1],
    )
    if (left.length === 1 && right.length === 1) {
      const phraseEntries = [left[0], right[0]]
      const word = phraseEntries.map((entry) => entry.token).join(' ')
      const weight = phraseEntries.reduce((sum, entry) => sum + entry.weight, 0) / 2
      candidates.push({
        word,
        source: 'folder',
        sample: `${lastTwo[0]}/${lastTwo[1]}`,
        words: 2,
        weight,
      })
    }
  }

  return candidates
}

/** Rank score: prefer recurring multi-word phrases over common singles / numeric noise. */
export function suggestionScore(item: Pick<PathTokenCount, 'word' | 'occurrences' | 'words' | 'docs'>): number {
  const words = Math.max(1, Number(item.words) || 1)
  const occ = Number(item.occurrences) || 0
  const docs = Math.max(1, Number(item.docs) || 1)

  const multiBoost = words > 1
    ? (1.8 + 0.35 * (words - 1)) * (docs >= 2 ? 1.35 : 1)
    : 1
  const numericPenalty = words === 1 && /^\d+$/.test(item.word) ? 0.3 : 1

  return occ * multiBoost * numericPenalty
}

export function compareSuggestions(
  a: Pick<PathTokenCount, 'word' | 'occurrences' | 'words' | 'docs'>,
  b: Pick<PathTokenCount, 'word' | 'occurrences' | 'words' | 'docs'>,
): number {
  const scoreDiff = suggestionScore(b) - suggestionScore(a)
  if (scoreDiff !== 0) return scoreDiff
  const wordsDiff = (b.words || 1) - (a.words || 1)
  if (wordsDiff !== 0) return wordsDiff
  const docsDiff = (b.docs || 0) - (a.docs || 0)
  if (docsDiff !== 0) return docsDiff
  return a.word.localeCompare(b.word)
}

/**
 * Keep strong multi-word phrases in the top-N even when singles dominate by raw count.
 */
export function pickTopSuggestions(candidates: PathTokenCount[], limit: number): PathTokenCount[] {
  const capped = Math.max(0, Math.floor(Number(limit) || 0))
  if (!capped || !candidates.length) return []

  const sorted = [...candidates].sort(compareSuggestions)
  if (sorted.length <= capped) return sorted

  const multi = sorted.filter((item) => (item.words || 1) > 1)
  const recurringMulti = multi.filter((item) => (item.docs || 0) >= 2)
  const preferredMulti = recurringMulti.length ? recurringMulti : multi

  const reserved = Math.min(
    preferredMulti.length,
    Math.max(Math.ceil(capped * 0.4), Math.min(preferredMulti.length, 8)),
  )

  const chosen: PathTokenCount[] = []
  const seen = new Set<string>()

  for (const item of preferredMulti.slice(0, reserved)) {
    chosen.push(item)
    seen.add(item.word)
  }

  for (const item of sorted) {
    if (chosen.length >= capped) break
    if (seen.has(item.word)) continue
    chosen.push(item)
    seen.add(item.word)
  }

  return chosen.sort(compareSuggestions)
}

export function countPathTokens(
  media: MediaLike[],
  options: TokenizeOptions & {maxWords?: number} = {},
): PathTokenCount[] {
  const counts = new Map<string, number>()
  const docs = new Map<string, number>()
  const samples = new Map<string, string>()
  const wordsCount = new Map<string, number>()

  for (const item of media) {
    const seenInPath = new Set<string>()
    for (const candidate of getCandidatePhrases(String(item.path), options)) {
      counts.set(candidate.word, (counts.get(candidate.word) || 0) + candidate.weight)
      if (!seenInPath.has(candidate.word)) {
        seenInPath.add(candidate.word)
        docs.set(candidate.word, (docs.get(candidate.word) || 0) + 1)
      }
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
      docs: docs.get(word) || 1,
    }))
    .sort(compareSuggestions)
}

export function filterExistingTags(candidates: PathTokenCount[], tags: TagLike[] = []) {
  const existing = new Set(tags.map((tag) => normalizeTagLookupName(tag.name)).filter(Boolean))
  return candidates.filter((candidate) => !existing.has(normalizeTagLookupName(candidate.word)))
}
