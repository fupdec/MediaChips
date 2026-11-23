import {beforeEach, describe, expect, it, vi} from 'vitest'
import useItemContextMenu from './ItemContextMenu'
import type {MediaItem, Tag} from '@/types/stores'

const mocks = vi.hoisted(() => ({
  items: {} as any,
  app: {} as any,
  dialogs: {confirm: {} as any, openMediaMerge: vi.fn()},
  update: vi.fn(), close: vi.fn(), remove: vi.fn(), notify: vi.fn(), deleteOne: vi.fn(), deleteMany: vi.fn(), startJob: vi.fn(), stopJob: vi.fn(), resumeJob: vi.fn(), basics: vi.fn(),
}))
vi.mock('@/stores/items', () => ({useItemsStore: () => mocks.items}))
vi.mock('@/stores/app', () => ({useAppStore: () => mocks.app}))
vi.mock('@/stores/dialogs', () => ({useDialogsStore: () => mocks.dialogs}))
vi.mock('@/stores/settings', () => ({useSettingsStore: () => ({locale: 'en'})}))
vi.mock('@/stores/notifications', () => ({useNotificationsStore: () => ({setNotification: mocks.notify, updateNotification: mocks.update, closeNotification: mocks.close})}))
vi.mock('@/stores/operations', () => ({useOperationsStore: () => ({moving: {active: false}})}))
vi.mock('@/stores/tasks', () => ({useTasksStore: () => ({})}))
vi.mock('@/stores/sessionFocus', () => ({useSessionFocusStore: () => ({})}))
vi.mock('@/utils/eventBus', () => ({useEventBus: () => ({emit: vi.fn()})}))
vi.mock('@/composable/itemsListSync', () => ({useItemsListSync: () => ({removeEntitiesFromState: mocks.remove})}))
vi.mock('@/composable/appCatalogs', () => ({reloadTagsCatalog: vi.fn(), reloadTabsCatalog: vi.fn()}))
vi.mock('@/composable/useMoveTagsToCategory', () => ({useMoveTagsToCategory: () => ({})}))
vi.mock('@/utils/openMediaList', () => ({useOpenMediaList: () => ({})}))
vi.mock('@/composable/useSessionFocusActions', () => ({useSessionFocusActions: () => ({})}))
vi.mock('@mediachips/plugin-adult/stores/scraper', () => ({useScraperStore: () => ({})}))
vi.mock('@mediachips/plugin-adult/stores/sceneScraper', () => ({useSceneScraperStore: () => ({})}))
vi.mock('@mediachips/plugin-adult/composables/useAutoScrapeBatch', () => ({useAutoScrapeBatch: () => ({})}))
vi.mock('@mediachips/plugin-adult/composables/useAutoSceneScrapeBatch', () => ({useAutoSceneScrapeBatch: () => ({})}))
vi.mock('@mediachips/plugin-tmdb/composables/useTmdbPersonAutoScrapeBatch', () => ({useTmdbPersonAutoScrapeBatch: () => ({})}))
vi.mock('@/services/typedApi', () => ({typedApi: {
  deleteEntityOne: mocks.deleteOne, deleteMediaMany: mocks.deleteMany, startMediaDeleteJob: mocks.startJob, stopMediaDeleteJob: mocks.stopJob, resumeMediaDeleteJob: mocks.resumeJob, getMediaDeleteJob: vi.fn(), getMediaBasics: mocks.basics,
}}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.dialogs.confirm = {}
  mocks.app = {tags: [], playlists: [], mediaTypes: []}
  mocks.items = {isSelect: true, selection: [1, 2], entities: [], environment: {}}
})

