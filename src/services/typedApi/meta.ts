import { apiClient } from '../apiClient'
import {
  API_ROUTES,
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
  apiTagsInMedia,
  apiTagsInTag,
  apiValuesInMedia,
  apiValuesInTag,
} from '@shared/api/routes'
import type { Meta, Tag, MarkFilterMeta, MetaWritePayload } from '@shared/entities/meta'
import type { RemoveTagFromItemPayload } from '@shared/api/responses'
import type {
  CreateTagPayload,
  CreateTagsInMediaOnePayload,
  MediaTypeWritePayload,
  MetaAssignmentOrderPayload,
  MetaAssignmentUpdatePayload,
  ParsePathTagsPayload,
  PinChildMetaPayload,
  PinMetaAssignmentPayload,
  PostTagItemsPayload,
} from '@shared/api/payloads'
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

  applyParseLibraryTags(body: { assignments: Array<{ mediaId: number; tagId: number; metaId: number }> }) {
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
}
