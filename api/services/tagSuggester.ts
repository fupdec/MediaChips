import type {ApiDb, AnyRecord, MediaLike, TagLike} from '../types/db'
import {cosineSimilarity, embedText} from './embeddingModel'
import {createTagsRepository} from '../db/repositories/tags'
import {
  compareSuggestions,
  countPathTokens,
  filterExistingTags,
  getCandidatePhrases,
  pickTopSuggestions,
  type PathTokenCount,
  type TagPhraseCandidate,
} from './tagSuggesterPhrases'

interface TagCluster {
  word: string
  occurrences: number
  docs: number
  sample: string
  wordCount: number
  best: TagPhraseCandidate
  embedding: number[]
  words: string[]
}

async function clusterCandidates(db: ApiDb, candidates: PathTokenCount[], settings: AnyRecord = {}) {
  if (!settings.useML) {
    return candidates.map((item) => ({
      ...item,
      cluster: [item.word],
    }))
  }

  const threshold = Number(settings.clusterThreshold || 0.88)
  const clusters: TagCluster[] = []

  for (const candidate of candidates) {
    const embedding = await embedText(db, candidate.word)
    let found: TagCluster | null = null

    for (const cluster of clusters) {
      // Keep multi-word phrases distinct from singles (and from other lengths).
      if (cluster.wordCount !== candidate.words) continue
      const similarity = cosineSimilarity(embedding, cluster.embedding)
      if (similarity >= threshold) {
        found = cluster
        break
      }
    }

    if (found) {
      found.occurrences = (found.occurrences || 0) + candidate.occurrences
      found.docs = (found.docs || 0) + (candidate.docs || 0)
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
          docs: candidate.docs,
        }
      }
    } else {
      clusters.push({
        word: candidate.word,
        occurrences: candidate.occurrences,
        docs: candidate.docs || 1,
        sample: candidate.sample || candidate.word,
        wordCount: candidate.words,
        best: {
          word: candidate.word,
          source: 'path',
          sample: candidate.sample || candidate.word,
          words: candidate.words,
          weight: candidate.occurrences,
          occurrences: candidate.occurrences,
          docs: candidate.docs,
        },
        embedding,
        words: [candidate.word],
      })
    }
  }

  return clusters
    .map(({embedding: _embedding, best: _best, wordCount, ...cluster}) => ({
      word: cluster.word,
      occurrences: cluster.occurrences,
      docs: cluster.docs,
      sample: cluster.sample,
      words: wordCount,
      cluster: cluster.words,
    }))
    .sort(compareSuggestions)
}

async function suggestTagsFromMedia(db: ApiDb, media: MediaLike[], settings: AnyRecord = {}) {
  const limit = Math.max(1, Number(settings.limit || 100))
  let candidates = countPathTokens(media, {
    folderWeight: Number(settings.folderWeight) || undefined,
    maxWords: Number(settings.maxWords) || undefined,
  })

  if (settings.excludeExisting !== false) {
    const tags = settings.tags || createTagsRepository(db.drizzle, db.sqlite).findAllNames()
    candidates = filterExistingTags(candidates, tags as TagLike[])
  }

  // Keep a wider pool so reserved multi-word phrases are not dropped early.
  candidates = pickTopSuggestions(candidates, Math.max(limit * 4, limit))
  const clustered = await clusterCandidates(db, candidates, settings)

  return pickTopSuggestions(
    clustered.map((item) => ({
      word: item.word,
      occurrences: item.occurrences,
      sample: item.sample,
      words: item.words,
      docs: item.docs || 1,
      cluster: item.cluster,
    })),
    limit,
  )
}

export {countPathTokens, getCandidatePhrases, pickTopSuggestions, suggestTagsFromMedia}
