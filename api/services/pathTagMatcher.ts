import type { AnyRecord, MetaLike, TagLike } from '../types/db'

import {
  buildTagPathIndex,
  exactMatchPath as exactMatchPathCore,
  extractPathPhrases,
  matchPathToTagsFromPhrasesWithIndex,
  matchPathsToTagsBatch,
  type TagLikeForParser,
} from '../../shared/pathParser/core'

function toParserTags(tags: TagLike[]): TagLikeForParser[] {
  return tags.flatMap((tag) => {
    if (tag.id == null) return []
    return [{
      id: tag.id,
      metaId: tag.metaId,
      name: typeof tag.name === 'string' ? tag.name : null,
      synonyms: typeof tag.synonyms === 'string' ? tag.synonyms : null,
    }]
  })
}

function toParserTag(tag: TagLike): TagLikeForParser | null {
  if (tag.id == null) return null
  return {
    id: tag.id,
    metaId: tag.metaId,
    name: typeof tag.name === 'string' ? tag.name : null,
    synonyms: typeof tag.synonyms === 'string' ? tag.synonyms : null,
  }
}

function getMatchOptions(settings: AnyRecord = {}) {
  return {
    preferLongestMatch: settings.preferLongestMatch !== false,
    minTokenLength: Number(settings.minTokenLength) > 0 ? Number(settings.minTokenLength) : 2,
    matchPrecision: Number(settings.matchPrecision ?? settings['pathParser.matchPrecision'] ?? 0.5),
  }
}

function filterEligibleTags(tags: TagLike[], metas: MetaLike[], settings: AnyRecord = {}) {
  const parserMetaIds = new Set(
    metas
      .filter((meta) => meta.parser)
      .map((meta) => Number(meta.id))
  )
  const requestedMetaIds = Array.isArray(settings.metaIds) && settings.metaIds.length
    ? new Set((settings.metaIds as unknown[]).map(Number))
    : null

  return tags.filter((tag) => {
    const metaId = Number(tag.metaId)
    if (!parserMetaIds.has(metaId)) return false
    if (requestedMetaIds && !requestedMetaIds.has(metaId)) return false
    return true
  })
}

function mapMatches(matches: Array<{
  tagId: unknown
  metaId: unknown
  mediaId: unknown
  score: number
  source: string
}>) {
  return matches.map((match) => ({
    tagId: match.tagId,
    metaId: match.metaId,
    mediaId: match.mediaId,
    score: match.score,
    source: match.source,
  }))
}

function exactMatchPath(filePath: string, tag: TagLike, settings: AnyRecord = {}) {
  const parserTag = toParserTag(tag)
  if (!parserTag) return false
  return exactMatchPathCore(filePath, parserTag, getMatchOptions(settings))
}

async function matchPathToTags(
  _db: unknown,
  filePath: string,
  mediaId: unknown,
  tags: TagLike[],
  metas: MetaLike[],
  settings: AnyRecord = {},
) {
  const eligibleTags = toParserTags(filterEligibleTags(tags, metas, settings))
  const matchOptions = getMatchOptions(settings)
  const parsed = extractPathPhrases(filePath, matchOptions)
  const index = buildTagPathIndex(eligibleTags, matchOptions)
  const matches = matchPathToTagsFromPhrasesWithIndex(parsed, mediaId, index, matchOptions)
  return mapMatches(matches)
}

function matchPathsToTags(
  paths: Array<{ path: string; mediaId: unknown }>,
  tags: TagLike[],
  metas: MetaLike[],
  settings: AnyRecord = {},
) {
  const eligibleTags = toParserTags(filterEligibleTags(tags, metas, settings))
  const matches = matchPathsToTagsBatch(paths, eligibleTags, getMatchOptions(settings))
  return mapMatches(matches)
}

export {
  buildTagPathIndex,
  exactMatchPath,
  extractPathPhrases,
  filterEligibleTags,
  matchPathToTags,
  matchPathsToTags,
}
