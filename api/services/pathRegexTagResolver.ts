import type { TagLike } from '../types/db'
import type { PathRegexTagExtract } from '../../shared/pathParser/regexMeta'
import {
  getTagLookupTerms,
  normalizeTagLookupName,
} from '@shared/tagLookupName'

export function findTagByNameOrSynonym(
  tags: TagLike[],
  metaId: number,
  tagName: string,
): TagLike | undefined {
  const needle = normalizeTagLookupName(tagName)
  if (!needle) return undefined

  return tags.find((tag) => {
    if (Number(tag.metaId) !== metaId) return false
    return getTagLookupTerms(tag).includes(needle)
  })
}

export type ResolvedPathRegexTag = {
  tagId: number
  metaId: number
  tagName: string
  created: boolean
}

export type ResolvePathRegexTagOptions = {
  createTag?: (metaId: number, tagName: string) => TagLike
}

/**
 * Resolve extracted path-regex tag names to tag ids.
 * Mutates `tags` when new tags are created so later lookups can reuse them.
 */
export function resolvePathRegexTagExtracts(
  extracts: PathRegexTagExtract[],
  tags: TagLike[],
  options: ResolvePathRegexTagOptions = {},
): ResolvedPathRegexTag[] {
  const resolved: ResolvedPathRegexTag[] = []
  const seen = new Set<string>()

  for (const extract of extracts) {
    const metaId = Number(extract.metaId)
    const tagName = String(extract.tagName || '').trim()
    if (!metaId || !tagName) continue

    const dedupeKey = `${metaId}:${normalizeTagLookupName(tagName)}`
    if (seen.has(dedupeKey)) continue

    let tag = findTagByNameOrSynonym(tags, metaId, tagName)
    let created = false

    if (!tag) {
      if (!extract.createTags || !options.createTag) continue
      tag = options.createTag(metaId, tagName)
      if (!tag || tag.id == null) continue
      tags.push(tag)
      created = true
    }

    const tagId = Number(tag.id)
    if (!tagId) continue

    seen.add(dedupeKey)
    resolved.push({
      tagId,
      metaId,
      tagName: String(tag.name || tagName),
      created,
    })
  }

  return resolved
}
