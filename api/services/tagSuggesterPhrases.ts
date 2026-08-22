import type {MediaLike} from '../types/db'
import type {PathToken, TokenizeOptions} from '../types/pathTokenizer'
import {tokenizeFilePath, cleanComparable} from './pathTokenizer'
import {normalizeTagLookupName, getTagLookupNames} from '../../shared/tagLookupName'
import type {TagLookupLike} from '../../shared/tagLookupName'

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

  // Multi-word phrases that appear in 2+ paths get a strong boost so they
  // outrank high-frequency single-word tokens (e.g. "Cheryl blossom" over "Cheryl").
  const multiDocBoost = words > 1 && docs >= 2
    ? 2.0 + 0.75 * Math.min(docs - 2, 8)
    : 1
  const multiBase = words > 1 ? (2.5 + 0.5 * (words - 1)) : 1
  const numericPenalty = words === 1 && /^\d+$/.test(item.word) ? 0.3 : 1

  return occ * multiBase * multiDocBoost * numericPenalty
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
 * Pick the top `limit` candidates purely by score. Multi-word and single-word
 * tags compete on the same ranking so single-word tags are not suppressed.
 */
export function pickTopSuggestions(candidates: PathTokenCount[], limit: number): PathTokenCount[] {
  const capped = Math.max(0, Math.floor(Number(limit) || 0))
  if (!capped || !candidates.length) return []

  return [...candidates]
    .sort(compareSuggestions)
    .slice(0, capped)
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

export function filterExistingTags(candidates: PathTokenCount[], tags: TagLookupLike[] = []) {
  const existingCompact = new Set<string>()

  for (const tag of tags) {
    for (const name of getTagLookupNames(tag)) {
      if (!name) continue
      existingCompact.add(cleanComparable(name))
    }
  }

  return candidates.filter((candidate) => {
    const normalized = normalizeTagLookupName(candidate.word)
    if (!normalized) return false
    if (existingCompact.has(cleanComparable(normalized))) return false
    return true
  })
}

/**
 * Remove candidates whose word (or cleanCompact form) matches an entry in the
 * user's ban list. The ban list is a JSON array of strings stored as a setting.
 */
export function filterBannedCandidates(candidates: PathTokenCount[], banListRaw: string): PathTokenCount[] {
  if (!candidates.length || !banListRaw) return candidates

  let banned: string[]
  try {
    banned = JSON.parse(banListRaw)
  } catch {
    return candidates
  }
  if (!Array.isArray(banned) || !banned.length) return candidates

  const bannedCompact = new Set<string>()
  for (const entry of banned) {
    const phrase = String(entry || '').trim()
    if (!phrase) continue
    bannedCompact.add(cleanComparable(phrase))
  }

  return candidates.filter((candidate) => {
    if (bannedCompact.has(cleanComparable(candidate.word))) return false
    return true
  })
}
