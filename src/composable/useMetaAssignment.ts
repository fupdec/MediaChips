import { sortPinnedAssignmentItems } from '@/utils/pinnedMetaOrder'
import { typedApi } from '@/services/typedApi'
import type { AssignedMeta, Meta } from '@/types/stores'
import type {
  MetaInMediaTypeAssignment,
  MetaInMediaTypeRow,
  PinnedChildMetaAssignment,
} from '@/types/metaAssignment'

export function useMetaAssignment() {
  const fetchPinnedMediaForMeta = async (metaId: number): Promise<MetaInMediaTypeAssignment[]> => {
    const response = await typedApi.getAssignedMetaForMeta(metaId)
    return sortPinnedAssignmentItems(response.data || [])
  }

  const fetchPinnedMetaForMediaType = async (mediaTypeId: number): Promise<MetaInMediaTypeRow[]> => {
    const response = await typedApi.getAssignedMetaForMediaType(mediaTypeId)
    return sortPinnedAssignmentItems(response.data || [])
  }

  const fetchPinnedChildMeta = async (metaId: number): Promise<PinnedChildMetaAssignment[]> => {
    const response = await typedApi.getPinnedChildMeta(metaId)
    return sortPinnedAssignmentItems(response.data || [])
  }

  const fetchAllMeta = async (): Promise<Meta[]> => {
    const response = await typedApi.getMeta()
    return response.data ?? []
  }

  const pinMetaToMediaType = async (metaId: number, mediaTypeId: number, order = 0) => {
    await typedApi.pinMetaToMediaType({ metaId, mediaTypeId, order })
  }

  const unpinMetaFromMediaType = async (metaId: number, mediaTypeId: number) => {
    await typedApi.unpinMetaFromMediaType(metaId, mediaTypeId)
  }

  const updateMetaInMediaTypeOrder = async (metaId: number, mediaTypeId: number, order: number) => {
    await typedApi.updateMetaInMediaTypeOrder(metaId, mediaTypeId, order)
  }

  const pinChildMeta = async (metaId: number, pinnedMetaId: number, order = 0) => {
    await typedApi.pinChildMeta({ metaId, pinnedMetaId, order })
  }

  const unpinChildMeta = async (metaId: number, pinnedMetaId: number) => {
    await typedApi.unpinChildMeta(metaId, pinnedMetaId)
  }

  const updateChildMetaOrder = async (metaId: number, pinnedMetaId: number, order: number) => {
    await typedApi.updateChildMetaOrder(metaId, pinnedMetaId, order)
  }

  const updateMetaInMediaTypeShow = async (metaId: number, mediaTypeId: number, show: boolean) => {
    await typedApi.updateMetaInMediaTypeAssignment({
      metaId,
      mediaTypeId,
      data: {show},
    })
  }

  const updateChildMetaShow = async (metaId: number, pinnedMetaId: number, show: boolean) => {
    await typedApi.updatePinnedMetaAssignment({
      metaId,
      pinnedMetaId,
      data: {show},
    })
  }

  return {
    fetchPinnedMediaForMeta,
    fetchPinnedMetaForMediaType,
    fetchPinnedChildMeta,
    fetchAllMeta,
    pinMetaToMediaType,
    unpinMetaFromMediaType,
    updateMetaInMediaTypeOrder,
    updateMetaInMediaTypeShow,
    pinChildMeta,
    unpinChildMeta,
    updateChildMetaOrder,
    updateChildMetaShow,
  }
}

export type { AssignedMeta }
