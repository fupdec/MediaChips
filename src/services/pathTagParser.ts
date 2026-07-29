import type { AssignedMeta } from '@/types/stores'
import type { Tag } from '@/types/stores'
import type { ParsePathTagEntry } from '@shared/api/responses'
import { matchPathToTags } from '@shared/pathParser/core'
import { extractPathRegexTagNames } from '@shared/pathParser/regexMeta'
import { useSettingsStore } from '@/stores/settings'

function findLocalTag(tags: Tag[], metaId: number, tagName: string): Tag | undefined {
  const needle = tagName.trim().toLowerCase()
  if (!needle) return undefined

  return tags.find((tag) => {
    if (Number(tag.metaId) !== metaId) return false
    if (String(tag.name || '').trim().toLowerCase() === needle) return true
    const synonyms = String(tag.synonyms || '')
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
    return synonyms.includes(needle)
  })
}

export function parseFilePath(
  filePath: string,
  mediaId: number,
  { tags = [], assigned = [] }: { tags?: Tag[]; assigned?: AssignedMeta[] } = {},
): ParsePathTagEntry[] {
  const settings = useSettingsStore()
  const parserAssigned = assigned.filter((item) => item.meta?.parser)
  const parserMetaIds = new Set(
    parserAssigned.map((item) => Number(item.metaId)),
  )

  const eligibleTags = tags.filter(
    (tag): tag is Tag & { metaId: number } =>
      tag.metaId != null && parserMetaIds.has(Number(tag.metaId)),
  )
  const matches = matchPathToTags(filePath, mediaId, eligibleTags, {
    preferLongestMatch: settings['pathParser.preferLongestMatch'] === 'true',
    matchPrecision: Number(settings['pathParser.matchPrecision'] || 0.5),
  })

  const merged = new Map<string, ParsePathTagEntry>()
  for (const match of matches) {
    const tagId = Number(match.tagId)
    const metaId = Number(match.metaId)
    if (!tagId || !metaId) continue
    merged.set(`${mediaId}:${metaId}:${tagId}`, {
      tagId,
      metaId,
      mediaId,
    })
  }

  const regexMetas = parserAssigned
    .map((item) => item.meta)
    .filter((meta): meta is NonNullable<typeof meta> => Boolean(meta?.id))

  const extracts = extractPathRegexTagNames(filePath, regexMetas)
  for (const extract of extracts) {
    const existing = findLocalTag(eligibleTags, extract.metaId, extract.tagName)
    if (!existing?.id) continue
    const tagId = Number(existing.id)
    merged.set(`${mediaId}:${extract.metaId}:${tagId}`, {
      tagId,
      metaId: extract.metaId,
      mediaId,
    })
  }

  return [...merged.values()]
}
