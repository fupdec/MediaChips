import {searchTmdbPeople, getTmdbPerson, type TmdbPersonSearchHit} from './tmdbApi'
import {
  applyTmdbPersonExtrasToTag,
  type TmdbPersonApplyFieldKey,
  type TmdbPersonExtras,
} from './tmdbPersonApply'
import type {Meta, Tag} from '@/types/stores'

export interface TmdbPersonAutoScrapeResult {
  success: boolean
  tagId: number
  tagName: string
  personName?: string
  error?: string
}

const ALL_FIELDS: TmdbPersonApplyFieldKey[] = [
  'name',
  'synonyms',
  'bio',
  'birthday',
  'deathday',
  'place_of_birth',
  'known_for',
  'gender',
  'image',
]

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
}

function scorePerson(query: string, hit: TmdbPersonSearchHit): number {
  const q = normalize(query)
  if (!q) return 0
  const name = normalize(hit.name)
  const original = normalize(hit.originalName)
  if (name === q || original === q) return 900
  if (name.startsWith(q) || original.startsWith(q)) return 700
  if (name.includes(q) || original.includes(q)) return 500
  if (q.includes(name) && name.length > 2) return 400
  return Number(hit.popularity) || 0
}

export function findBestMatchingTmdbPerson(
  query: string,
  hits: TmdbPersonSearchHit[] = [],
): TmdbPersonSearchHit | null {
  if (!hits.length) return null
  const ranked = [...hits].sort(
    (a, b) => scorePerson(query, b) - scorePerson(query, a),
  )
  return ranked[0] || null
}

function collectSearchQueries(tag: Tag, query?: string): string[] {
  const queries: string[] = []
  const push = (value: unknown) => {
    const trimmed = String(value ?? '').trim()
    if (trimmed && !queries.includes(trimmed)) queries.push(trimmed)
  }
  push(query)
  push(tag.name)
  if (tag.synonyms) {
    for (const synonym of String(tag.synonyms).split(',')) push(synonym)
  }
  return queries
}

export async function autoScrapeTmdbPersonTag({
  tag,
  meta,
  dbPath,
  query,
}: {
  tag: Tag
  meta: Meta
  dbPath: string
  query?: string
}): Promise<TmdbPersonAutoScrapeResult> {
  const tagId = Number(tag.id)
  const tagName = String(tag.name || query || '')
  const searchQueries = collectSearchQueries(tag, query)

  try {
    let hit: TmdbPersonSearchHit | null = null
    let usedQuery = searchQueries[0] || tagName

    for (const candidate of searchQueries) {
      const {results} = await searchTmdbPeople({query: candidate, limit: 10})
      hit = findBestMatchingTmdbPerson(candidate, results || [])
      if (hit) {
        usedQuery = candidate
        break
      }
    }

    if (!hit) {
      return {success: false, tagId, tagName, error: 'not_found'}
    }

    const {extras} = await getTmdbPerson(hit.id)
    const selectedFields = ALL_FIELDS.filter((key) => {
      if (key === 'image') return Boolean(extras.image)
      if (key === 'synonyms') return Boolean(extras.synonyms)
      if (key === 'bio') return Boolean(extras.bio)
      if (key === 'name') return Boolean(extras.name)
      return Boolean((extras as TmdbPersonExtras)[key])
    })

    const applyResult = await applyTmdbPersonExtrasToTag({
      tag,
      meta,
      extras,
      selectedFields,
      dbPath,
    })

    if (!applyResult.success) {
      return {
        success: false,
        tagId,
        tagName,
        personName: extras.name || hit.name,
        error: applyResult.error || 'apply_failed',
      }
    }

    return {
      success: true,
      tagId,
      tagName: extras.name || tagName || usedQuery,
      personName: extras.name || hit.name,
      error: applyResult.imageFailed ? 'image_failed' : undefined,
    }
  } catch (error) {
    return {
      success: false,
      tagId,
      tagName,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
