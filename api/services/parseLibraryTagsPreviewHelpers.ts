export type PreviewTagLike = {
  tagId: number
  metaId: number
  tagName: string
  metaName: string
  isNew: boolean
  willCreate?: boolean
}

export type ParseLibraryTagsSummaryLike = {
  totalMedia: number
  mediaWithNewTags: number
  totalNewTags: number
  totalProposedTags: number
  stopped: boolean
}

export function assignmentKey(mediaId: number, metaId: number, tagId: number) {
  return `${mediaId}:${metaId}:${tagId}`
}

export function previewTagKey(
  tag: Pick<PreviewTagLike, 'metaId' | 'tagId' | 'tagName' | 'willCreate'>,
) {
  if (tag.willCreate) {
    return `new:${tag.metaId}:${String(tag.tagName || '').trim().toLowerCase()}`
  }
  return `id:${tag.metaId}:${tag.tagId}`
}

export function buildParseLibraryTagsSummary(input: {
  totalMedia: number
  mediaWithNewTags: number
  totalNewTags: number
  totalProposedTags: number
  stopped?: boolean
}): ParseLibraryTagsSummaryLike {
  return {
    totalMedia: input.totalMedia,
    mediaWithNewTags: input.mediaWithNewTags,
    totalNewTags: input.totalNewTags,
    totalProposedTags: input.totalProposedTags,
    stopped: Boolean(input.stopped),
  }
}

/** Deduping preview-tag accumulator with new/proposed counters. */
export function createPreviewTagCollector() {
  const seenPreviewKeys = new Set<string>()
  const tags: PreviewTagLike[] = []
  let totalNewTags = 0
  let totalProposedTags = 0

  return {
    push(tag: PreviewTagLike) {
      const key = previewTagKey(tag)
      if (seenPreviewKeys.has(key)) return false
      seenPreviewKeys.add(key)
      if (tag.isNew) totalNewTags += 1
      totalProposedTags += 1
      tags.push(tag)
      return true
    },
    get tags() {
      return tags
    },
    get totalNewTags() {
      return totalNewTags
    },
    get totalProposedTags() {
      return totalProposedTags
    },
    hasNew() {
      return tags.some((tag) => tag.isNew)
    },
  }
}
