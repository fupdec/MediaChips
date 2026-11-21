import {afterEach, beforeEach, describe, expect, it} from 'vitest'
import {
  BACKGROUND_RUN_LINGER_MS,
  listBackgroundTasks,
  registerBackgroundTaskProvider,
  resetBackgroundTasksForTests,
  setBackgroundTasksClockForTests,
  trackBackgroundWork,
} from './backgroundTasks'

describe('backgroundTasks registry', () => {
  let now = 1_000_000
  beforeEach(() => {
    resetBackgroundTasksForTests()
    now = 1_000_000
    setBackgroundTasksClockForTests(() => now)
  })
  afterEach(() => resetBackgroundTasksForTests())

  it('reports nothing while idle', () => {
    expect(listBackgroundTasks()).toEqual([])
  })

  it('shows a worker run while a unit is in flight and counts it when done', async () => {
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const pending = trackBackgroundWork('nasAssets', () => gate)
    now += 500
    expect(listBackgroundTasks()).toEqual([
      {id: 'nasAssets', kind: 'nasAssets', processed: 0, total: null, unit: 'items', runningMs: 500},
    ])
    release()
    await pending
    expect(listBackgroundTasks()[0]).toMatchObject({kind: 'nasAssets', processed: 1})
  })

  it('counts failed units and rethrows the error', async () => {
    await expect(trackBackgroundWork('cloudMetadata', async () => { throw new Error('offline') })).rejects.toThrow('offline')
    expect(listBackgroundTasks()[0]).toMatchObject({kind: 'cloudMetadata', processed: 1})
  })

  it('keeps one run across ticks seconds apart and ends it after the linger window', async () => {
    await trackBackgroundWork('remoteFingerprint', async () => {})
    now += 10_000
    await trackBackgroundWork('remoteFingerprint', async () => {})
    expect(listBackgroundTasks()[0]).toMatchObject({processed: 2, runningMs: 10_000})

    now += BACKGROUND_RUN_LINGER_MS + 1
    expect(listBackgroundTasks()).toEqual([])

    await trackBackgroundWork('remoteFingerprint', async () => {})
    expect(listBackgroundTasks()[0]).toMatchObject({processed: 1, runningMs: 0})
  })

  it('merges provider jobs, tracks how long they have run and drops finished ones', () => {
    let jobs = [{id: 'copyDiscovery:a', kind: 'copyDiscovery' as const, processed: 3, total: 10, unit: 'items' as const}]
    const unregister = registerBackgroundTaskProvider(() => jobs)
    expect(listBackgroundTasks()).toEqual([{...jobs[0], runningMs: 0}])
    now += 4000
    expect(listBackgroundTasks()[0].runningMs).toBe(4000)

    jobs = []
    expect(listBackgroundTasks()).toEqual([])
    jobs = [{id: 'copyDiscovery:a', kind: 'copyDiscovery', processed: 1, total: 10, unit: 'items'}]
    expect(listBackgroundTasks()[0].runningMs).toBe(0)

    unregister()
    expect(listBackgroundTasks()).toEqual([])
  })

  it('skips a provider that throws and still reports the others', () => {
    registerBackgroundTaskProvider(() => { throw new Error('library switching') })
    registerBackgroundTaskProvider(() => [{id: 'sourceCatalog:x', kind: 'sourceCatalog', processed: 5, total: null, unit: 'items'}])
    expect(listBackgroundTasks().map(task => task.id)).toEqual(['sourceCatalog:x'])
  })
})
