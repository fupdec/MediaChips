import {beforeEach, describe, expect, it, vi} from 'vitest'
import {createPinia, setActivePinia} from 'pinia'

const createTags = vi.hoisted(() => vi.fn())
const reloadTagsCatalog = vi.hoisted(() => vi.fn().mockResolvedValue(undefined))

vi.mock('@/services/typedApi', () => ({
  typedApi: {createTags},
}))

vi.mock('@/composable/appCatalogs', () => ({
  reloadTagsCatalog,
}))

import {useDialogsStore} from '@/stores/dialogs'
import {createTagsInteractive} from './createTagsInteractive'

describe('createTagsInteractive', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('returns created tags when there is no trash conflict', async () => {
    createTags.mockResolvedValue({data: [{id: 9, name: 'Alice'}]})
    const created = await createTagsInteractive([{name: 'Alice', metaId: 1}])
    expect(created).toEqual([{id: 9, name: 'Alice'}])
    expect(createTags).toHaveBeenCalledWith([{name: 'Alice', metaId: 1}])
  })

  it('retries with restore after the trash dialog', async () => {
    createTags
      .mockRejectedValueOnce({
        response: {
          data: {
            code: 'name_in_trash',
            tags: [{id: 4, name: 'Alice', metaId: 1}],
            ids: [4],
          },
        },
      })
      .mockResolvedValueOnce({data: [{id: 4, name: 'Alice', metaId: 1}]})

    const dialogs = useDialogsStore()
    const prompt = createTagsInteractive([{name: 'Alice', metaId: 1}])
    await vi.waitFor(() => {
      expect(dialogs.tagTrashConflict.show).toBe(true)
    })
    dialogs.closeTagTrashConflict('restore')

    await expect(prompt).resolves.toEqual([{id: 4, name: 'Alice', metaId: 1}])
    expect(createTags).toHaveBeenLastCalledWith(
      [{name: 'Alice', metaId: 1}],
      {onTrashNameConflict: 'restore'},
    )
    expect(reloadTagsCatalog).toHaveBeenCalled()
  })

  it('returns null when the trash dialog is cancelled', async () => {
    createTags.mockRejectedValueOnce({
      response: {
        data: {
          code: 'name_in_trash',
          tags: [{id: 4, name: 'Alice'}],
          ids: [4],
        },
      },
    })

    const dialogs = useDialogsStore()
    const prompt = createTagsInteractive([{name: 'Alice', metaId: 1}])
    await vi.waitFor(() => {
      expect(dialogs.tagTrashConflict.show).toBe(true)
    })
    dialogs.closeTagTrashConflict('cancel')

    await expect(prompt).resolves.toBeNull()
    expect(createTags).toHaveBeenCalledTimes(1)
  })
})
