import type {ApiDb, AnyRecord, MediaLike, TagLike} from '../types/db'
import {cosineSimilarity, embedText} from './embeddingModel'
import {createTagsRepository} from '../db/repositories/tags'
import {
  countPathTokens,
  filterExistingTags,
  getCandidatePhrases,
  type PathTokenCount,
  type TagPhraseCandidate,
} from './tagSuggesterPhrases'

interface TagCluster {
  word: string
  occurrences: number
  sample: string
  best: TagPhraseCandidate
  embedding: number[]
  words: string[]
}

async function clusterCandidates(db: ApiDb, candidates: PathTokenCount[], settings: AnyRecord = {}) {
  if (!settings.useML) return candidates.map((i) => ({...i, cluster: [i.word]}))

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
    .map(({embedding: _embedding, best: _best, ...cluster}) => ({
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

export {countPathTokens, getCandidatePhrases, suggestTagsFromMedia}
