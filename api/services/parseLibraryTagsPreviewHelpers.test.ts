import {describe, expect, it} from 'vitest'
import {
  assignmentKey,
  buildParseLibraryTagsSummary,
  createPreviewTagCollector,
  previewTagKey,
} from './parseLibraryTagsPreviewHelpers'
import {resolveParseLibraryPreviewMediaItems} from './parseLibraryTagsPreview'

describe('parseLibraryTagsPreviewHelpers', () => {
  it('builds stable assignment and preview keys', () => {
    expect(assignmentKey(1, 2, 3)).toBe('1:2:3')
    expect(previewTagKey({metaId: 2, tagId: 3, tagName: 'A'})).toBe('id:2:3')
    expect(previewTagKey({metaId: 2, tagId: 0, tagName: ' New ', willCreate: true})).toBe('new:2:new')
  })

  it('dedupes preview tags and counts new/proposed', () => {
    const collector = createPreviewTagCollector()
    collector.push({
      tagId: 1, metaId: 2, tagName: 'A', metaName: 'Cat', isNew: true,
    })
    collector.push({
      tagId: 1, metaId: 2, tagName: 'A', metaName: 'Cat', isNew: true,
    })
    collector.push({
      tagId: 2, metaId: 2, tagName: 'B', metaName: 'Cat', isNew: false,
    })
    expect(collector.tags).toHaveLength(2)
    expect(collector.totalNewTags).toBe(1)
    expect(collector.totalProposedTags).toBe(2)
    expect(collector.hasNew()).toBe(true)
  })

  it('builds complete summaries', () => {
    expect(buildParseLibraryTagsSummary({
      totalMedia: 10,
      mediaWithNewTags: 3,
      totalNewTags: 5,
      totalProposedTags: 8,
      stopped: true,
    })).toEqual({
      totalMedia: 10,
      mediaWithNewTags: 3,
      totalNewTags: 5,
      totalProposedTags: 8,
      stopped: true,
    })
  })

  it('scopes preview media ids when provided', () => {
    const all = [
      {id: 1, path: '/a'},
      {id: 2, path: '/b'},
      {id: 3, path: '/c'},
    ]
    expect(resolveParseLibraryPreviewMediaItems(all, [2, 3]).map((row) => row.id)).toEqual([2, 3])
    expect(resolveParseLibraryPreviewMediaItems(all, []).map((row) => row.id)).toEqual([1, 2, 3])
    expect(resolveParseLibraryPreviewMediaItems(all, null).map((row) => row.id)).toEqual([1, 2, 3])
  })
})
