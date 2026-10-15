import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const {
  streamParseLibraryTagsPreview,
  applyParseLibraryTags,
  createTags,
  ensureStarterMeta,
  reloadTagsCatalog,
  parsePathTags,
  postTagsInMedia,
} = vi.hoisted(() => ({
  streamParseLibraryTagsPreview: vi.fn(),
  applyParseLibraryTags: vi.fn(),
  createTags: vi.fn(),
  ensureStarterMeta: vi.fn().mockResolvedValue({alreadyReady: true, createdFields: 0, pinnedFields: 0}),
  reloadTagsCatalog: vi.fn().mockResolvedValue(undefined),
  parsePathTags: vi.fn(),
  postTagsInMedia: vi.fn().mockResolvedValue({data: {}}),
}))

vi.mock('@/services/typedApi', () => ({
  typedApi: {
    streamParseLibraryTagsPreview,
    applyParseLibraryTags,
    createTags,
    parsePathTags,
    postTagsInMedia,
  },
}))

vi.mock('@/services/ensureStarterMeta', async () => {
  const actual = await vi.importActual<typeof import('@/services/ensureStarterMeta')>('@/services/ensureStarterMeta')
  return {
    ...actual,
    ensureStarterMeta,
  }
})

vi.mock('@/composable/appCatalogs', () => ({
  reloadTagsCatalog,
}))

import {useAppStore} from '@/stores/app'
import {useSettingsStore} from '@/stores/settings'
import {
  acceptSuggestedTagsAndAssign,
  applyImportPathAutoTags,
  previewImportPathTagAssignments,
  parseAndAssignImportPathTags,
} from '@/services/importPathAutoTag'

describe('importPathAutoTag', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()

    const app = useAppStore()
    app.meta = [
      {
        id: 10,
        name: 'Tags',
        type: 'array',
        settings: {parser: true},
      } as never,
    ]
    app.tags = [{id: 1, name: 'Existing', metaId: 10} as never]
    app.mediaTypes = [
      {id: 1, type: 'video', name: 'Videos'} as never,
      {id: 2, type: 'image', name: 'Images'} as never,
    ]

    useSettingsStore().defaultTagCategoryId = 10

    streamParseLibraryTagsPreview.mockImplementation(async (_opts, onEvent) => {
      onEvent({
        type: 'complete',
        items: [
          {
            mediaId: 101,
            tags: [
              {tagId: 1, metaId: 10, tagName: 'Existing', isNew: true, willCreate: false},
              {tagId: 0, metaId: 10, tagName: 'NewFromPath', isNew: true, willCreate: true},
              {tagId: 2, metaId: 10, tagName: 'AlreadyLinked', isNew: false},
            ],
          },
        ],
      })
    })

    applyParseLibraryTags.mockResolvedValue({data: {applied: 2}})
    createTags.mockResolvedValue({data: {}})
    parsePathTags.mockResolvedValue({data: [{mediaId: 101, metaId: 10, tagId: 1}]})
  })

  it('previews only new path-tag assignments for media ids', async () => {
    const result = await previewImportPathTagAssignments([101, 0])
    expect(streamParseLibraryTagsPreview).toHaveBeenCalledWith(
      expect.objectContaining({mediaIds: [101]}),
      expect.any(Function),
    )
    expect(result.proposed).toBe(2)
    expect(result.assignments).toEqual([
      expect.objectContaining({mediaId: 101, tagId: 1, willCreate: false}),
      expect.objectContaining({mediaId: 101, tagName: 'NewFromPath', willCreate: true}),
    ])
  })

  it('uses the local import parser and assigns its results for readable remote paths', async () => {
    const paths = [{path: '/Кино/Existing/clip.mp4', mediaId: 101}]
    await parseAndAssignImportPathTags(paths)
    expect(parsePathTags).toHaveBeenCalledWith({paths})
    expect(postTagsInMedia).toHaveBeenCalledWith([{mediaId: 101, metaId: 10, tagId: 1}])
    expect(reloadTagsCatalog).toHaveBeenCalled()
    expect(ensureStarterMeta).not.toHaveBeenCalled()
  })

  it('skips empty imports and paths with no tags, and propagates assignment failures for retry', async () => {
    await parseAndAssignImportPathTags([])
    expect(parsePathTags).not.toHaveBeenCalled()
    parsePathTags.mockResolvedValueOnce({data: []})
    await parseAndAssignImportPathTags([{path: '/clip.mp4', mediaId: 101}])
    expect(postTagsInMedia).not.toHaveBeenCalled()
    postTagsInMedia.mockRejectedValueOnce(new Error('assignment failed'))
    await expect(parseAndAssignImportPathTags([{path: '/Existing/clip.mp4', mediaId: 101}]))
      .rejects.toThrow('assignment failed')
  })

  it('does not link parsed tags after the active library changes', async () => {
    let stopped = false
    parsePathTags.mockImplementationOnce(async () => {
      stopped = true
      return {data: [{mediaId: 101, metaId: 10, tagId: 1}]}
    })
    await parseAndAssignImportPathTags([{path: '/Existing/clip.mp4', mediaId: 101}], {shouldStop: () => stopped})
    expect(postTagsInMedia).not.toHaveBeenCalled()
    expect(reloadTagsCatalog).not.toHaveBeenCalled()
  })

  it('applies path auto-tags create+assign for a media batch', async () => {
    const result = await applyImportPathAutoTags([101])
    expect(ensureStarterMeta).toHaveBeenCalled()
    expect(applyParseLibraryTags).toHaveBeenCalledWith({
      assignments: expect.arrayContaining([
        expect.objectContaining({mediaId: 101, tagName: 'NewFromPath'}),
      ]),
    })
    expect(reloadTagsCatalog).toHaveBeenCalled()
    expect(result.applied).toBe(2)
    expect(result.createdTags).toBe(1)
  })

  it('accept-all creates missing names then re-parses to assign', async () => {
    const result = await acceptSuggestedTagsAndAssign(['BrandNew', 'Existing'], [101])
    expect(createTags).toHaveBeenCalledWith(
      [{name: 'BrandNew', metaId: 10}],
      {onTrashNameConflict: 'create'},
    )
    expect(applyParseLibraryTags).toHaveBeenCalled()
    expect(result.createdTags).toBe(1)
    expect(result.createdNames).toEqual(['BrandNew'])
    expect(result.applied).toBe(2)
  })
})
