import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, reactive} from 'vue'
import type {BackgroundTaskSnapshot} from '@shared/backgroundTasks'
import {useBackgroundTasksSync} from './useBackgroundTasksSync'
import {backgroundTasksApi} from '@/services/typedApi/backgroundTasks'

const stores = vi.hoisted(() => ({app: {dbPath: 'a'}, tasks: {
  list: [] as Array<{id: string}>, setTask: vi.fn(), updateTask: vi.fn(), removeTask: vi.fn(),
}}))
vi.mock('@/stores/app', () => ({useAppStore: () => stores.app}))
vi.mock('@/stores/tasks', () => ({useTasksStore: () => stores.tasks}))
vi.mock('vue-i18n', () => ({useI18n: () => ({t: (key: string) => key})}))
vi.mock('@/services/formatUtils', () => ({getReadableFileSize: String}))
vi.mock('@/services/typedApi/backgroundTasks', () => ({backgroundTasksApi: {list: vi.fn()}}))

const cleanups: Array<() => void> = []
beforeEach(() => {
  vi.useFakeTimers()
  vi.resetAllMocks()
  stores.app = reactive({dbPath: 'a'})
  stores.tasks.list = []
  stores.tasks.setTask.mockImplementation(() => {
    const id = `ui-${stores.tasks.list.length}`
    stores.tasks.list.push({id})
    return id
  })
  Object.defineProperty(document, 'hidden', {configurable: true, value: false})
})
afterEach(() => { cleanups.splice(0).forEach(fn => fn()); vi.useRealTimers() })
function setup() {
  const app = createApp({setup() { useBackgroundTasksSync(); return () => null }})
  app.mount(document.createElement('div'))
  cleanups.push(() => app.unmount())
}
function response(id?: string) {
  const tasks: BackgroundTaskSnapshot[] = id ? [{id, kind: 'nasAssets', processed: 2, total: 10,
    unit: 'items', runningMs: 3000}] : []
  return {data: {tasks}}
}
function deferred() {
  let resolve!: (value: ReturnType<typeof response>) => void
  const promise = new Promise<ReturnType<typeof response>>(done => { resolve = done })
  return {promise, resolve}
}
async function flush(ms = 0) { await vi.advanceTimersByTimeAsync(ms) }

describe('background task polling lifecycle', () => {
  it('does not recreate tasks from a response received after disposal', async () => {
    const old = deferred()
    vi.mocked(backgroundTasksApi.list).mockReturnValueOnce(old.promise as never)
    setup()
    const signal = vi.mocked(backgroundTasksApi.list).mock.calls[0][0]
    cleanups.pop()!()
    expect(signal?.aborted).toBe(true)
    old.resolve(response('old'))
    await flush(20_000)
    expect(stores.tasks.setTask).not.toHaveBeenCalled()
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts a fresh poll immediately on library change and ignores the old response', async () => {
    const old = deferred()
    vi.mocked(backgroundTasksApi.list).mockReturnValueOnce(old.promise as never)
      .mockResolvedValue(response('new') as never)
    setup()
    const signal = vi.mocked(backgroundTasksApi.list).mock.calls[0][0]
    stores.app.dbPath = 'b'
    expect(signal?.aborted).toBe(true)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(2)
    await flush()
    old.resolve(response('old'))
    await flush()
    expect(stores.tasks.setTask).toHaveBeenCalledTimes(1)
    await flush(2000)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(3)
    expect(stores.tasks.updateTask).toHaveBeenCalledTimes(1)
  })

  it('ignores an old response after switching A -> B -> A', async () => {
    const first = deferred(), second = deferred(), third = deferred()
    vi.mocked(backgroundTasksApi.list).mockReturnValueOnce(first.promise as never)
      .mockReturnValueOnce(second.promise as never).mockReturnValueOnce(third.promise as never)
    setup()
    stores.app.dbPath = 'b'
    stores.app.dbPath = 'a'
    third.resolve(response('current'))
    await flush()
    first.resolve(response('stale-a'))
    second.resolve(response('stale-b'))
    await flush()
    expect(stores.tasks.setTask).toHaveBeenCalledTimes(1)
    expect(stores.tasks.updateTask).not.toHaveBeenCalled()
    expect(stores.tasks.removeTask).not.toHaveBeenCalled()
  })

  it('removes mirrored tasks and replaces an idle timer when switching libraries', async () => {
    vi.mocked(backgroundTasksApi.list).mockResolvedValueOnce(response('old') as never)
      .mockResolvedValue(response() as never)
    setup()
    await flush()
    stores.app.dbPath = 'b'
    await flush()
    expect(stores.tasks.removeTask).toHaveBeenCalledExactlyOnceWith('ui-0')
    await flush(2000)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(2)
    await flush(6000)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(3)
  })

  it('recovers from a failed poll without overlapping requests', async () => {
    vi.mocked(backgroundTasksApi.list).mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValue(response() as never)
    setup()
    await flush(7999)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(1)
    await flush(1)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(2)
  })

  it('skips network requests while the document is hidden', async () => {
    Object.defineProperty(document, 'hidden', {configurable: true, value: true})
    vi.mocked(backgroundTasksApi.list).mockResolvedValue(response() as never)
    setup()
    await flush(8000)
    expect(backgroundTasksApi.list).not.toHaveBeenCalled()
    Object.defineProperty(document, 'hidden', {configurable: true, value: false})
    await flush(8000)
    expect(backgroundTasksApi.list).toHaveBeenCalledTimes(1)
  })
})
