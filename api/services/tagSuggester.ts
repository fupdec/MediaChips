import type { ApiDb, AnyRecord, MediaLike, TagLike } from '../types/db'
import type { PathToken, TokenizeOptions } from '../types/pathTokenizer'
import { cosineSimilarity, embedText } from './embeddingModel'
import { tokenizeFilePath } from './pathTokenizer'
import { createTagsRepository } from '../db/repositories/tags'

interface TagCandidate {
  word: string
  source: string
  sample: string
  words: number
  weight: number
  occurrences?: number
  cluster?: string[]
}

interface PathTokenCount {
  word: string
  occurrences: number
  sample?: string
  words: number
}

interface TagCluster {
  word: string
  occurrences: number
  sample: string
  best: TagCandidate
  embedding: number[]
  words: string[]
}

function getCandidatePhrases(filePath: string, options: TokenizeOptions & { maxWords?: number } = {}) {
  const parsed = tokenizeFilePath(filePath, options)
  const grouped = new Map<string, PathToken[]>()

  for (const entry of parsed.tokens) {
    const key = `${entry.source}:${entry.segment}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(entry)
  }

  const candidates: TagCandidate[] = []
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

function countPathTokens(media: MediaLike[], options: TokenizeOptions & { maxWords?: number } = {}): PathTokenCount[] {
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

function filterExistingTags(candidates: PathTokenCount[], tags: TagLike[] = []) {
  const existing = new Set(tags.map((tag) => String(tag.name || '').trim().toLowerCase()))
  return candidates.filter(candidate => !existing.has(String(candidate.word || '').toLowerCase()))
}

async function clusterCandidates(db: ApiDb, candidates: PathTokenCount[], settings: AnyRecord = {}) {
  if (!settings.useML) return candidates.map((i) => ({ ...i, cluster: [i.word] }))

  const threshold = Number(settings.clusterThreshold || 0.88)
  const clusters: TagCluster[] = []

  for (const candidate of candidates) {
    const embedding = await embedText(db, candidate.word)
    let found: TagCluster | null = null

    for (const cluster of clusters) {
      const similarity = cosineSimilarity(embedding, cluster.embedding)
      if (similarity >= threshold) {
        found = cluster
        break
      }
    }

    if (found) {
      found.occurrences = (found.occurrences || 0) + candidate.occurrences
      found.words.push(candidate.word)
      if (candidate.occurrences > (found.best.occurrences || found.best.weight)) {
        found.word = candidate.word
        found.sample = candidate.sample || found.sample
        found.best = {
          word: candidate.word,
          source: 'path',
          sample: candidate.sample || candidate.word,
          words: candidate.words,
          weight: candidate.occurrences,
          occurrences: candidate.occurrences,
        }
      }
    } else {
      clusters.push({
        word: candidate.word,
        occurrences: candidate.occurrences,
        sample: candidate.sample || candidate.word,
        best: {
          word: candidate.word,
          source: 'path',
          sample: candidate.sample || candidate.word,
          words: candidate.words,
          weight: candidate.occurrences,
          occurrences: candidate.occurrences,
        },
        embedding,
        words: [candidate.word],
      })
    }
  }

  return clusters
    .map(({ embedding: _embedding, best: _best, ...cluster }) => ({
      ...cluster,
      cluster: cluster.words,
    }))
    .sort((a, b) => (b.occurrences || 0) - (a.occurrences || 0))
}

async function suggestTagsFromMedia(db: ApiDb, media: MediaLike[], settings: AnyRecord = {}) {
  const limit = Number(settings.limit || 100)
  let candidates = countPathTokens(media, {
    folderWeight: Number(settings.folderWeight) || undefined,
    maxWords: Number(settings.maxWords) || undefined,
  })

  if (settings.excludeExisting !== false) {
    const tags = settings.tags || createTagsRepository(db.drizzle, db.sqlite).findAllRaw()
    candidates = filterExistingTags(candidates, tags as TagLike[])
  }

  candidates = candidates.slice(0, limit * 3)
  const clustered = await clusterCandidates(db, candidates, settings)

  return clustered.slice(0, limit)
}

export { countPathTokens, getCandidatePhrases, suggestTagsFromMedia }
