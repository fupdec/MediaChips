import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {createApp, reactive} from 'vue'
import {createPinia, setActivePinia} from 'pinia'
import {useTasksStore} from '@/stores/tasks'
import {useAppStore} from '@/stores/app'
import {useRemoteMediaAddingProcess} from './useRemoteMediaAddingProcess'
import {resetMediaAddingRun} from '@/services/mediaAddingRun'

const notify = vi.hoisted(() => vi.fn())
vi.mock('@/services/notificationService', () => ({setNotification: notify}))
vi.mock('@/services/desktopChrome', () => ({scheduleDesktopChromeSync: vi.fn()}))

const mounted: ReturnType<typeof createApp>[] = []
beforeEach(() => { setActivePinia(createPinia()); vi.clearAllMocks() })
afterEach(() => { mounted.splice(0).forEach(app => app.unmount()) })
function setup() {
  let process!: ReturnType<typeof useRemoteMediaAddingProcess>
  const app = createApp({setup() { process = useRemoteMediaAddingProcess(key => key); return () => null }})
  app.mount(document.createElement('div'))
  mounted.push(app)
  const snapshot = reactive({scanning: true, stopped: false, processed: 0, total: 0,
    found: 0, skipped: 0, inLibrary: 0, remaining: 2, errors: [] as Array<{path: string; message: string}>})
  const stop = vi.fn()
  const retry = vi.fn(async () => {})
  const begin = () => process.begin({source: 'Studio NAS', snapshot: () => snapshot,
    readablePath: path => `/Readable/${path}`, stop, retry})
  return {process, snapshot, stop, retry, begin, task: useTasksStore().mediaAdding, tasks: useTasksStore()}
}

describe('shared media import process', () => {
  it('publishes scan, import, tag and error results into the local process model', () => {
    const {begin, snapshot, task, tasks} = setup()
    const run = begin()!
    expect(task.dialogProcess).toBe(true)
    expect(task.active).toBe(true)
    expect(task.status).toBe('media.adding.scanning_files')
    snapshot.found = 2
    snapshot.scanning = false
    snapshot.total = 2
    run.record('movie.mp4', 31, true)
    run.recordExisting('old.mp4')
    run.phase('tagging')
    expect(task.status).toBe('media.adding.adding_metadata')
    snapshot.processed = 2
    snapshot.remaining = 1
    snapshot.errors.push({path: 'other.mp4', message: 'Permission denied'})
    run.finish()
    expect(task.addedMedia).toEqual([{path: '/Readable/movie.mp4', mediaId: 31}])
    expect(task.addedTotal).toBe(1)
    expect(task.duplicates).toHaveLength(1)
    expect(task.errors).toEqual(['/Readable/other.mp4: Permission denied'])
    expect(task).toMatchObject({active: false, finished: true, stopped: false, progress: 100,
      status: 'media.adding.complete_with_errors'})
    expect(task.remoteImport?.remaining).toBe(1)
    expect(tasks.list[0]).toMatchObject({done: true, color: 'error'})
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({type: 'error'}))
  })

  it('keeps importing when the process is hidden and reopens from the task', () => {
    const {begin, task, tasks, stop} = setup()
    const run = begin()!
    task.dialogProcess = false
    run.record('movie.mp4', 31, true)
    expect(task.active).toBe(true)
    expect(stop).not.toHaveBeenCalled()
    ;(tasks.list[0].click as () => void)()
    expect(task.dialogProcess).toBe(true)
    expect(task.addedTotal).toBe(1)
  })

  it('accounts for the in-flight request after Stop and retains partial progress for retry', async () => {
    const {begin, snapshot, task, stop, retry} = setup()
    const run = begin()!
    Object.assign(snapshot, {scanning: false, total: 2})
    task.remoteImport!.stop()
    task.remoteImport!.stop()
    expect(stop).toHaveBeenCalledTimes(1)
    expect(task.active).toBe(true)
    expect(task.finished).toBe(false)
    expect(task.status).toBe('media.adding.stopping')
    run.record('movie.mp4', 31, true)
    Object.assign(snapshot, {processed: 1, stopped: true, remaining: 1})
    run.finish()
    expect(task).toMatchObject({active: false, finished: true, stopped: true, progress: 50, addedTotal: 1})
    await task.remoteImport!.retry!()
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('blocks another import while a local or remote run is active', () => {
    const {begin, task} = setup()
    task.active = true
    task.added = ['local.mp4']
    expect(begin()).toBeNull()
    expect(task.added).toEqual(['local.mp4'])
    task.active = false
    expect(begin()).not.toBeNull()
    expect(begin()).toBeNull()
  })

  it('ignores late results and old retry controls after switching libraries', async () => {
    const {begin, snapshot, task, retry} = setup()
    const old = begin()!
    snapshot.scanning = false
    snapshot.total = 2
    snapshot.errors.push({path: 'file.mp4', message: 'Offline'})
    old.finish()
    const retryOld = task.remoteImport!.retry!
    useAppStore().dbPath = '/another-library'
    expect(task.dialogProcess).toBe(false)
    const current = begin()!
    old.record('late.mp4', 20, true)
    old.finish()
    await retryOld()
    expect(retry).not.toHaveBeenCalled()
    expect(task.active).toBe(true)
    expect(task.added).toEqual([])
    current.record('current.mp4', 21, true)
    expect(task.added).toEqual(['/Readable/current.mp4'])
  })

  it('clears remote controls and prior results when a new local run starts', () => {
    const {begin, task} = setup()
    begin()!.record('movie.mp4', 31, true)
    task.paths = '/local'
    task.is_exclude = true
    resetMediaAddingRun(task)
    expect(task.remoteImport).toBeNull()
    expect(task.addedTotal).toBe(0)
    expect(task.addedMedia).toEqual([])
    expect(task.paths).toBe('/local')
    expect(task.is_exclude).toBe(true)
  })
})
