import {typedApi} from '@/services/typedApi'
import {useDialogsStore} from '@/stores/dialogs'
import {reloadTagsCatalog} from '@/composable/appCatalogs'
import {getErrorResponseData} from '@/types/vue'
import type {CreateTagPayload} from '@shared/api/payloads'
import type {Tag} from '@/types/stores'

export type TrashNameConflictTag = {
  id: number
  name: string
  metaId?: number | null
  deletedAt?: string
}

function getTrashNameConflict(error: unknown): {tags: TrashNameConflictTag[]; ids: number[]} | null {
  const data = getErrorResponseData<{
    code?: string
    tags?: TrashNameConflictTag[]
    ids?: number[]
  }>(error)
  if (!data || data.code !== 'name_in_trash') return null
  const tags = Array.isArray(data.tags) ? data.tags.filter((tag) => Number(tag.id) > 0) : []
  const ids = Array.isArray(data.ids)
    ? data.ids.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0)
    : tags.map((tag) => Number(tag.id))
  if (!tags.length && !ids.length) return null
  return {tags, ids}
}

export async function createTagsInteractive(body: CreateTagPayload[]): Promise<Tag[] | null> {
  try {
    const response = await typedApi.createTags(body)
    return response.data
  } catch (error) {
    const conflict = getTrashNameConflict(error)
    if (!conflict) throw error

    const dialogsStore = useDialogsStore()
    const action = await dialogsStore.promptTagTrashConflict(
      conflict.tags.length
        ? conflict.tags
        : conflict.ids.map((id) => ({id, name: ''})),
    )
    if (action === 'cancel') return null

    const response = await typedApi.createTags(body, {onTrashNameConflict: action})
    await reloadTagsCatalog()
    return response.data
  }
}
