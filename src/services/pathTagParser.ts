import type { AssignedMeta } from '@/types/stores'
import type { Tag } from '@/types/stores'
import type { ParsePathTagEntry } from '@shared/api/responses'
import { matchPathToTags } from '@shared/pathParser/core'
import { useSettingsStore } from '@/stores/settings'

export function parseFilePath(
  filePath: string,
  mediaId: number,
  { tags = [], assigned = [] }: { tags?: Tag[]; assigned?: AssignedMeta[] } = {},
): ParsePathTagEntry[] {
  const settings = useSettingsStore()
  const parserMetaIds = new Set(
    assigned
      .filter((item) => item.meta?.parser)
      .map((item) => Number(item.metaId))
  )

  const eligibleTags = tags.filter((tag) => parserMetaIds.has(Number(tag.metaId)))
  const matches = matchPathToTags(filePath, mediaId, eligibleTags, {
    preferLongestMatch: settings['pathParser.preferLongestMatch'] === 'true',
    matchPrecision: Number(settings['pathParser.matchPrecision'] || 0.5),
  })

  return matches.map((match) => ({
    tagId: Number(match.tagId),
    metaId: Number(match.metaId),
    mediaId: Number(match.mediaId),
  }))
}