describe('deletion of a selection', () => {
  it('keeps failed tags selected and removes only confirmed successes, including off-page tags', async () => {
    const first = {id: 1, name: 'first', metaId: 5} as Tag
    mocks.items.entities = [first]
    mocks.app.tags = [first, {id: 2, name: 'off page', metaId: 5}]
    mocks.deleteOne.mockResolvedValueOnce({data: {}}).mockRejectedValueOnce(new Error('offline'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    useItemContextMenu(first, 'tag', null, true, null).deleteItem()
    await mocks.dialogs.confirm.action()
    expect(mocks.deleteOne.mock.calls.map(([, body]) => body.id)).toEqual([1, 2])
    expect(mocks.remove).toHaveBeenCalledWith({ids: [1], type: 'tag'})
    expect(mocks.items.selection).toEqual([2])
    expect(mocks.items.isSelect).toBe(true)
    expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({type: 'warning'}))
    errorLog.mockRestore()
  })

  it('does not remove anything when every request fails', async () => {
    const first = {id: 1, name: 'first', metaId: 5} as Tag
    mocks.app.tags = [first, {id: 2, name: 'second', metaId: 5}]
    mocks.deleteOne.mockRejectedValue(new Error('offline'))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    useItemContextMenu(first, 'tag', null, true, null).deleteItem()
    await mocks.dialogs.confirm.action()
    expect(mocks.remove).toHaveBeenCalledWith({ids: [], type: 'tag'})
    expect(mocks.items.selection).toEqual([1, 2])
    errorLog.mockRestore()
  })

  it('uses the confirmed ID snapshot and preserves failures from a media job', async () => {
    const first = {id: 1, path: '/first.mp4', name: 'first'} as MediaItem
    mocks.items.entities = [first]
    mocks.startJob.mockResolvedValue({data: {id: 'j', status: 'completed', total: 2, processed: 2, doneIds: [1], failedIds: [2], doneCount: 1, failedCount: 1, remaining: 0}})
    useItemContextMenu(first, 'media', null, true, null).deleteItem()
    mocks.items.selection = [3]
    await mocks.dialogs.confirm.action()
    expect(mocks.startJob).toHaveBeenCalledWith(expect.objectContaining({ids: [1, 2]}))
    expect(mocks.remove).toHaveBeenCalledWith({ids: [1], type: 'media'})
    expect(mocks.items.selection).toEqual([2])
  })
})


describe('merging a selection across pages', () => {
  it('loads every selected media item before opening the merge dialog', async () => {
    const first = {id: 1, path: '/first.jpg', name: 'first'} as MediaItem
    mocks.items.entities = [first]
    mocks.basics.mockResolvedValue({data: {items: [{id: 2, path: '/second.jpg', name: 'off page'}]}})
    const menu = useItemContextMenu(first, 'media', null, true, null).getContextMenu()
    await menu.find(entry => entry.icon === 'set-merge')!.action!()
    expect(mocks.dialogs.openMediaMerge).toHaveBeenCalledWith([
      first, expect.objectContaining({id: 2}),
    ])
  })

  it('does not open a partial merge when a selected file no longer exists', async () => {
    const first = {id: 1, path: '/first.jpg', name: 'first'} as MediaItem
    mocks.items.entities = [first]
    mocks.basics.mockResolvedValue({data: {items: []}})
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const menu = useItemContextMenu(first, 'media', null, true, null).getContextMenu()
    await menu.find(entry => entry.icon === 'set-merge')!.action!()
    expect(mocks.dialogs.openMediaMerge).not.toHaveBeenCalled()
    expect(mocks.items.selection).toEqual([1, 2])
    expect(mocks.items.isSelect).toBe(true)
    errorLog.mockRestore()
  })
})


describe('stopping batch deletion', () => {
  it('offers to continue a stopped job on the same server job and drops finished ids from the selection', async () => {
    const first = {id: 1, path: '/first.mp4', name: 'first'} as MediaItem
    mocks.items.entities = [first]
    mocks.items.selection = [1, 2, 3]
    mocks.startJob.mockResolvedValue({data: {id: 'j', status: 'stopped', total: 3, processed: 1, doneIds: [1], failedIds: [], doneCount: 1, failedCount: 0, remaining: 2}})
    mocks.resumeJob.mockResolvedValue({data: {id: 'j', status: 'completed', total: 3, processed: 3, doneIds: [1, 2, 3], failedIds: [], doneCount: 3, failedCount: 0, remaining: 0}})
    useItemContextMenu(first, 'media', null, true, null).deleteItem()
    await mocks.dialogs.confirm.action()
    expect(mocks.items.selection).toEqual([2, 3])
    const stopped = mocks.notify.mock.calls.map(([n]) => n).find(n => n.actions?.some((a: any) => a.id === 'delete-resume'))
    stopped.actions[0].action()
    await vi.waitFor(() => expect(mocks.items.selection).toEqual([]))
    expect(mocks.resumeJob).toHaveBeenCalledWith('j')
  })

  it('keeps failed and unprocessed files selected', async () => {
    const first = {id: 1, path: '/first.mp4', name: 'first'} as MediaItem
    mocks.items.entities = [first]
    mocks.items.selection = Array.from({length: 501}, (_, i) => i + 1)
    mocks.notify.mockReturnValue(7)
    mocks.startJob.mockResolvedValue({data: {
      id: 'j', status: 'stopped', total: 501, processed: 500,
      doneIds: Array.from({length: 499}, (_, i) => i + 1), failedIds: [500],
      doneCount: 499, failedCount: 1, remaining: 1,
    }})
    useItemContextMenu(first, 'media', null, true, null).deleteItem()
    await mocks.dialogs.confirm.action()
    expect(mocks.startJob).toHaveBeenCalledTimes(1)
    expect(mocks.items.selection).toEqual([500, 501])
    expect(mocks.items.isSelect).toBe(true)
  })
})


it('retries a ZIP gallery through another selected entry after a failed request', async () => {
  const first = {id: 1, path: '/gallery.zip!/first.jpg', name: 'first'} as MediaItem
  const second = {id: 2, path: '/gallery.zip!/second.jpg', name: 'second'} as MediaItem
  mocks.items.entities = [first]
  mocks.basics.mockResolvedValue({data: {items: [second]}})
  mocks.deleteOne.mockReset()
  mocks.deleteOne.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({data: {deletedIds: [1, 2, 3]}})
  const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
  useItemContextMenu(first, 'media', null, true, null).deleteItem()
  mocks.dialogs.confirm.checkBox = true
  await mocks.dialogs.confirm.action()
  expect(mocks.deleteOne.mock.calls.map(([, body]) => body.id)).toEqual([1, 2])
  expect(mocks.remove).toHaveBeenCalledWith({ids: [1, 2, 3], type: 'media'})
  expect(mocks.items.selection).toEqual([])
  errorLog.mockRestore()
})
