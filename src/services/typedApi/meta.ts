import { apiClient } from '../apiClient'
import {
  API_ROUTES,
  apiChipRecipeCatalogFile,
  apiEntity,
  apiItemTagsEndpoint,
  apiItemTagsEndpointDelete,
  apiMediaType,
  apiMeta,
  apiMetaInMediaTypeByMediaType,
  apiMetaInMediaTypeByMeta,
  apiMetaInMediaTypeDelete,
  apiMetaSetting,
  apiPinnedMetaByMeta,
  apiPinnedMetaByPinned,
  apiPinnedMetaDelete,
  apiRemoveTagFromItem,
  apiTagCooccurring,
  apiTagAssignmentCounts,
  apiTagsInMedia,
  apiTagsInFolder,
  apiTagsInTag,
  apiValuesInMedia,
  apiValuesInTag,
} from '@shared/api/routes'
import type {ChipRecipe, ChipRecipeCatalog} from '@shared/chipRecipe'
import {parseChipRecipe, parseChipRecipeCatalog} from '@shared/schemas/chipRecipe'
import type { Meta, Tag, MarkFilterMeta, MetaWritePayload } from '@shared/entities/meta'
import type {
  CreateTagPayload,
  CreateTagsInMediaOnePayload,
  DuplicateCategoryPayload,
  DuplicateTagPayload,
  MediaTypeWritePayload,
  MergeTagsPayload,
  MergeCategoriesPayload,
  MetaAssignmentOrderPayload,
  MetaAssignmentUpdatePayload,
  MoveTagsToCategoryPayload,
  ParsePathTagsPayload,
  PinChildMetaPayload,
  PinMetaAssignmentPayload,
  PostTagItemsPayload,
} from '@shared/api/payloads'
import type {
  MergeTagsResult,
  MergeCategoriesResult,
  MoveTagsToCategoryResult,
  RemoveTagFromItemPayload,
} from '@shared/api/responses'
import {
  parseAssignedMetaList,
  parseMeta,
  parseMediaType,
  parseMetaInMediaTypeAssignments,
  parseMetaInMediaTypeRows,
  parsePinnedChildMetaAssignments,
  parsePinnedMetaLinks,
  parseTagInTagEntries,
  parseTagItemsResponse,
  parseMetaList,
  parseMetaSetting,
  parsePathTagEntries,
  parseTag,
  parseTags,
  parseTagAssignmentCounts,
  parseTagsInMediaCreateOne,
  parseTagThumbsResponse,
  parseValueInTagEntries,
} from '@shared/schemas'
import { validated } from './validate'

export const metaApi = {
  getMetaById(id: number) {
    return apiClient.get(apiMeta(id)).then((res) => ({
      ...res,
      data: validated(parseMeta, res.data),
    }))
  },

  getMetaSetting(id: number) {
    return apiClient.get(apiMetaSetting(id)).then((res) => ({
      ...res,
      data: validated(parseMetaSetting, res.data),
    }))
  },

  getMediaTypeById(id: number) {
    return apiClient.get(apiMediaType(id)).then((res) => ({
      ...res,
      data: validated(parseMediaType, res.data),
    }))
  },

  getAssignedMetaForMeta(metaId: number) {
    return apiClient.get(apiMetaInMediaTypeByMeta(metaId)).then((res) => ({
      ...res,
      data: validated(parseMetaInMediaTypeAssignments, res.data),
    }))
  },

  getAssignedMetaForMediaType(mediaTypeId: number) {
    return apiClient.get(apiMetaInMediaTypeByMediaType(mediaTypeId)).then((res) => ({
      ...res,
      data: validated(parseMetaInMediaTypeRows, res.data),
    }))
  },

  getPinnedChildMeta(metaId: number) {
    return apiClient.get(apiPinnedMetaByMeta(metaId)).then((res) => ({
      ...res,
      data: validated(parsePinnedChildMetaAssignments, res.data),
    }))
  },

  getPinnedParentMeta(pinnedMetaId: number) {
    return apiClient.get(apiPinnedMetaByPinned(pinnedMetaId)).then((res) => ({
      ...res,
      data: validated(parsePinnedMetaLinks, res.data),
    }))
  },

  pinMetaToMediaType(body: PinMetaAssignmentPayload) {
    return apiClient.post(API_ROUTES.metaInMediaType, body)
  },

  unpinMetaFromMediaType(metaId: number, mediaTypeId: number) {
    return apiClient.delete(apiMetaInMediaTypeDelete(mediaTypeId, metaId))
  },

  updateMetaInMediaTypeOrder(metaId: number, mediaTypeId: number, order: number) {
    const body: MetaAssignmentOrderPayload = {
      metaId,
      mediaTypeId,
      data: { order },
    }
    return apiClient.put(API_ROUTES.metaInMediaType, body)
  },

  pinChildMeta(body: PinChildMetaPayload) {
    return apiClient.post(API_ROUTES.pinnedMeta, body)
  },

  unpinChildMeta(metaId: number, pinnedMetaId: number) {
    return apiClient.delete(apiPinnedMetaDelete(pinnedMetaId, metaId))
  },

  updateChildMetaOrder(metaId: number, pinnedMetaId: number, order: number) {
    const body: MetaAssignmentOrderPayload = {
      metaId,
      pinnedMetaId,
      data: { order },
    }
    return apiClient.put(API_ROUTES.pinnedMeta, body)
  },

  getTagsInTag(tagId: number) {
    return apiClient.get(apiTagsInTag(tagId)).then((res) => ({
      ...res,
      data: validated(parseTagInTagEntries, res.data),
    }))
  },

  getTagCooccurring(tagId: number, mediaTypeId?: number | null) {
    return apiClient.get(apiTagCooccurring(tagId, mediaTypeId)).then((res) => ({
      ...res,
      data: (Array.isArray(res.data) ? res.data : []) as Array<{
        id: number
        name: string
        metaId: number
        color: string | null
      }>,
    }))
  },

  getTagAssignmentCounts(tagId: number) {
    return apiClient.get(apiTagAssignmentCounts(tagId)).then((res) => ({
      ...res,
      data: validated(parseTagAssignmentCounts, res.data),
    }))
  },

  getValuesInTag(tagId: number) {
    return apiClient.get(apiValuesInTag(tagId)).then((res) => ({
      ...res,
      data: validated(parseValueInTagEntries, res.data),
    }))
  },

  getTagsInMedia(mediaId: number) {
    return apiClient.get(apiTagsInMedia(mediaId)).then((res) => ({
      ...res,
      data: validated(parseTagInTagEntries, res.data),
    }))
  },

  getTagsInFolder(folderPath: string) {
    return apiClient.get(apiTagsInFolder(folderPath)).then((res) => ({
      ...res,
      data: validated(parseTagInTagEntries, res.data),
    }))
  },

  getTagsInFoldersByPaths(paths: string[]) {
    return apiClient.post(API_ROUTES.tagsInFolderByPaths, {paths}).then((res) => ({
      ...res,
      data: (res.data || {}) as Record<string, ReturnType<typeof parseTagInTagEntries>>,
    }))
  },

  listFolderTags() {
    return apiClient.get(API_ROUTES.tagsInFolderList).then((res) => ({
      ...res,
      data: (Array.isArray(res.data) ? res.data : []) as Array<{
        id: number
        path: string
        tags: Array<{
          tagId: number
          metaId: number
          folderId?: number
          tag?: {id?: number; name?: string; color?: string | null} | null
        }>
      }>,
    }))
  },

  clearFolderTags(path: string) {
    return apiClient.post(API_ROUTES.tagsInFolderClearAll, {path})
  },

  createTagsInFolderOne(body: {path: string; tagId: number; metaId: number}) {
    return apiClient.post(API_ROUTES.tagsInFolderCreateOne, body)
  },

  postTagsInFolder(body: Array<{path: string; tagId: number; metaId: number}>) {
    return apiClient.post(API_ROUTES.tagsInFolder, body)
  },

  replaceFolderTagsForMeta(body: {path: string; metaId: number; tagIds: number[]}) {
    return apiClient.post(API_ROUTES.tagsInFolderReplaceForMeta, body)
  },

  deleteFolderTag(body: {path: string; tagId: number}) {
    return apiClient.post(`${API_ROUTES.tagsInFolder}/deleteFromFolder`, body)
  },

  deleteFolderTagsByMeta(body: {path: string; metaId: number}) {
    return apiClient.post(`${API_ROUTES.tagsInFolder}/deleteAllTagsByMetaId`, body)
  },

  remapFolderPaths(body: {find: string; replace: string}) {
    return apiClient.post(API_ROUTES.tagsInFolderRemapPaths, body)
  },

  getValuesInMedia(mediaId: number) {
    return apiClient.get(apiValuesInMedia(mediaId)).then((res) => ({
      ...res,
      data: validated(parseValueInTagEntries, res.data),
    }))
  },

  deleteItemTags(endpoint: string, itemId: number) {
    return apiClient.delete(apiItemTagsEndpointDelete(endpoint, itemId))
  },

  postItemTags(endpoint: string, tags: unknown[]) {
    return apiClient.post(apiItemTagsEndpoint(endpoint), tags)
  },

  deleteItemValues(endpoint: string, itemId: number) {
    return apiClient.delete(apiItemTagsEndpointDelete(endpoint, itemId))
  },

  postItemValues(endpoint: string, values: unknown[]) {
    return apiClient.post(apiItemTagsEndpoint(endpoint), values)
  },

  removeTagFromItem(type: string, body: RemoveTagFromItemPayload) {
    return apiClient.post(apiRemoveTagFromItem(type), body)
  },

  parsePathTags(body: ParsePathTagsPayload) {
    return apiClient.post(API_ROUTES.taskParsePathTags, body).then((res) => ({
      ...res,
      data: validated(parsePathTagEntries, res.data),
    }))
  },

  parseLibraryTagsStatus() {
    return apiClient.get(API_ROUTES.taskParseLibraryTagsStatus)
  },

  applyParseLibraryTags(body: {
    assignments: Array<{
      mediaId: number
      metaId: number
      tagId?: number
      tagName?: string
      willCreate?: boolean
    }>
  }) {
    return apiClient.post(API_ROUTES.taskApplyParseLibraryTags, body)
  },

  postTagItems(body: PostTagItemsPayload) {
    return apiClient.post(`${API_ROUTES.tag}/items`, body).then((res) => ({
      ...res,
      data: validated(parseTagItemsResponse, res.data),
    }))
  },

  createTagsInMediaOne(body: CreateTagsInMediaOnePayload) {
    return apiClient.post(API_ROUTES.tagsInMediaCreateOne, body).then((res) => ({
      ...res,
      data: validated(parseTagsInMediaCreateOne, res.data),
    }))
  },

  postTagsInMedia(body: unknown[]) {
    return apiClient.post(API_ROUTES.tagsInMedia, body)
  },

  createTags(body: CreateTagPayload[]) {
    return apiClient.post<Tag[]>(API_ROUTES.tag, body).then((res) => ({
      ...res,
      data: validated(parseTags, res.data),
    }))
  },

  mergeTags(body: MergeTagsPayload) {
    return apiClient.post<MergeTagsResult>(API_ROUTES.tagMerge, body)
  },

  moveTagsToCategory(body: MoveTagsToCategoryPayload) {
    return apiClient.post<MoveTagsToCategoryResult>(API_ROUTES.tagMoveToCategory, body)
  },

  mergeCategories(body: MergeCategoriesPayload) {
    return apiClient.post<MergeCategoriesResult>(API_ROUTES.metaMergeCategories, body)
  },

  duplicateMeta(body: DuplicateCategoryPayload) {
    return apiClient.post<{
      meta: Meta
      copied: {mediaTypeAssignments: number; pinnedFields: number}
    }>(API_ROUTES.metaDuplicate, body).then((res) => ({
      ...res,
      data: {
        ...res.data,
        meta: validated(parseMeta, res.data?.meta),
      },
    }))
  },

  duplicateTag(body: DuplicateTagPayload) {
    return apiClient.post<{
      tag: Tag
      copied: {values: number; nestedLinks: number; images: number}
    }>(API_ROUTES.tagDuplicate, body).then((res) => ({
      ...res,
      data: {
        ...res.data,
        tag: validated(parseTag, res.data?.tag),
      },
    }))
  },

  getTagById(id: number) {
    return apiClient.get(apiEntity('tag', id)).then((res) => ({
      ...res,
      data: validated(parseTag, res.data),
    }))
  },

  createMeta(body: MetaWritePayload) {
    return apiClient.post(API_ROUTES.meta, body).then((res) => ({
      ...res,
      data: validated(parseMeta, res.data),
    }))
  },

  exportChipRecipe(body: {
    metaIds?: number[]
    name: string
    id?: string
    description?: string
    author?: string
    category?: string
    sfw?: boolean
    includeTags?: boolean
  }) {
    return apiClient.post(API_ROUTES.metaExportChipRecipe, body).then((res) => ({
      ...res,
      data: validated(parseChipRecipe, res.data) as ChipRecipe,
    }))
  },

  previewChipRecipe(recipe: ChipRecipe) {
    return apiClient.post(API_ROUTES.metaPreviewChipRecipe, {recipe})
  },

  importChipRecipe(recipe: ChipRecipe) {
    return apiClient.post(API_ROUTES.metaImportChipRecipe, {recipe})
  },

  getChipRecipeCatalog() {
    return apiClient.get(API_ROUTES.metaChipRecipeCatalog).then((res) => {
      const data = res.data as ChipRecipeCatalog & {
        baseUrl?: string
        catalogUrl?: string
        discord?: {discordUrl?: string; filenameExample?: string; shareHint?: string}
      }
      const catalog = parseChipRecipeCatalog({
        updatedAt: data.updatedAt,
        recipes: data.recipes,
      })
      return {
        ...res,
        data: {
          ...catalog,
          baseUrl: data.baseUrl,
          catalogUrl: data.catalogUrl,
          discord: data.discord,
        },
      }
    })
  },

  getChipRecipeCatalogFile(relativePath: string) {
    return apiClient.get(apiChipRecipeCatalogFile(relativePath)).then((res) => ({
      ...res,
      data: validated(parseChipRecipe, res.data) as ChipRecipe,
    }))
  },


  updateMeta(id: number, data: MetaWritePayload) {
    return apiClient.put<Meta>(apiMeta(id), data)
  },

  deleteMeta(id: number) {
    return apiClient.delete(apiMeta(id))
  },

  getAllMetaInMediaType(params?: Record<string, unknown>) {
    return apiClient.get(API_ROUTES.metaInMediaType, { params }).then((res) => ({
      ...res,
      data: validated(parseAssignedMetaList, res.data),
    }))
  },

  getAllPinnedMeta(params?: Record<string, unknown>) {
    return apiClient.get(API_ROUTES.pinnedMeta, { params }).then((res) => ({
      ...res,
      data: validated(parseAssignedMetaList, res.data),
    }))
  },

  getMarkFilterMetas() {
    return apiClient.get(API_ROUTES.markFilterMetas).then((res) => ({
      ...res,
      data: validated(parseMetaList, res.data) as MarkFilterMeta[],
    }))
  },

  updatePinnedMetaAssignment(body: MetaAssignmentUpdatePayload) {
    return apiClient.put(API_ROUTES.pinnedMeta, body)
  },

  updateMetaInMediaTypeAssignment(body: MetaAssignmentUpdatePayload) {
    return apiClient.put(API_ROUTES.metaInMediaType, body)
  },

  createMediaType(body: MediaTypeWritePayload) {
    return apiClient.post(API_ROUTES.mediaType, body).then((res) => ({
      ...res,
      data: validated(parseMediaType, res.data),
    }))
  },

  updateMediaType(id: number, data: MediaTypeWritePayload) {
    return apiClient.put(apiMediaType(id), data)
  },

  postTagThumbs(body: Record<string, unknown>) {
    return apiClient.post(API_ROUTES.tagThumbs, body).then((res) => ({
      ...res,
      data: validated(parseTagThumbsResponse, res.data),
    }))
  },

  listTagTrash(params?: {limit?: number}) {
    return apiClient.get<{
      items: Array<{
        kind: 'tag'
        id: number
        name: string | null
        deletedAt: string
        metaId?: number | null
      }>
      count: number
      retentionDays: number
    }>(API_ROUTES.tagTrashList, {params})
  },

  restoreTagTrash(body: {ids: number[]}) {
    return apiClient.post<{restoredIds: number[]}>(API_ROUTES.tagTrashRestore, body)
  },

  purgeTagTrash(body: {ids: number[]}) {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.tagTrashPurge, body)
  },

  purgeExpiredTagTrash() {
    return apiClient.post<{deletedIds: number[]}>(API_ROUTES.tagTrashPurgeExpired, {})
  },
}
